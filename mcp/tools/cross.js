import { buildGraph } from '../graph.js';

export const searchCrossDefinition = {
  name: 'search_cross_domain',
  description:
    'Search for a query across ALL available domains simultaneously. Returns ranked ' +
    'results tagged with their domain of origin — use this to find connections between ' +
    'topics that span multiple knowledge areas.',
  inputSchema: {
    type: 'object',
    properties: {
      query:                  { type: 'string', description: 'Search query' },
      max_results_per_domain: { type: 'number', description: 'Max results per domain (default 5)' },
    },
    required: ['query'],
  },
};

export async function searchCrossHandler({ query, max_results_per_domain = 5 }, storage) {
  const domains = await storage.listDomains();
  if (domains.length === 0) return 'No domains found.';

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 'Empty query.';

  const all = [];
  for (const domain of domains) {
    const graph = await buildGraph(domain, storage);
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
        ? node.body.slice(Math.max(0, firstIdx - 60), firstIdx + 160).replace(/\s+/g, ' ').trim()
        : node.body.slice(0, 160).replace(/\s+/g, ' ').trim();
      hits.push({ domain, slug: node.slug, type: node.type, tags: node.tags, score, excerpt });
    }
    hits.sort((a, b) => b.score - a.score);
    all.push(...hits.slice(0, max_results_per_domain));
  }

  if (all.length === 0) return `No results found for "${query}" across any domain.`;

  all.sort((a, b) => b.score - a.score);
  return {
    query,
    domains_searched: domains,
    total_matches: all.length,
    results: all,
  };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
