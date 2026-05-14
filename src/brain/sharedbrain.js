/**
 * Shared Brain — Push / Pull / Synthesis orchestration
 *
 * The brain layer for Shared Brain. The only module that combines:
 *   - filesystem reads from the contributor's wiki
 *   - the local LLM (via sharedbrain-delta)
 *   - the storage adapter (via sharedbrain-storage-factory)
 *   - persistent connection state (via sharedbrain-config)
 *
 * Phase 2B scope:
 *   - pushDomain()         — push one domain's deltas to the collective storage
 *   - findChangedPages()   — mtime + pending_retry union
 *   - getAllPagePaths()    — list page paths in a domain (for cross-domain
 *                            link filtering)
 *   - loadPriorContent()   — best-effort git lookup (returns null if .knowledge-git
 *                            isn't present — most users don't have it)
 *
 * Phase 2C will add pullCollective(); Phase 2E will add runLocalSynthesis().
 *
 * Decisions (binding per docs/shared-brain-design.md):
 *   - Decision 3: partial push on LLM failure, with pending_retry tracking.
 *     Pages that fail 3 consecutive times move to permanent_skip and the
 *     UI must surface them for manual review.
 *   - Decision 2: cross-domain links are stripped at delta-generation
 *     (the delta module handles this; we just pass `domainPagePaths`).
 *   - Spec Part 10 invariant 4: pushDomain refuses any domain not in
 *     `connection.local_domains`. Personal-domain isolation enforced
 *     before any LLM or storage call.
 *
 * Logging discipline:
 *   - All progress notifications via `onProgress(stage, message)` callback.
 *   - All diagnostics via console.error (this module is imported by mcp/*
 *     in Phase 4+; stdout reserved for MCP JSON-RPC stream).
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDomainsDir } from './config.js';
import { createStorageAdapter } from './sharedbrain-storage-factory.js';
import { generateDeltaSummary } from './sharedbrain-delta.js';
import { patchSharedBrain } from './sharedbrain-config.js';

const execAsync = promisify(exec);

/** Retry attempt threshold beyond which a page is moved to permanent_skip. */
export const MAX_RETRY_ATTEMPTS = 3;

/** Folders within a domain's wiki/ that we consider for changed-page detection. */
const WIKI_FOLDERS = ['entities', 'concepts', 'summaries'];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * List the paths of every .md file inside a domain's wiki/, relative to wiki/.
 * E.g. ["entities/foo.md", "concepts/bar.md", "summaries/baz.md"].
 *
 * Used by:
 *   - sharedbrain-delta's filterToDomainLinks (cross-domain link safety net)
 *   - findChangedPages
 */
