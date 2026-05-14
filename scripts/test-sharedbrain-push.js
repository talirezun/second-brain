#!/usr/bin/env node
/**
 * Shared Brain — Phase 2B Battle Test (push orchestration + delta)
 *
 * Validates the delta module + pushDomain orchestration by simulating a real
 * cohort end-to-end:
 *
 *   - Spins up an isolated /tmp folder as the "shared storage root"
 *   - Creates THREE separate "fellow workspaces" — each with its own domains
 *     folder + its own connection — pointing at the same shared storage
 *   - Each fellow has wiki pages on disk (entities, concepts, summaries)
 *   - Each pushes with a MOCK LLM (no real Gemini call) and the test
 *     verifies the resulting contribution payloads land correctly
 *
 * Scenarios:
 *   1. Pure delta helpers: extractTitle / extractWikilinks / classifyPage
 *   2. Cross-domain link filter (Decision 2 — strict)
 *   3. Jaccard similarity buckets (Decision 4)
 *   4. generateDeltaSummary with happy-path mock LLM
 *   5. generateDeltaSummary with failing mock LLM → fallback returned
 *   6. pushDomain happy path — 3-fellow cohort, each pushes different pages
 *   7. pushDomain security gate — refuses domain not in local_domains
 *   8. pushDomain LLM failure tracking — pending_retry counter increments
 *   9. pushDomain permanent_skip after 3 failures
 *  10. pushDomain idempotency — second push with no changes returns 0 pushed
 *
 * Run with:  node scripts/test-sharedbrain-push.js
 * Exit code 0 if all green; non-zero on any failure.
 *
 * This test does NOT call any real LLM and does NOT touch your production
 * .sharedbrain-config.json or domains folder. It uses isolated /tmp folders
 * and an in-memory patch function for connection state.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import { LocalFolderStorageAdapter } from '../src/brain/sharedbrain-local-adapter.js';
import {
  extractTitle, extractWikilinks, classifyPage, filterToDomainLinks,
  jaccardSimilarity, tokenize,
  buildDeltaPrompt, buildFallbackDelta, generateDeltaSummary,
} from '../src/brain/sharedbrain-delta.js';
import {
  pushDomain, findChangedPages, getAllPagePaths, MAX_RETRY_ATTEMPTS,
} from '../src/brain/sharedbrain.js';

// ── Test harness (same shape as Phase 2A) ──────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(label)        { passed++; console.log(`  ✓ ${label}`); }
function fail(label, err) { failed++; failures.push({ label, err }); console.log(`  ✗ ${label}`); if (err) console.log(`    └─ ${err.message || err}`); }
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(label);
  else fail(label, new Error(`expected ${e}, got ${a}`));
}
function assert(cond, label, errMsg) {
  if (cond) ok(label);
  else fail(label, new Error(errMsg || 'assertion failed'));
}
function section(name) { console.log(`\n── ${name} ──`); }

// ── Setup: an isolated workspace tree ──────────────────────────────────────

const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'sharedbrain-2b-'));
const storageRoot   = path.join(workspaceRoot, 'shared-storage');
mkdirSync(storageRoot, { recursive: true });

console.log(`Phase 2B workspace: ${workspaceRoot}`);
console.log(`Shared storage:     ${storageRoot}`);

// Each fellow gets their own domains-dir. They share storageRoot.
function makeFellowWorkspace(label) {
  const domainsDir = path.join(workspaceRoot, `${label}-domains`);
  mkdirSync(domainsDir, { recursive: true });
  return domainsDir;
}

function makeDomain(domainsDir, domainSlug) {
  const wikiDir = path.join(domainsDir, domainSlug, 'wiki');
  mkdirSync(path.join(wikiDir, 'entities'),  { recursive: true });
  mkdirSync(path.join(wikiDir, 'concepts'),  { recursive: true });
  mkdirSync(path.join(wikiDir, 'summaries'), { recursive: true });
  return wikiDir;
}

function writePage(wikiDir, relPath, content, mtimeOverride = null) {
  const abs = path.join(wikiDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  if (mtimeOverride) {
    const t = mtimeOverride instanceof Date ? mtimeOverride : new Date(mtimeOverride);
    utimesSync(abs, t, t);
  }
}

// Mock LLM — returns a canned DeltaSummary-ish JSON. Configurable per page.
function makeMockLLM(pageResponses = {}, defaultBehaviour = 'echo') {
  return async (_system, user, _maxTokens) => {
    // Extract PAGE PATH from the user prompt so we can look up the canned response.
    const pathMatch = user.match(/PAGE PATH:\s*(\S+)/);
    const pagePath = pathMatch ? pathMatch[1] : '';
    const canned = pageResponses[pagePath];

    if (canned === 'throw') {
      throw new Error(`mock LLM: simulated failure for ${pagePath}`);
    }
    if (canned === 'malformed') {
      return 'not json at all { broken';
    }
    if (canned && typeof canned === 'object') {
      return JSON.stringify(canned);
    }
    if (defaultBehaviour === 'echo') {
      // Default canned response: title from path, no facts, no links.
      const slug = pagePath.replace(/^(entities|concepts|summaries)\//, '').replace(/\.md$/, '');
      return JSON.stringify({
        title: slug,
        new_facts: [`Default fact about ${slug}.`],
        stable_facts: [],
        new_links: [],
        removed_links: [],
        key_entities: [],
      });
    }
    throw new Error(`mock LLM: no canned response for ${pagePath}`);
  };
}

// In-memory replacement for patchSharedBrain — tests track state without writing config.
function makePatchFn(connectionsById) {
  return (id, patch) => {
    const existing = connectionsById[id];
    if (!existing) return null;
    // Reject token-field updates the way the real patchSharedBrain does.
    for (const field of ['github_pat', 'fellow_token', 'admin_token']) {
      if (field in patch) {
        throw new Error(`patchSharedBrain: cannot update credential field "${field}" via patch`);
      }
    }
    connectionsById[id] = { ...existing, ...patch };
    return connectionsById[id];
  };
}

function makeConnection(label, fellowDisplayName, domainsDir) {
  return {
    id: randomUUID(),
    label,
    storage_type: 'local',
    local_storage_path: storageRoot,
    fellow_id: randomUUID(),
    fellow_display_name: fellowDisplayName,
    shared_domain: 'work-ai',
    shared_brain_slug: 'test-cohort',
    local_domains: ['work-ai'],
    last_push_at: null,
    pending_retry: {},
    permanent_skip: [],
    enabled: true,
    // domainsDir is passed via opts to pushDomain; not part of the connection schema
    __testDomainsDir: domainsDir,
  };
}

// ─── 1. Pure delta helpers ────────────────────────────────────────────────

section('Delta helpers (pure functions)');

assertEq(extractTitle('# Foo Bar\n\nbody'), 'Foo Bar', 'extractTitle reads first H1');
assertEq(extractTitle('no heading here'), 'Untitled', 'extractTitle falls back to "Untitled"');
assertEq(extractTitle(''), 'Untitled', 'extractTitle handles empty');
assertEq(extractTitle(null), 'Untitled', 'extractTitle handles null');

assertEq(
  extractWikilinks('See [[foo]] and [[concepts/bar]] and [[entities/baz]].'),
  ['foo', 'bar', 'baz'],
  'extractWikilinks strips folder prefixes'
);
assertEq(extractWikilinks('no links here'), [], 'extractWikilinks returns empty when no links');

assertEq(classifyPage('entities/foo.md'),  'entity',  'classifyPage entity');
assertEq(classifyPage('concepts/foo.md'),  'concept', 'classifyPage concept');
assertEq(classifyPage('summaries/foo.md'), 'summary', 'classifyPage summary');
assertEq(classifyPage('other/foo.md'),     'unknown', 'classifyPage unknown');

// ─── 2. Cross-domain link filter (Decision 2, strict) ────────────────────

section('filterToDomainLinks — strict cross-domain stripping (Decision 2)');

const domainPaths = [
  'entities/anthropic.md',
  'entities/openai.md',
  'concepts/rag.md',
  'summaries/foo.md',
];

assertEq(
  filterToDomainLinks(['anthropic', 'openai'], domainPaths),
  ['anthropic', 'openai'],
  'in-domain links pass through'
);
assertEq(
  filterToDomainLinks(['anthropic', 'tali-rezun'], domainPaths),
  ['anthropic'],
  'out-of-domain link stripped (tali-rezun is in a different domain)'
);
assertEq(
  filterToDomainLinks(['concepts/rag'], domainPaths),
  ['rag'],
  'folder-prefixed link normalised'
);
assertEq(
  filterToDomainLinks(['Anthropic', 'ANTHROPIC'], domainPaths),
  ['Anthropic'],
  'case-insensitive match + dedup'
);
assertEq(
  filterToDomainLinks(['Anthropic Inc'], domainPaths),  // would normalise to "anthropic-inc"
  [],
  'multi-word link without matching slug is stripped'
);
assertEq(filterToDomainLinks([], domainPaths), [], 'empty input → empty output');
assertEq(filterToDomainLinks(['foo'], []), [], 'empty domain → all links stripped');
assertEq(
  filterToDomainLinks(['anthropic'], domainPaths).length,
  1,
  'duplicate detection counts once'
);

// ─── 3. Jaccard similarity buckets (Decision 4) ───────────────────────────

section('jaccardSimilarity — contradiction-detection buckets (Decision 4)');

const identical = jaccardSimilarity(
  'Context Engineering coined in 2024 by Anthropic',
  'context engineering coined in 2024 by anthropic'
);
assert(identical === 1.0, `identical strings → 1.0 (got ${identical})`);

const conflicting = jaccardSimilarity(
  'Context Engineering coined in 2024 by Anthropic',
  'Context Engineering coined in 2023 by Anthropic'
);
assert(
  conflicting >= 0.5 && conflicting < 1.0,
  `same fact different year → 0.5 ≤ s < 1.0 (got ${conflicting})`
);

const independent = jaccardSimilarity(
  'Anthropic is an AI safety company',
  'OpenAI builds GPT-class language models'
);
assert(
  independent < 0.5,
  `unrelated statements → s < 0.5 (got ${independent})`
);

assert(jaccardSimilarity('', '') === 1.0, 'empty/empty → 1.0 (degenerate identical)');
assert(jaccardSimilarity('foo', '') === 0.0, 'foo/empty → 0.0');
assert(jaccardSimilarity('', 'bar') === 0.0, 'empty/bar → 0.0');

// Tokenizer drops stop words and short tokens. It does NOT dedup —
// callers (e.g. jaccardSimilarity) wrap the result in a Set if they need that.
const toks = tokenize('The quick brown fox is a fox.');
assertEq(toks.sort(), ['brown', 'fox', 'fox', 'quick'], 'tokenize drops stop words + short tokens; preserves duplicates');

// ─── 4. generateDeltaSummary — happy path with mock LLM ───────────────────

section('generateDeltaSummary — happy path');

{
  const mockLLM = makeMockLLM({
    'concepts/rag.md': {
      title: 'RAG',
      new_facts: ['Retrieval-augmented generation combines retrieval and LLMs.'],
      stable_facts: [],
      new_links: ['anthropic', 'tali-rezun'],
      removed_links: [],
      key_entities: ['anthropic'],
    },
  });

  const result = await generateDeltaSummary({
    pagePath: 'concepts/rag.md',
    currentContent: '# RAG\n\n[[anthropic]] [[tali-rezun]]\n',
    priorContent: null,
    fellowId: 'fellow-1',
    fellowDisplayName: 'Fellow One',
    domainPagePaths: ['entities/anthropic.md', 'concepts/rag.md'],
    options: { llmFn: mockLLM },
  });

  assert(result.ok, 'happy path returns ok=true');
  assertEq(result.delta.path, 'concepts/rag.md', 'delta carries pagePath');
  assertEq(result.delta.type, 'concept', 'delta type classified');
  assertEq(result.delta.title, 'RAG', 'delta title from LLM');
  assertEq(result.delta.new_facts.length, 1, 'one new fact');
  assertEq(result.delta.new_links, ['anthropic'], 'cross-domain link "tali-rezun" stripped');
  assertEq(result.delta.contributor_id, 'fellow-1', 'delta carries fellow_id');
  assertEq(result.delta.contributor_name, 'Fellow One', 'delta carries display name');
  assertEq(result.delta.full_content_fallback, null, 'fallback is null on success');
}

// ─── 5. generateDeltaSummary — LLM failure returns fallback ───────────────

section('generateDeltaSummary — LLM failures');

{
  const throwLLM = makeMockLLM({ 'concepts/x.md': 'throw' });
  const result = await generateDeltaSummary({
    pagePath: 'concepts/x.md',
    currentContent: '# X\n',
    priorContent: null,
    fellowId: 'f', fellowDisplayName: 'F',
    domainPagePaths: ['concepts/x.md'],
    options: { llmFn: throwLLM },
  });
  assert(!result.ok, 'thrown LLM returns ok=false');
  assert(/LLM call failed/.test(result.error || ''), 'error message mentions LLM');
  assert(result.fallback && result.fallback.full_content_fallback === '# X\n', 'fallback DeltaSummary attached');
  assertEq(result.fallback.path, 'concepts/x.md', 'fallback path matches');
}

{
  const malformedLLM = makeMockLLM({ 'concepts/y.md': 'malformed' });
  const result = await generateDeltaSummary({
    pagePath: 'concepts/y.md',
    currentContent: '# Y\n',
    priorContent: null,
    fellowId: 'f', fellowDisplayName: 'F',
    domainPagePaths: ['concepts/y.md'],
    options: { llmFn: malformedLLM },
  });
  assert(!result.ok, 'malformed LLM JSON returns ok=false');
  assert(/parse failed/.test(result.error || ''), 'error message mentions parse');
  assert(result.fallback, 'fallback attached on parse failure');
}

// ─── 6. pushDomain happy path — 3-fellow cohort ───────────────────────────

section('pushDomain — three fellows push concurrently');

// Fellow A's domain — has 2 wiki pages
const fellowA_DomainsDir = makeFellowWorkspace('fellow-a');
const fellowA_WikiDir = makeDomain(fellowA_DomainsDir, 'work-ai');
writePage(fellowA_WikiDir, 'entities/anthropic.md',
  '# Anthropic\n\nAI safety lab. [[claude]] [[tali-rezun]]\n');
writePage(fellowA_WikiDir, 'concepts/rag.md',
  '# RAG\n\nRetrieval-augmented generation.\n');

// Fellow B's domain — 1 wiki page
const fellowB_DomainsDir = makeFellowWorkspace('fellow-b');
const fellowB_WikiDir = makeDomain(fellowB_DomainsDir, 'work-ai');
writePage(fellowB_WikiDir, 'entities/openai.md',
  '# OpenAI\n\nResearch lab. [[gpt]]\n');

// Fellow C's domain — 1 wiki page
const fellowC_DomainsDir = makeFellowWorkspace('fellow-c');
const fellowC_WikiDir = makeDomain(fellowC_DomainsDir, 'work-ai');
writePage(fellowC_WikiDir, 'concepts/context-engineering.md',
  '# Context Engineering\n\nManaging LLM context windows.\n');

// Connections
const connA = makeConnection('Fellow A', 'Alice', fellowA_DomainsDir);
const connB = makeConnection('Fellow B', 'Bob',   fellowB_DomainsDir);
const connC = makeConnection('Fellow C', 'Carol', fellowC_DomainsDir);

const connections = { [connA.id]: connA, [connB.id]: connB, [connC.id]: connC };
const patchFn = makePatchFn(connections);

// Mock LLM that produces realistic deltas (returns echo'd default for each path)
const mockLLM = makeMockLLM({}, 'echo');

const pushA = await pushDomain(connA, 'work-ai', {
  llmFn: mockLLM,
  domainsDir: fellowA_DomainsDir,
  patchFn,
});
const pushB = await pushDomain(connB, 'work-ai', {
  llmFn: mockLLM,
  domainsDir: fellowB_DomainsDir,
  patchFn,
});
const pushC = await pushDomain(connC, 'work-ai', {
  llmFn: mockLLM,
  domainsDir: fellowC_DomainsDir,
  patchFn,
});

assert(pushA.ok, 'Fellow A push succeeded');
assertEq(pushA.pushed, 2, 'Fellow A pushed 2 pages');
assert(pushA.submission_id, 'Fellow A got a submission_id');

assert(pushB.ok, 'Fellow B push succeeded');
assertEq(pushB.pushed, 1, 'Fellow B pushed 1 page');

assert(pushC.ok, 'Fellow C push succeeded');
assertEq(pushC.pushed, 1, 'Fellow C pushed 1 page');

// Verify the contributions all landed in shared storage
const adapter = new LocalFolderStorageAdapter({ storage_root: storageRoot });
const allContribs = await adapter.listContributionsSince(null);
assertEq(allContribs.length, 3, 'shared storage holds 3 contributions');

const fellowIds = allContribs.map(c => c.fellowId).sort();
assertEq(
  fellowIds,
  [connA.fellow_id, connB.fellow_id, connC.fellow_id].sort(),
  'all three fellow_ids represented'
);

// Verify per-payload contents
const aPayload = allContribs.find(c => c.fellowId === connA.fellow_id).payload;
assertEq(aPayload.deltas.length, 2, 'Fellow A payload contains 2 deltas');
assertEq(aPayload.fellow_display_name, 'Alice', 'Fellow A payload carries display name');
assertEq(aPayload.consent.share_with_brain, true, 'consent flag set');

// Verify cross-domain link filtering happened in deltas (tali-rezun NOT in this domain)
const aAnthropicDelta = aPayload.deltas.find(d => d.path === 'entities/anthropic.md');
assert(
  !aAnthropicDelta.new_links.includes('tali-rezun'),
  'cross-domain link "tali-rezun" filtered out of stored delta'
);

// Verify connection state was updated
assert(connections[connA.id].last_push_at, 'Fellow A last_push_at updated');
assertEq(connections[connA.id].pending_retry, {}, 'Fellow A pending_retry empty after success');
assertEq(connections[connA.id].permanent_skip, [], 'Fellow A permanent_skip empty');

// ─── 7. Security gate — refuse domain not in local_domains ────────────────

section('pushDomain — security gate');

{
  const result = await pushDomain(connA, 'evil-domain', {
    llmFn: mockLLM,
    domainsDir: fellowA_DomainsDir,
    patchFn,
  });
  assert(!result.ok, 'push refused for domain not in local_domains');
  assert(/not in this connection's contribution list/.test(result.error || ''),
    'error message names the problem');
}

{
  const disabledConn = { ...connA, enabled: false };
  const result = await pushDomain(disabledConn, 'work-ai', {
    llmFn: mockLLM,
    domainsDir: fellowA_DomainsDir,
    patchFn,
  });
  assert(!result.ok, 'push refused when enabled=false');
  assert(/disabled/.test(result.error || ''), 'error mentions disabled');
}

// ─── 8. Idempotency: second push with no changes ──────────────────────────

section('pushDomain — idempotency (no changes since last push)');

{
  const secondPush = await pushDomain(connections[connA.id], 'work-ai', {
    llmFn: mockLLM,
    domainsDir: fellowA_DomainsDir,
    patchFn,
  });
  assert(secondPush.ok, 'second push (no changes) returns ok');
  assertEq(secondPush.pushed, 0, 'second push pushes 0 pages');
  assertEq(secondPush.submission_id, null, 'no submission_id when nothing was sent');
}

// Storage still has just 3 contributions (no new payload created)
{
  const stillThree = await adapter.listContributionsSince(null);
  assertEq(stillThree.length, 3, 'shared storage still has 3 contributions after idempotent re-push');
}

// ─── 9. LLM failure tracking: pending_retry counter ───────────────────────

section('pushDomain — pending_retry tracking on LLM failure');

// Fellow D — fresh workspace where every page's LLM call throws
const fellowD_DomainsDir = makeFellowWorkspace('fellow-d');
const fellowD_WikiDir = makeDomain(fellowD_DomainsDir, 'work-ai');
writePage(fellowD_WikiDir, 'entities/x.md', '# X\n');
writePage(fellowD_WikiDir, 'entities/y.md', '# Y\n');

const connD = makeConnection('Fellow D', 'Dana', fellowD_DomainsDir);
connections[connD.id] = connD;

const throwAllLLM = makeMockLLM({
  'entities/x.md': 'throw',
  'entities/y.md': 'throw',
});

const dPush1 = await pushDomain(connD, 'work-ai', {
  llmFn: throwAllLLM,
  domainsDir: fellowD_DomainsDir,
  patchFn,
});

assert(dPush1.ok, 'partial push still returns ok=true (Decision 3)');
assertEq(dPush1.pushed, 0, 'no deltas pushed');
assertEq(dPush1.skipped, 2, 'both pages skipped');
assertEq(
  Object.keys(dPush1.pending_retry).sort(),
  ['entities/x.md', 'entities/y.md'],
  'both failed pages in pending_retry'
);
assertEq(dPush1.pending_retry['entities/x.md'], 1, 'attempt count = 1 after first failure');

// Run two more times to hit MAX_RETRY_ATTEMPTS (3)
await pushDomain(connections[connD.id], 'work-ai', { llmFn: throwAllLLM, domainsDir: fellowD_DomainsDir, patchFn });
const dPush3 = await pushDomain(connections[connD.id], 'work-ai', { llmFn: throwAllLLM, domainsDir: fellowD_DomainsDir, patchFn });

// On the 3rd failure (newCount === MAX_RETRY_ATTEMPTS), pages move to permanent_skip.
assertEq(
  dPush3.permanent_skip.sort(),
  ['entities/x.md', 'entities/y.md'],
  'after 3 failures, pages move to permanent_skip'
);
assertEq(dPush3.pending_retry, {}, 'pending_retry cleared when pages go to permanent_skip');

// Next push should NOT process these pages (they're in permanent_skip and excluded from changedPages)
const dPush4 = await pushDomain(connections[connD.id], 'work-ai', { llmFn: throwAllLLM, domainsDir: fellowD_DomainsDir, patchFn });
assertEq(dPush4.pushed, 0, 'permanent_skip pages not re-processed automatically');
assertEq(dPush4.skipped, 0, 'permanent_skip pages don\'t count as skipped (they\'re ignored entirely)');

// ─── 10. findChangedPages — mtime delta + pending_retry union ─────────────

section('findChangedPages — mtime + pending_retry behaviour');

const fellowE_WikiDir = makeDomain(makeFellowWorkspace('fellow-e'), 'work-ai');
writePage(fellowE_WikiDir, 'entities/old.md', '# Old\n', new Date('2026-01-01T00:00:00Z'));
writePage(fellowE_WikiDir, 'entities/new.md', '# New\n', new Date('2026-05-01T00:00:00Z'));

const allChanged = await findChangedPages(fellowE_WikiDir, null, {});
assertEq(
  allChanged.sort(),
  ['entities/new.md', 'entities/old.md'],
  'findChangedPages(null) returns all pages'
);

const recentOnly = await findChangedPages(
  fellowE_WikiDir, new Date('2026-03-01T00:00:00Z'), {}
);
assertEq(recentOnly, ['entities/new.md'], 'findChangedPages with date filters out older pages');

const withRetry = await findChangedPages(
  fellowE_WikiDir,
  new Date('2026-06-01T00:00:00Z'),  // future → no mtime hits
  { 'entities/old.md': 1 }            // but old.md is in pending_retry
);
assertEq(withRetry, ['entities/old.md'], 'pending_retry pages included even when mtime says no');

const retryGone = await findChangedPages(
  fellowE_WikiDir,
  new Date('2026-06-01T00:00:00Z'),
  { 'entities/deleted.md': 1 }       // page in pending_retry but file is gone
);
assertEq(retryGone, [], 'pending_retry entry for missing file is dropped silently');

// ─── 11. getAllPagePaths — domain page enumeration ────────────────────────

section('getAllPagePaths — domain page enumeration');

const paths = await getAllPagePaths(fellowA_WikiDir);
assertEq(paths.sort(), ['concepts/rag.md', 'entities/anthropic.md'].sort(),
  'getAllPagePaths returns all .md files in the three canonical folders');

const emptyPaths = await getAllPagePaths(path.join(workspaceRoot, 'nonexistent'));
assertEq(emptyPaths, [], 'getAllPagePaths on missing dir returns []');

// ─── 12. New page added after last push triggers a delta ──────────────────

section('pushDomain — subsequent push detects new file');

// Fellow A already pushed everything in step 6. Now add a new page.
writePage(fellowA_WikiDir, 'entities/openai.md', '# OpenAI\n\nResearch lab.\n');

const aPush2 = await pushDomain(connections[connA.id], 'work-ai', {
  llmFn: mockLLM,
  domainsDir: fellowA_DomainsDir,
  patchFn,
});

assert(aPush2.ok, 'Fellow A second push succeeded');
assertEq(aPush2.pushed, 1, 'Fellow A second push pushed exactly 1 page (the new one)');

const fourContribs = await adapter.listContributionsSince(null);
assertEq(fourContribs.length, 4, 'shared storage now has 4 contributions');

// ── Cleanup ──────────────────────────────────────────────────────────────

console.log('\nCleaning up...');
rmSync(workspaceRoot, { recursive: true, force: true });
console.log(`Removed ${workspaceRoot}`);

// ── Summary ──────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log(`  Total: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
console.log('══════════════════════════════════════');

if (failed > 0) {
  console.log('\nFAILURES:');
  for (const { label, err } of failures) {
    console.log(`  ✗ ${label}`);
    if (err) console.log(`    └─ ${err.message || err}`);
  }
  process.exit(1);
}

console.log('\nAll Phase 2B push tests green. Ready for Phase 2C (pull orchestration).');
process.exit(0);
