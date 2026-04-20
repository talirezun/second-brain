import { buildGraph } from '../graph.js';
import { isValidDomain } from '../util.js';

export const searchWikiDefinition = {
  name: 'search_wiki',
  description:
    'Full-text search across a domain\'s wiki. Returns ranked results enriched with ' +
    'each page\'s tags, outgoing link count, and backlink count — so you can ' +
    'prioritise hub nodes (highly connected pages) over isolated ones.',
  inputSchema: {
    type: 'object',
    properties: {
      query:       { type: 'string', description: 'Search query (keywords)' },
      domain:      { type: 'string', description: 'Domain slug' },
      max_results: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['query', 'domain'],
  },
};

export async function searchWikiHandler({ query, domain, max_results = 10 }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  const graph = await buildGraph(domain, storage);
  if (graph.nodes.size === 0) return `No wiki pages found in domain "${domain}".`;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 'Empty query.';

  const hits = [];
  for (const node of graph.nodes.values()) {
    const haystack = (node.slug + '\n' + node.body).toLowerCase();
    let score = 0;
    for (const term of terms) {
      const matches = haystack.match(new RegExp(escapeRe(term), 'g'));
      if (matches) score += matches.length;
      if (node.slug.toLowerCase().includes(term)) score += 3;
      if (node.tags.some(t => t.toLowerCase().includes(term))) score += 2;
    }
    if (score === 0) continue;

    const firstIdx = node.body.toLowerCase().indexOf(terms[0]);
    const excerpt = firstIdx >= 0
      ? node.body.slice(Math.max(0, firstIdx - 80), firstIdx + 200).replace(/\s+/g, ' ').trim()
      : node.body.slice(0, 200).replace(/\s+/g, ' ').trim();

    hits.push({
      slug: node.slug,
      path: node.path,
      type: node.type,
      tags: node.tags,
      score,
      outgoing_count: node.outgoing.length,
      backlink_count: node.backlinks.length,
      excerpt,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, max_results);

  return {
    query,
    domain,
    total_matches: hits.length,
    returned: top.length,
    results: top,
  };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
