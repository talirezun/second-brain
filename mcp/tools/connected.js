import { buildGraph } from '../graph.js';
import { isValidDomain, isValidSlug, resolveNodeSlug } from '../util.js';

export const getConnectedDefinition = {
  name: 'get_connected_nodes',
  description:
    'Traverse the wiki graph outward from a starting page. Returns every linked page ' +
    '(both outgoing and incoming) with the section the link appears in. Supports multi-hop ' +
    'traversal via the depth parameter — essential for reasoning about clusters of ' +
    'related knowledge rather than isolated pages.',
  inputSchema: {
    type: 'object',
    properties: {
      slug:   { type: 'string', description: 'Starting page slug' },
      domain: { type: 'string', description: 'Domain slug' },
      depth:  { type: 'number', description: 'Hops to traverse (default 1, max 3)' },
      direction: {
        type: 'string',
        enum: ['outgoing', 'incoming', 'both'],
        description: 'Which direction to traverse (default "both")',
      },
    },
    required: ['slug', 'domain'],
  },
};

export async function getConnectedHandler({ slug, domain, depth = 1, direction = 'both' }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  if (!isValidSlug(slug))     return `Invalid slug "${slug}".`;

  const graph = await buildGraph(domain, storage);
  const startSlug = resolveNodeSlug(slug, graph.nodes);
  if (!startSlug) return `Page "${slug}" not found in domain "${domain}".`;

  const maxDepth = Math.min(Math.max(1, depth), 3);
  const visited = new Map();   // slug → hop distance
  visited.set(startSlug, 0);
  const frontier = [startSlug];

  for (let hop = 1; hop <= maxDepth; hop++) {
    const nextFrontier = [];
    for (const currentSlug of frontier) {
      const node = graph.nodes.get(currentSlug);
      if (!node) continue;
      const neighbours = [];
      if (direction === 'outgoing' || direction === 'both') {
        for (const link of node.outgoing) neighbours.push(link.slug);
      }
      if (direction === 'incoming' || direction === 'both') {
        for (const back of node.backlinks) neighbours.push(back.slug);
      }
      for (const neighbour of neighbours) {
        if (!graph.nodes.has(neighbour)) continue;
        if (visited.has(neighbour)) continue;
        visited.set(neighbour, hop);
        nextFrontier.push(neighbour);
      }
    }
    if (nextFrontier.length === 0) break;
    frontier.splice(0, frontier.length, ...nextFrontier);
  }

  const start = graph.nodes.get(startSlug);
  const connected = [];
  for (const [s, hop] of visited) {
    if (s === startSlug) continue;
    const n = graph.nodes.get(s);
    if (!n) continue;
    connected.push({
      slug: n.slug,
      type: n.type,
      tags: n.tags,
      hop,
      preview: n.body.slice(0, 280).replace(/\s+/g, ' ').trim(),
    });
  }

  return {
    start: startSlug,
    domain,
    depth: maxDepth,
    direction,
    outgoing_from_start: start.outgoing,
    backlinks_to_start: start.backlinks,
    connected_count: connected.length,
    connected,
  };
}
