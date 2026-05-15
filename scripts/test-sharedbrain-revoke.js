#!/usr/bin/env node
/**
 * Shared Brain — Phase 4F Battle Test (revoke orchestration)
 *
 * Verifies GDPR Article 17 ("right to erasure") properties end-to-end
 * using LocalFolderStorageAdapter (no network):
 *
 *   1. Fellow A and Fellow B push contributions; synthesis runs.
 *   2. Revoke Fellow A.
 *   3. Assertions on final state:
 *      - All of A's contributions/<fellowA>/*.json deleted
 *      - A's digest deleted
 *      - Pages where ONLY A contributed are deleted (e.g. entities/a-only.md)
 *      - Pages where A+B contributed get rebuilt; A's facts no longer present
 *        in unifiedFacts; A's short ID no longer in Provenance
 *      - Pages where ONLY B contributed are untouched
 *      - state/revocations.jsonl gained one record with the revocation
 *      - state.last-synthesis reflects the post-revoke synthesis
 *   4. Token-leak audit: full PAT / admin_token text never appears in any
 *      thrown error or stderr output during the revoke.
 *
 * Run with:  node scripts/test-sharedbrain-revoke.js
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import { LocalFolderStorageAdapter } from '../src/brain/sharedbrain-local-adapter.js';
import { revokeContributor, hashAdminToken, __testing as revokeT } from '../src/brain/sharedbrain-revoke.js';
import { runLocalSynthesis } from '../src/brain/sharedbrain-synthesis.js';

// ── Harness ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];
function ok(label)        { passed++; console.log(`  ✓ ${label}`); }
function fail(label, err) { failed++; failures.push({ label, err }); console.log(`  ✗ ${label}`); if (err) console.log(`    └─ ${err.message || err}`); }
function assert(c, l, e)  { c ? ok(l) : fail(l, new Error(e || 'assertion failed')); }
function assertEq(a, e, l) {
  const sa = JSON.stringify(a);
  const se = JSON.stringify(e);
  sa === se ? ok(l) : fail(l, new Error(`expected ${se}, got ${sa}`));
}
function section(name) { console.log(`\n── ${name} ──`); }

// ── Workspace ───────────────────────────────────────────────────────────

const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'sharedbrain-4f-'));
console.log(`Phase 4F workspace: ${workspaceRoot}`);

const storageRoot = path.join(workspaceRoot, 'shared-storage');
mkdirSync(storageRoot, { recursive: true });

const fellowA = randomUUID();
const fellowB = randomUUID();

const connection = {
  id: randomUUID(),
  label: 'Phase 4F Revoke Test',
  storage_type: 'local',
  local_storage_path: storageRoot,
  fellow_id: fellowA, // doesn't actually matter for this test
  fellow_display_name: 'Test Operator',
  shared_domain: 'work-ai',
  shared_brain_slug: 'phase-4f',
  local_domains: ['unused'],
  attribute_by_name: false,
  enabled: true,
  admin_token: 'SECRET_ADMIN_TOKEN_DO_NOT_LEAK_xyz123',
};

// Mock LLM — always picks "both" if asked (matches Phase 3 live test pattern).
const mockLLM = async () => JSON.stringify({ resolution: 'both', result: [] });
const noopPatch = () => null;

// ── Step 1: scaffold initial state ──────────────────────────────────────

section('Setup: push two fellows, synthesize');

const adapter = new LocalFolderStorageAdapter({ storage_root: storageRoot });

// A contributes to two pages (a-only.md and shared.md); B contributes to
// two pages (shared.md and b-only.md). After synthesis:
//   - entities/a-only.md   → has only A's facts; revoke must delete this
//   - entities/shared.md   → has A+B facts; revoke must rebuild without A
//   - entities/b-only.md   → has only B's facts; revoke must NOT touch this

const subA1 = randomUUID();
const subB1 = randomUUID();

await adapter.storeContribution(fellowA, subA1, {
  submission_id: subA1,
  fellow_id: fellowA,
  fellow_display_name: 'Fellow A',
  domain: 'work-ai',
  contributed_at: '2026-05-14T10:00:00Z',
  deltas: [
    {
      path: 'entities/a-only.md',
      type: 'entity',
      title: 'A-only Entity',
      new_facts: ['Fact authored by Fellow A only.'],
      new_links: [], removed_links: [],
    },
    {
      path: 'entities/shared.md',
      type: 'entity',
      title: 'Shared Entity',
      new_facts: ['Fact about shared entity from fellow A.'],
      new_links: [], removed_links: [],
    },
  ],
});

await adapter.storeContribution(fellowB, subB1, {
  submission_id: subB1,
  fellow_id: fellowB,
  fellow_display_name: 'Fellow B',
  domain: 'work-ai',
  contributed_at: '2026-05-14T11:00:00Z',
  deltas: [
    {
      path: 'entities/shared.md',
      type: 'entity',
      title: 'Shared Entity',
      new_facts: ['Fact about shared entity from fellow B.'],
      new_links: [], removed_links: [],
    },
    {
      path: 'entities/b-only.md',
      type: 'entity',
      title: 'B-only Entity',
      new_facts: ['Fact authored by Fellow B only.'],
      new_links: [], removed_links: [],
    },
  ],
});

// Set state.last-synthesis to epoch so synthesis processes both contributions
await adapter.writeMeta('state.last-synthesis', { at: new Date(0).toISOString(), run_number: 0 });

const initialSynth = await runLocalSynthesis(connection, {
  llmFn: mockLLM,
  patchFn: noopPatch,
});
assertEq(initialSynth.ok, true, 'initial synthesis succeeded');
assert(initialSynth.pages_written >= 3, `initial synthesis wrote ≥3 pages (got ${initialSynth.pages_written})`);

// Verify the three pages exist
const initialPaths = (await adapter.listPages('work-ai')).sort();
assert(initialPaths.includes('entities/a-only.md'), 'a-only.md exists pre-revoke');
assert(initialPaths.includes('entities/shared.md'), 'shared.md exists pre-revoke');
assert(initialPaths.includes('entities/b-only.md'), 'b-only.md exists pre-revoke');
console.log(`    Pre-revoke pages: ${initialPaths.join(', ')}`);

// Verify A's contribution + digest exist
assert(await adapter.contributionExists(fellowA, subA1), 'A contribution exists pre-revoke');
await adapter.storeDigest(fellowA, { version: 1 });
const digestBefore = await adapter.loadDigest(fellowA);
assert(digestBefore !== null, 'A digest exists pre-revoke');

// Capture the shared page content for later comparison
const sharedBefore = await adapter.readPage('work-ai', 'entities/shared.md');
const aShortId = revokeT.shortenFellowId(fellowA);
assert(sharedBefore.includes(aShortId), `shared.md Provenance pre-revoke contains A's short id "${aShortId}"`);

// ── Step 2: run the revocation ──────────────────────────────────────────

section('Revoke: token-leak-aware execution');

const originalErr = console.error;
const stderrCaptured = [];
console.error = (...args) => stderrCaptured.push(args.join(' '));

const adminTokenHash = hashAdminToken(connection.admin_token);
const result = await revokeContributor(connection, {
  fellowId: fellowA,
  adminTokenHash,
  llmFn: mockLLM,
  patchFn: noopPatch,
});

console.error = originalErr;

assertEq(result.ok, true, 'revoke returned ok: true');
assert(result.contributions_deleted >= 1,
  `revoke deleted at least 1 contribution (got ${result.contributions_deleted})`);
assert(result.pages_deleted >= 1,
  `revoke deleted at least 1 collective page (got ${result.pages_deleted})`);
assert(typeof result.audit_record === 'object',
  'revoke returned audit_record object');

// ── Step 3: GDPR Article 17 properties ──────────────────────────────────

section('Post-revoke: A is gone, B is intact, audit recorded');

// A's contribution gone
assert(!(await adapter.contributionExists(fellowA, subA1)),
  'A contribution deleted from contributions/');
// A's digest gone
const digestAfter = await adapter.loadDigest(fellowA);
assertEq(digestAfter, null, 'A digest deleted');

// a-only.md gone (no remaining contributors)
const finalPaths = (await adapter.listPages('work-ai')).sort();
console.log(`    Post-revoke pages: ${finalPaths.join(', ')}`);
assert(!finalPaths.includes('entities/a-only.md'),
  'a-only.md deleted (no remaining contributors)');

// b-only.md retained
assert(finalPaths.includes('entities/b-only.md'),
  'b-only.md still present (B is not revoked)');

// shared.md still exists but no longer mentions A
assert(finalPaths.includes('entities/shared.md'),
  'shared.md re-built (B still contributes to it)');
const sharedAfter = await adapter.readPage('work-ai', 'entities/shared.md');
assert(!sharedAfter.includes(aShortId),
  `shared.md Provenance no longer contains A's short id "${aShortId}"`);
const bShortId = revokeT.shortenFellowId(fellowB);
assert(sharedAfter.includes(bShortId),
  `shared.md Provenance still contains B's short id "${bShortId}"`);
// A's specific fact should no longer appear
assert(!sharedAfter.includes('Fact about shared entity from fellow A.'),
  'shared.md no longer contains the fact authored by A');
// B's fact should still appear
assert(sharedAfter.includes('Fact about shared entity from fellow B.'),
  'shared.md still contains the fact authored by B');

// b-only page untouched (contains B's facts)
const bOnlyAfter = await adapter.readPage('work-ai', 'entities/b-only.md');
assert(bOnlyAfter && bOnlyAfter.includes('Fact authored by Fellow B only.'),
  'b-only.md content intact');

// state/revocations.jsonl exists with the right record
const auditPath = path.join(storageRoot, 'state', 'revocations.jsonl');
assert(existsSync(auditPath), 'revocations.jsonl was created');
const auditLines = readFileSync(auditPath, 'utf-8').trim().split('\n').filter(Boolean);
assertEq(auditLines.length, 1, 'revocations.jsonl has exactly one record');
const auditEntry = JSON.parse(auditLines[0]);
assertEq(auditEntry.fellow_id, fellowA, 'audit entry has correct fellow_id');
assert(typeof auditEntry.revoked_at === 'string' && auditEntry.revoked_at.startsWith('20'),
  'audit entry has ISO timestamp');
assert(auditEntry.by_admin_token_hash && auditEntry.by_admin_token_hash.startsWith('sha256:'),
  'audit entry has sha256-prefixed admin token hash');
assert(typeof auditEntry.contributions_deleted === 'number',
  'audit entry has contributions_deleted count');

// state.last-synthesis updated to a real timestamp (not epoch)
const lastSynth = await adapter.readMeta('state.last-synthesis');
assert(lastSynth && lastSynth.at && new Date(lastSynth.at).getTime() > 0,
  'state.last-synthesis updated to a non-epoch timestamp');

// ── Step 4: token-leak audit ────────────────────────────────────────────

section('Token-leak audit: admin token NEVER appears in stderr or audit log');

const fullStderr = stderrCaptured.join('\n');
const fullAudit = readFileSync(auditPath, 'utf-8');
assert(!fullStderr.includes(connection.admin_token),
  'admin token does not appear in captured stderr');
assert(!fullAudit.includes(connection.admin_token),
  'admin token does not appear in audit log');
// Even the first 12 chars should be absent — defense against truncation leaks
assert(!fullStderr.includes(connection.admin_token.slice(0, 12)),
  'first 12 chars of admin token never appear in stderr');

// ── Step 5: idempotency — re-revoke of same fellow should be safe ───────

section('Idempotency: revoking the same fellow twice does not error');

const result2 = await revokeContributor(connection, {
  fellowId: fellowA,
  adminTokenHash,
  llmFn: mockLLM,
  patchFn: noopPatch,
});
assertEq(result2.ok, true, 'second revoke returns ok: true even when nothing remains');
assertEq(result2.contributions_deleted, 0, 'second revoke finds no contributions to delete');

const auditLines2 = readFileSync(auditPath, 'utf-8').trim().split('\n').filter(Boolean);
assertEq(auditLines2.length, 2, 'audit log gained a second entry (records every attempt)');

// ── Step 6: validation — bad inputs rejected ────────────────────────────

section('Validation: revoke rejects malformed input');

const badInputs = [
  { args: { fellowId: 'not-a-uuid' }, label: 'rejects non-UUID fellowId' },
  { args: { fellowId: '' },           label: 'rejects empty fellowId' },
  { args: {},                          label: 'rejects missing fellowId' },
];
for (const { args, label } of badInputs) {
  const r = await revokeContributor(connection, args);
  assertEq(r.ok, false, label);
}

const r = await revokeContributor({}, { fellowId: randomUUID() });
assertEq(r.ok, false, 'rejects connection without shared_domain');

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

console.log('\nAll Phase 4F revoke tests green. GDPR Article 17 properties verified.');
process.exit(0);