export async function getAllPagePaths(wikiDir) {
  const out = [];
  for (const folder of WIKI_FOLDERS) {
    const folderPath = path.join(wikiDir, folder);
    if (!existsSync(folderPath)) continue;
    let entries;
    try { entries = await readdir(folderPath, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      out.push(`${folder}/${entry.name}`);
    }
  }
  return out;
}

/**
 * Find pages that changed since the given timestamp, UNION with any pages in
 * pendingRetry. Returns deduplicated array of paths relative to wiki/.
 *
 * @param {string} wikiDir
 * @param {Date|null} sinceDate         null = treat all pages as changed (first push)
 * @param {object} pendingRetry         { [pagePath]: attemptCount }
 * @returns {Promise<string[]>}
 */
export async function findChangedPages(wikiDir, sinceDate, pendingRetry = {}) {
  const changed = new Set();

  // 1. mtime-based detection
  for (const folder of WIKI_FOLDERS) {
    const folderPath = path.join(wikiDir, folder);
    if (!existsSync(folderPath)) continue;
    let entries;
    try { entries = await readdir(folderPath, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const pageAbs = path.join(folderPath, entry.name);
      try {
        const st = await stat(pageAbs);
        if (!sinceDate || st.mtime > sinceDate) {
          changed.add(`${folder}/${entry.name}`);
        }
      } catch { /* skip pages we can't stat */ }
    }
  }

  // 2. union with pending_retry — pages that failed last time
  for (const p of Object.keys(pendingRetry || {})) {
    // Only retry pages that still exist
    const pageAbs = path.join(wikiDir, p);
    if (existsSync(pageAbs)) {
      changed.add(p);
    }
  }

  return Array.from(changed);
}

/**
 * Best-effort: fetch the version of a wiki page as of `sinceDate` from the
 * personal-sync git repo (.knowledge-git). Returns null if:
 *   - .knowledge-git doesn't exist (most users don't have personal sync)
 *   - git command fails for any reason
 *   - the page wasn't tracked at that time
 *
 * Returning null means the LLM is told this is a new page — slightly less
 * useful delta (no prior-version comparison), but safe.
 */
export async function loadPriorContent(domainsDir, domain, pagePath, sinceDate) {
  if (!sinceDate) return null;
  try {
    const projectRoot = path.resolve(domainsDir, '..');
    const gitDir = path.join(projectRoot, '.knowledge-git');
    if (!existsSync(gitDir)) return null;

    const sinceIso = sinceDate.toISOString();
    const { stdout: shaOut } = await execAsync(
      `git --git-dir="${gitDir}" --work-tree="${domainsDir}" log --format="%H" --before="${sinceIso}" -1 -- "domains/${domain}/wiki/${pagePath}"`,
      { encoding: 'utf-8' }
    );
    const sha = shaOut.trim();
    if (!sha) return null;

    const { stdout: content } = await execAsync(
      `git --git-dir="${gitDir}" show "${sha}:domains/${domain}/wiki/${pagePath}"`,
      { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 }
    );
    return content;
  } catch {
    return null;
  }
}

// ── pushDomain ─────────────────────────────────────────────────────────────

/**
 * Push one domain's deltas to the collective storage.
 *
 * Flow:
 *   1. Security gate: refuse if domainSlug is not in connection.local_domains.
 *   2. Find changed pages (mtime > last_push_at  ∪  pending_retry).
 *   3. List all page paths in the domain (for cross-domain link filtering).
 *   4. For each changed page:
 *        a. Read current content.
 *        b. Best-effort: read prior content via personal-sync git.
 *        c. Generate DeltaSummary via local LLM (sharedbrain-delta).
 *        d. On failure: increment pending_retry counter, or mark
 *           permanent_skip if attempts hit MAX_RETRY_ATTEMPTS.
 *   5. Build contribution payload, call adapter.storeContribution.
 *   6. Update connection state: last_push_at, pending_retry, permanent_skip.
 *
 * @param {object} connection                 Full connection object (with tokens)
 * @param {string} domainSlug                 Local domain to push (must be in connection.local_domains)
 * @param {object} [opts]
 * @param {Function} [opts.onProgress]        (stage, message, meta?) callback for SSE
 * @param {Function} [opts.llmFn]             Test injection — overrides generateText
 * @param {string}   [opts.domainsDir]        Override domains root (test injection)
 * @param {Function} [opts.patchFn]           Test injection — overrides patchSharedBrain
 * @param {Function} [opts.now]               Test injection — returns Date object
 * @param {string}   [opts.submissionId]      Test injection — pre-set submission UUID for determinism
 * @returns {Promise<{ ok, pushed, skipped, permanent_skip, domain, submission_id, error? }>}
 */
export async function pushDomain(connection, domainSlug, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const domainsDir = opts.domainsDir || getDomainsDir();
  const patchFn    = opts.patchFn    || patchSharedBrain;
  const nowFn      = opts.now        || (() => new Date());
  const submissionId = opts.submissionId || randomUUID();

  // ── 1. Security gate ─────────────────────────────────────────────────────
  if (!connection || typeof connection !== 'object') {
    return { ok: false, error: 'pushDomain: connection object is required' };
  }
  if (!connection.enabled) {
    return { ok: false, error: 'pushDomain: connection is disabled' };
  }
  if (!Array.isArray(connection.local_domains) || !connection.local_domains.includes(domainSlug)) {
    return {
      ok: false,
      error: `pushDomain: domain "${domainSlug}" is not in this connection's contribution list. ` +
             `Add it to the connection's local_domains in the Sync tab settings before pushing.`,
    };
  }

  const wikiDir = path.join(domainsDir, domainSlug, 'wiki');
  if (!existsSync(wikiDir)) {
    return { ok: false, error: `pushDomain: wiki folder not found at ${wikiDir}` };
  }

  // ── 2. Find changed pages ────────────────────────────────────────────────
  const sinceDate = connection.last_push_at ? new Date(connection.last_push_at) : null;
  if (sinceDate && isNaN(sinceDate.getTime())) {
    return { ok: false, error: `pushDomain: connection.last_push_at is not a valid date: "${connection.last_push_at}"` };
  }

  const pendingRetry = { ...(connection.pending_retry || {}) };
  const permanentSkip = new Set(connection.permanent_skip || []);

  let changedPages = await findChangedPages(wikiDir, sinceDate, pendingRetry);
  // Remove any pages already in permanent_skip — those need manual user attention.
  changedPages = changedPages.filter(p => !permanentSkip.has(p));

  if (changedPages.length === 0) {
    onProgress('info', 'No pages changed since last push.');
    // Still update last_push_at so subsequent pushes don't re-scan everything.
    const pushTimestamp = nowFn().toISOString();
    patchFn(connection.id, { last_push_at: pushTimestamp });
    return {
      ok: true, pushed: 0, skipped: 0,
      permanent_skip: Array.from(permanentSkip),
      domain: domainSlug, submission_id: null,
    };
  }

  onProgress('info', `Found ${changedPages.length} changed page(s). Pre-processing with local LLM...`);

  // ── 3. Build the cross-domain link filter set ───────────────────────────
  const domainPagePaths = await getAllPagePaths(wikiDir);

  // ── 4. Generate DeltaSummaries ──────────────────────────────────────────
  const pushTimestamp = nowFn().toISOString();
  const deltas = [];
  const newPendingRetry = {};
  const newPermanentSkip = new Set(permanentSkip);
  let skippedCount = 0;

  for (let i = 0; i < changedPages.length; i++) {
    const pagePath = changedPages[i];
    onProgress('progress', `Processing ${pagePath} (${i + 1}/${changedPages.length})`, {
      current: i + 1, total: changedPages.length,
    });

    let currentContent;
    try {
      currentContent = await readFile(path.join(wikiDir, pagePath), 'utf-8');
    } catch (err) {
      console.error(`[sharedbrain] Skipping ${pagePath} — read failed: ${err.message}`);
      skippedCount++;
      continue;
    }

    const priorContent = await loadPriorContent(domainsDir, domainSlug, pagePath, sinceDate);

    const result = await generateDeltaSummary({
      pagePath, currentContent, priorContent,
      fellowId: connection.fellow_id,
      fellowDisplayName: connection.fellow_display_name,
      domainPagePaths,
      options: {
        llmFn: opts.llmFn,
        now: nowFn,
      },
    });

    if (result.ok) {
      deltas.push(result.delta);
      // Don't re-queue this page — it succeeded.
    } else {
      // LLM/parse failure. Track for retry per Decision 3.
      const prevCount = pendingRetry[pagePath] || 0;
      const newCount = prevCount + 1;
      if (newCount >= MAX_RETRY_ATTEMPTS) {
        newPermanentSkip.add(pagePath);
        onProgress('warn',
          `${pagePath}: failed ${newCount} times — marked permanent_skip. ` +
          `Review and re-edit the page; it will retry on next push.`
        );
      } else {
        newPendingRetry[pagePath] = newCount;
        onProgress('warn',
          `${pagePath}: LLM pre-processing failed (attempt ${newCount}/${MAX_RETRY_ATTEMPTS}). ` +
          `Will retry next push.`
        );
      }
      skippedCount++;
    }
  }

  // ── 5. Store contribution payload (if anything to push) ──────────────────
  let pushedSubmissionId = null;
  if (deltas.length > 0) {
    let adapter;
    try {
      adapter = createStorageAdapter(connection);
    } catch (err) {
      return {
        ok: false,
        error: `pushDomain: storage adapter init failed: ${err.message}`,
        pushed: 0, skipped: skippedCount,
        domain: domainSlug,
      };
    }

    const payload = {
      submission_id: submissionId,
      fellow_id: connection.fellow_id,
      fellow_display_name: connection.fellow_display_name,
      domain: connection.shared_domain,
      domain_display_name: connection.shared_domain_display_name || connection.shared_domain,
      contributed_at: pushTimestamp,
      consent: { share_with_brain: true },
      delta_since: sinceDate ? sinceDate.toISOString() : null,
      deltas,
    };

    onProgress('info', `Pushing ${deltas.length} delta summaries to collective storage...`);
    try {
      await adapter.storeContribution(connection.fellow_id, submissionId, payload);
      pushedSubmissionId = submissionId;
    } catch (err) {
      return {
        ok: false,
        error: `pushDomain: storage write failed: ${err.message}`,
        pushed: 0, skipped: skippedCount,
        domain: domainSlug,
      };
    }
  } else {
    onProgress('info', 'All changed pages failed pre-processing — nothing to push this cycle.');
  }

  // ── 6. Update connection state ──────────────────────────────────────────
  patchFn(connection.id, {
    last_push_at: pushTimestamp,
    pending_retry: newPendingRetry,
    permanent_skip: Array.from(newPermanentSkip),
  });

  const summary = deltas.length === 0
    ? `Push complete: 0 pushed, ${skippedCount} skipped.`
    : `Pushed ${deltas.length} page${deltas.length !== 1 ? 's' : ''}.` +
      (skippedCount > 0 ? ` ${skippedCount} will retry next time.` : '');

  onProgress('done', summary, { pushed: deltas.length, skipped: skippedCount });

  return {
    ok: true,
    pushed: deltas.length,
    skipped: skippedCount,
    permanent_skip: Array.from(newPermanentSkip),
    pending_retry: newPendingRetry,
    domain: domainSlug,
    submission_id: pushedSubmissionId,
  };
}
