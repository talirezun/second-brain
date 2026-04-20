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
