/**
 * compile_to_wiki — v2.5.2 MCP write tool
 *
 * The primary write tool: turns conversation findings into permanent wiki
 * pages. Reuses the same writePage → syncSummaryEntities → mergeIntoIndex
 * pipeline as the in-app Compile feature (v2.5.0). The MCP imports those
 * functions directly — no parallel write logic.
 *
 * What this tool does NOT do:
 *  - Write outside the user's domains folder (path-traversal guarded by
 *    isValidSlug + the storage adapter's resolveInsideBase).
 *  - Touch index.md / log.md / CLAUDE.md (refused below).
 *  - Run for free on a hallucinated 50-page output (per-call + per-page caps).
 *  - Re-run on the same content silently (the v2.5.0 file-existence guard
 *    inherits via shared module — same conversation/title/date is refused
 *    with a clear message).
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { existsSync } from 'fs';
import {
  readSchema,
  readIndex,
  wikiPath,
  writePage,
  appendLog,
  syncSummaryEntities,
} from '../../src/brain/files.js';
import { generateText } from '../../src/brain/llm.js';
import { getDefaultDomain } from '../../src/brain/config.js';
import { resolveDomainArg } from '../util.js';

// Hard caps — defense against runaway LLM output. Generous enough to never
// bite a real compile; small enough that a confused or malicious model can't
// trash the wiki in one tool call.
const MAX_PAGE_BYTES   = 50 * 1024;  // 50 KB per page (generous; real pages are 1–10 KB)
const MAX_PAGES        = 10;          // total pages per compile_to_wiki call
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 60_000;    // generous; covers very rich research summaries

// Slugs we never let be overwritten via MCP — these are app-managed.
const REFUSED_SLUGS = new Set(['index', 'log']);
const REFUSED_FILES = new Set(['index.md', 'log.md', 'CLAUDE.md']);

export const compileToWikiDefinition = {
  name: 'compile_to_wiki',
  description:
    "Save what the user has learned in this conversation to their second brain — the persistent markdown wiki managed by The Curator. " +
    "Use this when the user asks you to 'save what we discussed', 'add this to my wiki', 'update my second brain', 'compile our findings', " +
    "'store these notes', 'put this in my Curator', or any phrasing that means 'persist this knowledge'. " +
    "Writes a summary page plus any new entity/concept pages that emerged. Existing pages are merged additively (bullet sections grow), never overwritten. " +
    "Returns the list of created and updated pages with byte counts so you can show the user what changed. " +
    "Refuses with a clear message if the EXACT same title + content was already compiled today (the slug is a hash of title+content+date — same inputs map to the same file). Two compiles with the same title but different content on the same day produce different files; an unchanged re-compile is refused. " +
    "If the user did not specify a domain, call list_domains first OR check the configured default domain. " +
    "Pass dry_run: true on the first call to preview what will be written, present the plan to the user, then call again with dry_run: false to commit.",
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: "Target domain slug (e.g. 'articles', 'business'). If omitted, the configured default domain is used; if no default is set, an error is returned.",
      },
      title: {
        type: 'string',
        description: "Human-readable title for this compilation. Becomes the summary page slug (with date and short hash appended for uniqueness). Example: 'Brainstorm: AI in Enterprise'.",
      },
      summary_content: {
        type: 'string',
        description:
          "Full markdown content for the summary page. Should follow the wiki convention: '## Key Takeaways' (bullet list of conclusions), " +
          "'## Concepts Introduced or Referenced' (bullets with [[wikilinks]]), '## Entities Mentioned' (bullets with [[wikilinks]]), '## Notes' (free prose if needed). " +
          "Do NOT include YAML frontmatter — the app injects it automatically. Keep [[wikilinks]] to bare slugs (no folder prefix) except for [[summaries/...]].",
      },
      additional_pages: {
        type: 'array',
        description: "Optional. Entity or concept pages that emerged from the conversation and should be created or updated. Each must have path starting with 'entities/' or 'concepts/' and end in '.md'. Existing pages are merged additively (bullet sections accumulate, never replaced).",
        items: {
          type: 'object',
          properties: {
            path:    { type: 'string', description: "Relative path, e.g. 'concepts/llm-deployment-strategies.md'" },
            content: { type: 'string', description: "Full markdown content (no YAML frontmatter)" },
          },
          required: ['path', 'content'],
        },
      },
      dry_run: {
        type: 'boolean',
        description: "If true, validate the input and return the planned changes WITHOUT writing anything. Use this on the first call to preview, then call again with dry_run: false to commit.",
        default: false,
      },
    },
    required: ['title', 'summary_content'],
  },
};

function slugify(title) {
  return String(title || 'compilation')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '') || 'compilation';
}

function shortHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 4);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Lightweight validator for additional_pages paths. Mirrors writePage's own
// folder normalisation but rejects malformed inputs at the tool boundary so
// errors are surfaced cleanly to Claude instead of silently rewritten.
function validateAdditionalPath(p) {
  if (typeof p !== 'string' || !p) return 'path must be a non-empty string';
  if (p.includes('..') || p.startsWith('/')) return 'path must be relative and inside the wiki';
  if (!p.endsWith('.md')) return 'path must end in .md';
  const parts = p.split('/');
  if (parts.length !== 2) return 'path must be exactly <folder>/<slug>.md';
  const [folder, file] = parts;
  if (folder !== 'entities' && folder !== 'concepts') {
    return "folder must be 'entities/' or 'concepts/' (summaries/ is reserved for the auto-generated summary page)";
  }
  const slug = file.slice(0, -3);
  if (REFUSED_SLUGS.has(slug) || REFUSED_FILES.has(file)) return 'path targets a reserved file';
  if (!/^[a-z0-9][a-z0-9\-]*$/i.test(slug)) return `slug "${slug}" must be lowercase alphanumeric with hyphens`;
  return null;
}

// Programmatic index merge — same logic as src/brain/compile.js, kept here to
// keep the MCP tool fully self-contained without exporting compile.js's
// private helper (the in-app compile route's mergeIntoIndex is not exported
// publicly). If we ever extract it, the MCP tool should switch to the shared
// import — for now this is a deliberate small duplication.
function mergeIntoIndex(existingIndex, writeRecords) {
  const mentioned = new Set();
  const wikiLinkRe = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = wikiLinkRe.exec(existingIndex)) !== null) {
    mentioned.add(m[1].split('/').pop());
  }
  const cellSafe = (s) => String(s || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  const newRows = [];
  for (const entry of writeRecords) {
    if (!entry || !entry.record || entry.record.status !== 'created') continue;
    const canon = entry.record.canonPath;
    const slug = canon.replace(/\.md$/, '').split('/').pop();
    if (mentioned.has(slug)) continue;
    const folder = canon.split('/')[0];
    const type = folder === 'entities' ? 'entity' : folder === 'concepts' ? 'concept' : 'summary';
    const linkSlug = folder === 'summaries' ? `summaries/${slug}` : slug;
    const summary = cellSafe(entry.summaryHint);
    newRows.push(`| [[${linkSlug}]] | ${type} | ${summary} |`);
  }
  if (newRows.length === 0) return null;
  const lines = existingIndex.split('\n');
  let lastTableLine = -1;
  for (let i = 0; i < lines.length; i++) if (/^\|/.test(lines[i])) lastTableLine = i;
  if (lastTableLine >= 0) {
    lines.splice(lastTableLine + 1, 0, ...newRows);
    return lines.join('\n');
  }
  return existingIndex.trimEnd() + `\n\n## New pages\n\n| Page | Type | Summary |\n|---|---|---|\n${newRows.join('\n')}\n`;
}

// Build a human-readable one-line "report" Claude can render in chat without
// composing it from the structured changes array.
function buildReport(domain, changes, dryRun) {
  const created   = changes.filter(c => c.status === 'created').length;
  const updated   = changes.filter(c => c.status === 'updated').length;
  const unchanged = changes.filter(c => c.status === 'unchanged').length;
  const lead = dryRun ? 'Plan (dry run)' : 'Compiled';
  const parts = [];
  if (created)   parts.push(`${created} new page${created === 1 ? '' : 's'}`);
  if (updated)   parts.push(`${updated} updated`);
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (!parts.length) parts.push('no changes');
  return `${lead} → '${domain}': ${parts.join(', ')}.`;
}

export async function compileToWikiHandler(args, storage) {
  // ── 1. Validate inputs ─────────────────────────────────────────────────────
  const { title, summary_content, additional_pages } = args || {};
  const dry_run = !!args?.dry_run;

  const resolved = await resolveDomainArg(args, storage, getDefaultDomain);
  if (resolved.error) return { ok: false, error: resolved.error };
  const domain = resolved.value;

  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, error: 'title is required and must be a non-empty string' };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `title exceeds max length (${MAX_TITLE_LENGTH})` };
  }
  if (typeof summary_content !== 'string' || !summary_content.trim()) {
    return { ok: false, error: 'summary_content is required and must be a non-empty string' };
  }
  if (Buffer.byteLength(summary_content, 'utf8') > MAX_PAGE_BYTES) {
    return { ok: false, error: `summary_content exceeds per-page cap (${MAX_PAGE_BYTES} bytes)` };
  }
  if (summary_content.length > MAX_SUMMARY_LENGTH) {
    return { ok: false, error: `summary_content exceeds max length (${MAX_SUMMARY_LENGTH} chars)` };
  }

  // additional_pages — optional, validated per-item
  const extra = Array.isArray(additional_pages) ? additional_pages : [];
  if (extra.length + 1 > MAX_PAGES) {
    return { ok: false, error: `Too many pages: ${extra.length + 1} requested, max ${MAX_PAGES} per call.` };
  }
  for (let i = 0; i < extra.length; i++) {
    const p = extra[i];
    if (!p || typeof p !== 'object') return { ok: false, error: `additional_pages[${i}] must be an object` };
    const pathErr = validateAdditionalPath(p.path);
    if (pathErr) return { ok: false, error: `additional_pages[${i}].path: ${pathErr}` };
    if (typeof p.content !== 'string' || !p.content.trim()) {
      return { ok: false, error: `additional_pages[${i}].content must be a non-empty string` };
    }
    if (Buffer.byteLength(p.content, 'utf8') > MAX_PAGE_BYTES) {
      return { ok: false, error: `additional_pages[${i}].content exceeds per-page cap (${MAX_PAGE_BYTES} bytes)` };
    }
  }

  // ── 2. Compute deterministic summary slug (idempotent on re-compile) ──────
  const today = todayISO();
  const corpus = `${title}\n${summary_content}\n` + extra.map(p => `${p.path}\n${p.content}`).join('\n');
  const summarySlug = `${slugify(title)}-${today}-${shortHash(corpus)}`;
  const summaryPath = `summaries/${summarySlug}.md`;
  const wikiDir = wikiPath(domain);
  const summaryFullPath = path.join(wikiDir, summaryPath);

  if (existsSync(summaryFullPath) && !dry_run) {
    return {
      ok: false,
      error: `Already compiled to ${summaryPath}. Same content + title + date detected. Either change the title, extend the conversation with new findings, or delete that file in the wiki to start over.`,
    };
  }

  // ── 3. Dry-run: simulate the writes without touching disk ─────────────────
  if (dry_run) {
    const planned = [
      { path: summaryPath, status: 'created', bytes: Buffer.byteLength(summary_content, 'utf8') },
      ...extra.map(p => ({
        path: p.path,
        // We don't read existing files in dry-run — call existsSync via storage to
        // distinguish would-create vs would-update. Cheap.
        status: existsSync(path.join(wikiDir, p.path)) ? 'updated' : 'created',
        bytes: Buffer.byteLength(p.content, 'utf8'),
      })),
    ];
    return {
      ok: true,
      dry_run: true,
      domain,
      title,
      summary_path: summaryPath,
      planned_pages: planned,
      report: `Plan (dry run) → '${domain}': would write ${planned.length} page${planned.length === 1 ? '' : 's'} (${planned.filter(p => p.status === 'created').length} new, ${planned.filter(p => p.status === 'updated').length} updated). Call again with dry_run: false to commit.`,
    };
  }

  // ── 4. Real write: pages → syncSummaryEntities → index → log → audit ──────
  const writeRecords = [];

  // 4a. Summary page
  const summaryRecord = await writePage(domain, summaryPath, summary_content);
  if (summaryRecord) {
    writeRecords.push({
      originalPath: summaryPath,
      record: summaryRecord,
      summaryHint: title.slice(0, 160),
    });
  } else {
    return { ok: false, error: 'Failed to write summary page (writePage returned null)' };
  }

  // 4b. Additional pages
  for (const p of extra) {
    const rec = await writePage(domain, p.path, p.content);
    if (rec) {
      writeRecords.push({
        originalPath: p.path,
        record: rec,
        // Use the first non-empty line of the content (after the heading) as
        // the index summary — small heuristic, keeps index rows informative.
        summaryHint: extractFirstSentence(p.content),
      });
    }
  }

  // 4c. Sync summary backlinks (entities mentioned → backlink to summary)
  const canonicalPaths = writeRecords.map(w => w.record.canonPath);
  const summaryCanon = canonicalPaths.find(p => p.startsWith('summaries/'));
  if (summaryCanon) {
    await syncSummaryEntities(domain, summaryCanon, canonicalPaths);
  }

  // 4d. Programmatic index merge (no LLM call — same approach as v2.5.0 compile)
  const existingIndex = await readIndex(domain);
  const mergedIndex = mergeIntoIndex(existingIndex, writeRecords);
  if (mergedIndex) {
    const indexRecord = await writePage(domain, 'index.md', mergedIndex);
    if (indexRecord) writeRecords.push({ originalPath: 'index.md', record: indexRecord });
  }

  // 4e. Append to log
  const pageList = canonicalPaths.map(p => `  - ${p}`).join('\n');
  const logEntry = `## [${today}] mcp:compile_to_wiki | ${title}\nPages created or updated:\n${pageList}\n`;
  try { await appendLog(domain, logEntry); } catch (err) { console.error('[compile_to_wiki] appendLog failed:', err.message); }

  // 4f. Audit log (machine-private, gitignored)
  try {
    await storage.appendToWriteAudit(domain, {
      ts: new Date().toISOString(),
      tool: 'compile_to_wiki',
      title,
      summary_path: summaryCanon || summaryPath,
      paths: writeRecords.map(w => w.record.canonPath),
      bytes: writeRecords.reduce((sum, w) => sum + (w.record.bytesAfter || 0), 0),
    });
  } catch { /* best-effort */ }

  // ── 5. Build response ─────────────────────────────────────────────────────
  const changes = writeRecords.map(w => ({
    canonPath:       w.record.canonPath,
    status:          w.record.status,
    bytesBefore:     w.record.bytesBefore,
    bytesAfter:      w.record.bytesAfter,
    sectionsChanged: w.record.sectionsChanged || [],
    bulletsAdded:    w.record.bulletsAdded || 0,
  }));

  return {
    ok: true,
    domain,
    title,
    summary_path: summaryCanon || summaryPath,
    pages_written: canonicalPaths,
    changes,
    report: buildReport(domain, changes, false),
    next: 'Use get_node or get_summary to read any of the pages back, or scan_wiki_health to check for any issues introduced.',
  };
}

function extractFirstSentence(content) {
  // Strip the leading heading (# Title) and any blank lines, take the first
  // sentence-ish chunk for the index summary cell.
  const stripped = content
    .split('\n')
    .filter(l => !l.startsWith('# ') && l.trim())
    .join(' ');
  const firstSentence = stripped.split(/[.!?]/)[0] || stripped;
  return firstSentence.replace(/[*_`#\[\]]/g, '').slice(0, 160).trim();
}
