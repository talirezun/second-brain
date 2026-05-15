/**
 * Shared utilities for MCP tools.
 *
 * The storage adapter is the ultimate chokepoint for path traversal, but we also
 * validate/normalise slugs and domain names at the tool layer so that invalid
 * input returns a clean error instead of a silent "not found".
 */

/**
 * Loose slug check — the characters a Curator wiki filename can legitimately
 * contain. Rejects anything that could be used for traversal, shell escapes,
 * or oddball unicode mischief.
 */
export function isValidSlug(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 200 && /^[a-z0-9][a-z0-9\-_]*$/i.test(s);
}

/** Domain slugs follow the same shape as page slugs. */
export const isValidDomain = isValidSlug;

/**
 * Normalise an LLM-provided slug to its canonical form. Underscores → hyphens,
 * whitespace → hyphens, lowercased. Returns null for invalid shapes.
 */
export function normaliseSlug(s) {
  if (typeof s !== 'string' || !s) return null;
  const n = s.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
  return isValidSlug(n) ? n : null;
}

/**
 * Resolve a slug against a graph — tolerant of the few Curator-specific
 * canonical variants (hyphen form, article-prefix stripped). Returns the
 * matching node's slug, or null.
 */
export function resolveNodeSlug(raw, graphNodes) {
  if (typeof raw !== 'string' || !raw) return null;
  if (graphNodes.has(raw)) return raw;
  const norm = normaliseSlug(raw);
  if (norm && graphNodes.has(norm)) return norm;
  if (norm) {
    const stripped = norm.replace(/^(the|a|an)-/, '');
    if (stripped && graphNodes.has(stripped)) return stripped;
  }
  return null;
}

/**
 * Resolve a tool's `domain` argument with the v2.5.2 default-domain fallback.
 *
 * Used by every write tool (compile_to_wiki, scan_wiki_health, fix_wiki_issue,
 * dismiss_wiki_issue, undismiss_wiki_issue, get_health_dismissed,
 * scan_semantic_duplicates) so the resolution rule is consistent: explicit
 * arg → user's configured default → error.
 *
 * Returns either { value: <slug> } on success, or { error: "..." } when the
 * domain is missing, malformed, or not present on disk. Callers spread the
 * error directly into the tool response.
 */
export async function resolveDomainArg(args, storage, getDefaultDomain) {
  let domain = args?.domain;
  if (!domain) {
    domain = getDefaultDomain();
    if (!domain) {
      return { error: 'No domain specified and no default domain is configured. Call list_domains, then pass `domain` explicitly. Tip: the user can set a default in Settings → Default domain for MCP writes.' };
    }
  }
  if (!isValidDomain(domain)) {
    return { error: `Invalid domain: ${domain}` };
  }
  const all = await storage.listDomains();
  if (!all.includes(domain)) {
    return { error: `Unknown domain: ${domain}. Available: ${all.join(', ') || '(none)'}` };
  }
  return { value: domain };
}

/**
 * Refuse to write to a Shared Brain mirror domain.
 *
 * Per Decision 7 in docs/shared-brain-design.md, every Shared Brain mirror
 * (a `domains/shared-<slug>/` directory created by Phase 2C's
 * `ensureSharedDomainExists`) has `readonly: true` in its CLAUDE.md
 * frontmatter. Direct writes via MCP are silently lost: they don't
 * propagate to other contributors (no push path from a mirror) and they
 * get overwritten on the next pull. The contribution model requires
 * writes to originate from the user's PERSONAL opted-in domain.
 *
 * This helper is the chokepoint enforcing that contract for all MCP
 * write tools. It loads `isDomainReadonly` lazily so the import doesn't
 * fire when the MCP server runs without any Shared Brain configured.
 *
 * Returns null when the write is allowed. Returns a structured error
 * object — same shape as resolveDomainArg's error — when the write must
 * be refused. Callers spread it into the tool response.
 *
 * @param {string} domain  Already-validated domain slug from resolveDomainArg.
 * @returns {Promise<null | { ok: false, error: string }>}
 */
export async function refuseIfReadonly(domain) {
  // Lazy import — avoids loading src/brain/files.js until the first MCP
  // write tool actually fires. Keeps the MCP startup path lean.
  const { isDomainReadonly } = await import('../src/brain/files.js');
  if (await isDomainReadonly(domain)) {
    return {
      ok: false,
      error:
        `Domain '${domain}' is a read-only Shared Brain mirror. ` +
        `Direct writes here would not propagate to other contributors ` +
        `and would be overwritten on the next pull. To contribute, ` +
        `call this tool on your personal opted-in domain (e.g. 'work-ai'), ` +
        `then run "Push contributions" from the Sync tab.`,
    };
  }
  return null;
}
