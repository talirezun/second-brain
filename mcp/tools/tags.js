import { buildGraph } from '../graph.js';
import { isValidDomain } from '../util.js';

export const getTagsDefinition = {
  name: 'get_tags',
  description:
    'Return the tag inventory for a domain, sorted by page count (highest first). ' +
    'By default returns the top 50 tags with up to 50 sample page slugs each — this fits ' +
    'comfortably in a single MCP response regardless of wiki size. Use filter to narrow by ' +
    'tag name, limit to change how many tags are returned, and max_pages_per_tag: 0 to get ' +
    'the full page list for a filtered result.',
  inputSchema: {
    type: 'object',
    properties: {
      domain:             { type: 'string', description: 'Domain slug' },
      filter:             { type: 'string', description: 'Only return tags whose name contains this substring (case-insensitive)' },
      min_count:          { type: 'number', description: 'Only return tags with at least N pages (default 1)' },
      limit:              { type: 'number', description: 'Max tags returned (default 50; 0 = unlimited, size-guarded)' },
      max_pages_per_tag:  { type: 'number', description: 'Truncate each tag\'s pages[] to this many slugs (default 50; 0 = unlimited)' },
    },
    required: ['domain'],
  },
};

export async function getTagsHandler(
  { domain, filter, min_count = 1, limit = 50, max_pages_per_tag = 50 },
  storage,
) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  const graph = await buildGraph(domain, storage);
  if (graph.tags.length === 0) return `Domain "${domain}" has no tags yet.`;

  let tags = graph.tags.filter(t => t.count >= min_count);
  const totalMatching = tags.length;
  if (filter) {
    const f = filter.toLowerCase();
    tags = tags.filter(t => t.tag.toLowerCase().includes(f));
  }

  const tagLimit = limit > 0 ? limit : Infinity;
  const limitedTags = tags.slice(0, tagLimit);

  const pageCap = max_pages_per_tag > 0 ? max_pages_per_tag : Infinity;
  let truncatedAny = false;
  const shaped = limitedTags.map(t => {
    const full = t.pages;
    const pages = full.length > pageCap ? full.slice(0, pageCap) : full;
    if (full.length > pageCap) truncatedAny = true;
    return {
      tag: t.tag,
      count: t.count,
      pages,
      ...(full.length > pageCap ? { pages_truncated_from: full.length } : {}),
    };
  });

  const result = {
    domain,
    total_tags: graph.tags.length,
    matching_tags: totalMatching,
    returned: shaped.length,
    limit: limit > 0 ? limit : null,
    max_pages_per_tag: max_pages_per_tag > 0 ? max_pages_per_tag : null,
    tags: shaped,
  };

  const hints = [];
  if (tags.length > shaped.length) {
    hints.push(`${tags.length - shaped.length} more tag(s) match — raise limit or use filter to narrow.`);
  }
  if (truncatedAny) {
    hints.push('Some tags had more pages than max_pages_per_tag; use filter + max_pages_per_tag: 0 for the full list.');
  }
  if (hints.length) result._hints = hints;
  return result;
}
