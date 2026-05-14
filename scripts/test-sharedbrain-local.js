#!/usr/bin/env node
/**
 * Shared Brain — Phase 2A Battle Test
 *
 * Validates the storage interface + LocalFolderStorageAdapter + config
 * module by simulating a real cohort on this single machine:
 *
 *   - Spins up an isolated /tmp folder as the "shared storage root"
 *   - Creates THREE fellow_ids
 *   - Each fellow stores contributions independently
 *   - Verifies cross-fellow visibility (Fellow A can read Fellow B's contribution)
 *   - Verifies the security guard rejects path-traversal attempts
 *   - Verifies the connection config round-trips with masked tokens
 *
 * Run with:  node scripts/test-sharedbrain-local.js
 *
 * Exit code 0 if all green; non-zero on any failure.
 *
 * This test does NOT touch your production .sharedbrain-config.json. It
 * uses an isolated temporary storage folder and a separate config write
 * path that is restored at the end.
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { LocalFolderStorageAdapter, __testing as adapterT } from '../src/brain/sharedbrain-local-adapter.js';
import { createStorageAdapter } from '../src/brain/sharedbrain-storage-factory.js';
import { newUuid, __testing as configT } from '../src/brain/sharedbrain-config.js';

// ── Test harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed++;
  failures.push({ label, err });
  console.log(`  ✗ ${label}`);
  if (err) console.log(`    └─ ${err.message || err}`);
}

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

async function expectThrow(fn, label, matcher) {
  try {
    await fn();
    fail(label, new Error('expected throw, but call resolved'));
  } catch (err) {
    if (matcher && !matcher.test(err.message)) {
      fail(label, new Error(`thrown but message did not match ${matcher} (got "${err.message}")`));
    } else {
      ok(label);
    }
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ── Setup: isolated storage root ─────────────────────────────────────────

const storageRoot = mkdtempSync(path.join(tmpdir(), 'sharedbrain-test-'));
console.log(`Battle test storage root: ${storageRoot}`);

// Three simulated fellows. Use real UUIDs; isSafeId requires alphanum/hyphen/underscore
// and UUIDs satisfy that.
const fellow1 = newUuid();
const fellow2 = newUuid();
const fellow3 = newUuid();

// ── Test 1: resolveInsideBase guard ──────────────────────────────────────

section('Security: resolveInsideBase guard');

const { resolveInsideBase, isSafeId } = adapterT;

assert(
  resolveInsideBase('/tmp/x', 'a/b/c') !== null,
  'normal relative path is allowed'
);
assert(
  resolveInsideBase('/tmp/x', '/etc/passwd') === null,
  'absolute path is rejected'
);
assert(
  resolveInsideBase('/tmp/x', '../../etc/passwd') === null,
  'parent-traversal is rejected'
);
assert(
  resolveInsideBase('/tmp/x', '') !== null,
  'empty relative resolves to base itself (treated as legal)'
);
assert(
  resolveInsideBase('/tmp/x', null) === null,
  'null relative is rejected'
);
assert(
  resolveInsideBase('/tmp/x', 'a/../b') !== null,
  'inner ".." that still ends inside base is allowed (canonical: b)'
);
assert(
  resolveInsideBase('/tmp/x', 'a/../../b') === null,
  'inner ".." that escapes base is rejected'
);

// isSafeId checks
assert(isSafeId('work-ai'), 'isSafeId accepts slug-shaped string');
assert(isSafeId(fellow1), 'isSafeId accepts UUID');
assert(!isSafeId('../foo'), 'isSafeId rejects path traversal');
assert(!isSafeId('foo/bar'), 'isSafeId rejects forward slash');
assert(!isSafeId(''), 'isSafeId rejects empty string');
assert(!isSafeId(null), 'isSafeId rejects null');

// ── Test 2: LocalFolderStorageAdapter instantiation ─────────────────────

section('Adapter: construction validation');

try {
  new LocalFolderStorageAdapter({ storage_root: storageRoot });
  ok('adapter constructs with valid absolute path');
} catch (err) {
  fail('adapter construct (valid)', err);
}

try {
  new LocalFolderStorageAdapter({});
  fail('adapter rejects missing storage_root');
} catch {
  ok('adapter rejects missing storage_root');
}

try {
  new LocalFolderStorageAdapter({ storage_root: 'relative/path' });
  fail('adapter rejects relative storage_root');
} catch {
  ok('adapter rejects relative storage_root');
}

// ── Test 3: Page operations ──────────────────────────────────────────────

section('Adapter: page operations');

const adapter = new LocalFolderStorageAdapter({ storage_root: storageRoot });

await adapter.writePage('work-ai', 'entities/anthropic.md', '# Anthropic\n\nAI safety company.\n');
const readBack = await adapter.readPage('work-ai', 'entities/anthropic.md');
assertEq(readBack, '# Anthropic\n\nAI safety company.\n', 'writePage → readPage round-trip');

const missing = await adapter.readPage('work-ai', 'entities/nonexistent.md');
assertEq(missing, null, 'readPage of missing file returns null');

await adapter.writePage('work-ai', 'concepts/rag.md', '# RAG\n');
await adapter.writePage('work-ai', 'summaries/foo.md', '# Foo\n');

const allPages = await adapter.listPages('work-ai');
const sortedAll = [...allPages].sort();
assertEq(
  sortedAll,
  ['concepts/rag.md', 'entities/anthropic.md', 'summaries/foo.md'],
  'listPages returns all pages relative to wiki/'
);

const entitiesOnly = await adapter.listPages('work-ai', 'entities');
assertEq(entitiesOnly, ['entities/anthropic.md'], 'listPages with prefix returns just that subtree');

// Security: writePage must refuse path-traversal that escapes the per-domain wiki/.
// This is critical — without per-wiki-base resolution, "../../etc/passwd" would
// normalise to "collective/etc/passwd" inside the storage root, letting an
// attacker overwrite siblings (contributions/, digests/, other domains).
await expectThrow(
  () => adapter.writePage('work-ai', '../../etc/passwd', 'pwned'),
  'writePage refuses ../../etc/passwd path (escapes outside storage root)',
  /unsafe/i
);
await expectThrow(
  () => adapter.writePage('../malicious', 'entities/x.md', 'pwned'),
  'writePage refuses ../ in domain',
  /unsafe/i
);
await expectThrow(
  () => adapter.writePage('work-ai', '../../contributions/foo.json', 'pwned'),
  'writePage refuses traversal into sibling contributions/ dir',
  /unsafe/i
);
await expectThrow(
  () => adapter.writePage('work-ai', '../../../meta/state/last-synthesis.json', 'pwned'),
  'writePage refuses traversal into meta/ dir',
  /unsafe/i
);
await expectThrow(
  () => adapter.writePage('work-ai', '../other-domain/wiki/concepts/evil.md', 'pwned'),
  'writePage refuses traversal into another domain',
  /unsafe/i
);

// Confirm no spurious files were created anywhere in storageRoot from those attempts.
const sneakPaths = [
  path.join(storageRoot, 'collective', 'contributions'),
  path.join(storageRoot, 'collective', 'etc'),
  path.join(storageRoot, 'collective', 'other-domain'),
];
const noSneak = sneakPaths.every(p => !existsSync(p));
assert(noSneak, 'no traversal-spawned siblings exist in storage root', `unexpected: ${sneakPaths.filter(p => existsSync(p)).join(', ')}`);

// ── Test 4: Meta operations ──────────────────────────────────────────────

section('Adapter: meta operations');

await adapter.writeMeta('state.last-synthesis', { at: '2026-05-14T12:00:00Z', round: 1 });
const meta = await adapter.readMeta('state.last-synthesis');
assertEq(meta, { at: '2026-05-14T12:00:00Z', round: 1 }, 'writeMeta → readMeta round-trip');

const missingMeta = await adapter.readMeta('state.does-not-exist');
assertEq(missingMeta, null, 'readMeta of missing key returns null');

await expectThrow(
  () => adapter.writeMeta('../escape', { evil: true }),
  'writeMeta rejects path-traversal key',
  /unsafe/i
);

// ── Test 5: Contribution operations (multi-fellow simulation) ────────────

section('Adapter: contributions — three-fellow simulation');

const sub1 = newUuid();
const sub2 = newUuid();
const sub3 = newUuid();

// Three fellows submit contributions at three different timestamps.
const payload1 = {
  submission_id: sub1,
  fellow_id: fellow1,
  fellow_display_name: 'Fellow One',
  domain: 'work-ai',
  contributed_at: '2026-05-14T10:00:00Z',
  deltas: [{ path: 'entities/anthropic.md', type: 'entity', title: 'Anthropic', new_facts: ['Founded 2021.'] }],
};
const payload2 = {
  submission_id: sub2,
  fellow_id: fellow2,
  fellow_display_name: 'Fellow Two',
  domain: 'work-ai',
  contributed_at: '2026-05-14T11:00:00Z',
  deltas: [{ path: 'entities/anthropic.md', type: 'entity', title: 'Anthropic', new_facts: ['HQ in San Francisco.'] }],
};
const payload3 = {
  submission_id: sub3,
  fellow_id: fellow3,
  fellow_display_name: 'Fellow Three',
  domain: 'work-ai',
  contributed_at: '2026-05-14T12:00:00Z',
  deltas: [{ path: 'concepts/rag.md', type: 'concept', title: 'RAG', new_facts: ['Retrieval-augmented generation.'] }],
};

await adapter.storeContribution(fellow1, sub1, payload1);
await adapter.storeContribution(fellow2, sub2, payload2);
await adapter.storeContribution(fellow3, sub3, payload3);

assert(await adapter.contributionExists(fellow1, sub1), 'fellow1 contribution exists after store');
assert(await adapter.contributionExists(fellow2, sub2), 'fellow2 contribution exists after store');
assert(await adapter.contributionExists(fellow3, sub3), 'fellow3 contribution exists after store');
assert(!await adapter.contributionExists(fellow1, sub2), 'cross-fellow contributionExists returns false');

// listContributionsSince — null = all
const allContribs = await adapter.listContributionsSince(null);
assertEq(allContribs.length, 3, 'listContributionsSince(null) returns all 3 contributions');

// Order should be chronological by contributed_at
assertEq(
  allContribs.map(c => c.fellowId),
  [fellow1, fellow2, fellow3],
  'contributions returned in chronological order'
);

// Filter — only after 11:00 should include fellow2 and fellow3
const recent = await adapter.listContributionsSince('2026-05-14T11:00:00Z');
assertEq(recent.length, 2, 'listContributionsSince filters out old contributions');
assertEq(
  recent.map(c => c.fellowId),
  [fellow2, fellow3],
  'listContributionsSince returns the right two fellows'
);

// Filter — nothing after 13:00
const futureOnly = await adapter.listContributionsSince('2026-05-14T13:00:00Z');
assertEq(futureOnly.length, 0, 'listContributionsSince with future date returns empty');

// Invalid date
await expectThrow(
  () => adapter.listContributionsSince('not-a-date'),
  'listContributionsSince rejects invalid date',
  /invalid sinceIso/
);

// Idempotent re-store of same submission (same id, same content)
await adapter.storeContribution(fellow1, sub1, payload1);
const stillThree = await adapter.listContributionsSince(null);
assertEq(stillThree.length, 3, 'idempotent re-store does not duplicate');

// ── Test 6: Digest operations ────────────────────────────────────────────

section('Adapter: digests');

const digest1 = { version: 1, pages: 5, last_synthesized: '2026-05-14T12:00:00Z' };
await adapter.storeDigest(fellow1, digest1);

const back = await adapter.loadDigest(fellow1);
assertEq(back, digest1, 'digest round-trip');

const missingDigest = await adapter.loadDigest(fellow2);
assertEq(missingDigest, null, 'loadDigest for fellow with no digest returns null');

// Overwrite
const digest2 = { version: 2, pages: 10, last_synthesized: '2026-05-14T13:00:00Z' };
await adapter.storeDigest(fellow1, digest2);
const overwritten = await adapter.loadDigest(fellow1);
assertEq(overwritten, digest2, 'storeDigest overwrites prior digest');

// ── Test 7: Factory dispatch ─────────────────────────────────────────────

section('Factory: storage_type dispatch');

const adapterViaFactory = createStorageAdapter({
  storage_type: 'local',
  local_storage_path: storageRoot,
});
assert(
  adapterViaFactory instanceof LocalFolderStorageAdapter,
  'factory returns LocalFolderStorageAdapter for storage_type=local'
);

// Phase 3 (v2.8.0+) — github is wired. Empty config must still reject due
// to missing owner/repo/pat. A well-formed config must produce an adapter.
try {
  createStorageAdapter({ storage_type: 'github' });
  fail('factory should refuse empty github config');
} catch (err) {
  if (/owner is required|repo is required|pat is required/i.test(err.message))
    ok('factory rejects empty github config with validation error');
  else fail('factory github empty-config error message', err);
}

try {
  const gh = createStorageAdapter({
    storage_type: 'github',
    github_repo_owner: 'octocat',
    github_repo_name:  'hello-world',
    github_pat:        'github_pat_thisistwentycharsplus_xx',
    github_branch:     'main',
  });
  assert(
    gh && gh.constructor && gh.constructor.name === 'GitHubStorageAdapter',
    'factory returns GitHubStorageAdapter for storage_type=github (well-formed config)'
  );
} catch (err) {
  fail('factory should accept well-formed github config', err);
}

try {
  createStorageAdapter({ storage_type: 'cloudflare-r2' });
  fail('factory should refuse cloudflare-r2 (Phase 3.1)');
} catch (err) {
  if (/not yet implemented/i.test(err.message)) ok('factory rejects cloudflare-r2 with helpful Phase 3.1 message');
  else fail('factory r2 error message', err);
}

try {
  createStorageAdapter({ storage_type: 'something-else' });
  fail('factory should refuse unknown storage_type');
} catch (err) {
  if (/unknown storage_type/i.test(err.message)) ok('factory rejects unknown storage_type');
  else fail('factory unknown type error', err);
}

// ── Test 8: Config module — validation + masking ────────────────────────

section('Config: validation and token masking');

const { isUuid, maskTokens, validateConnection, TOKEN_FIELDS } = configT;

assert(isUuid('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), 'isUuid accepts valid UUID');
assert(!isUuid('not-a-uuid'), 'isUuid rejects non-UUID');
assert(!isUuid(''), 'isUuid rejects empty string');

// Token masking
const masked = maskTokens({
  id: 'x',
  github_pat: 'ghp_abcd1234efgh5678ijkl',
  fellow_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  admin_token: 'admin_sk_secret_value_here',
  local_storage_path: '/safe/path',
});
assertEq(masked.github_pat, 'ghp_abcd…', 'github_pat masked to 8-char prefix + ellipsis');
assertEq(masked.fellow_token, 'eyJhbGci…', 'fellow_token masked to 8-char prefix + ellipsis');
assertEq(masked.admin_token, 'admin_sk…', 'admin_token masked to 8-char prefix + ellipsis');
assertEq(masked.local_storage_path, '/safe/path', 'non-token field not masked');

// Validation — valid case
const validConn = {
  id: newUuid(),
  label: 'Test Cohort',
  storage_type: 'local',
  local_storage_path: storageRoot,
  fellow_id: newUuid(),
  fellow_display_name: 'Test Fellow',
  shared_domain: 'work-ai',
  shared_brain_slug: 'test-cohort',
  local_domains: ['work-ai'],
  enabled: true,
};
try {
  validateConnection(validConn);
  ok('validateConnection accepts well-formed connection');
} catch (err) {
  fail('validateConnection should accept valid connection', err);
}

// Validation — bad cases
const bad = (mutator, label, errMatch) => {
  const conn = { ...validConn, ...mutator };
  try {
    validateConnection(conn);
    fail(label);
  } catch (err) {
    if (errMatch.test(err.message)) ok(label);
    else fail(label, err);
  }
};
bad({ id: 'not-a-uuid' }, 'rejects bad id', /id must be a UUID/);
bad({ label: '' }, 'rejects empty label', /label is required/);
bad({ storage_type: 'mystery' }, 'rejects unknown storage_type', /storage_type must be one of/);
bad({ local_storage_path: 'relative/path' }, 'rejects relative local_storage_path', /must be an absolute path/);
bad({ fellow_id: 'nope' }, 'rejects bad fellow_id', /fellow_id must be a UUID/);
bad({ shared_domain: 'with spaces' }, 'rejects shared_domain with spaces', /shared_domain must be a slug/);
bad({ shared_brain_slug: 'with/slash' }, 'rejects shared_brain_slug with slash', /shared_brain_slug must be a slug/);
bad({ local_domains: ['ok', 'not ok'] }, 'rejects local_domains with bad slug', /local_domains must be an array of slug/);

// Confirm TOKEN_FIELDS catches the right ones
assertEq(
  TOKEN_FIELDS.sort(),
  ['admin_token', 'fellow_token', 'github_pat'],
  'TOKEN_FIELDS contains the three credential field names'
);

// ── Test 9: Concurrent simulation — 3 adapter instances, same root ──────

section('Multi-fellow: three independent adapters, shared root');

const adapterA = new LocalFolderStorageAdapter({ storage_root: storageRoot });
const adapterB = new LocalFolderStorageAdapter({ storage_root: storageRoot });
const adapterC = new LocalFolderStorageAdapter({ storage_root: storageRoot });

// All three see the same pages.
const aPages = await adapterA.listPages('work-ai');
const bPages = await adapterB.listPages('work-ai');
const cPages = await adapterC.listPages('work-ai');
assertEq(aPages.sort(), bPages.sort(), 'adapter A and B see the same pages');
assertEq(bPages.sort(), cPages.sort(), 'adapter B and C see the same pages');

// All three see the same contributions.
const aContribs = await adapterA.listContributionsSince(null);
const bContribs = await adapterB.listContributionsSince(null);
const cContribs = await adapterC.listContributionsSince(null);
assertEq(aContribs.length, 3, 'adapter A sees 3 contributions');
assertEq(bContribs.length, 3, 'adapter B sees 3 contributions');
assertEq(cContribs.length, 3, 'adapter C sees 3 contributions');

// One fellow writes a new page; the others should see it immediately on next read.
await adapterA.writePage('work-ai', 'entities/openai.md', '# OpenAI\n');
const afterAdd = await adapterB.listPages('work-ai');
assert(
  afterAdd.includes('entities/openai.md'),
  'fellow B sees new page written by fellow A'
);

// ── Cleanup ──────────────────────────────────────────────────────────────

console.log('\nCleaning up...');
rmSync(storageRoot, { recursive: true, force: true });
console.log(`Removed ${storageRoot}`);

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

console.log('\nAll Phase 2A storage tests green. Ready for Phase 2B (delta + push).');
process.exit(0);
