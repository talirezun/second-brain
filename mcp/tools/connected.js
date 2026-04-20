import { buildGraph } from '../graph.js';
import { isValidDomain, isValidSlug, resolveNodeSlug } from '../util.js';

export const getConnectedDefinition = {
  name: 'get_connected_nodes',
  description:
    'Traverse the wiki graph outward from a starting page. Returns linked pages ' +
    '(outgoing and incoming) with the section each link appears in. Supports multi-hop ' +
    'traversal via depth, but DEPTH 2 ON HUB NODES CAN REACH HUNDREDS OF RESULTS — the ' +
    'tool ranks by hop distance then by degree and caps at max_nodes (default 60) to ' +
    'stay well under MCP response limits. For a complete neighbourhood dump, raise ' +
    'max_nodes explicitly.',
  inputSchema: {
    type: 'object',
    properties: {
      slug:      { type: 'string', description: 'Starting page slug' },
      domain:    { type: 'string', description: 'Domain slug' },
      depth:     { type: 'number', description: 'Hops to traverse (default 1, max 2)' },
      direction: {
        type: 'string',
        enum: ['outgoing', 'incoming', 'both'],
        description: 'Which direction to traverse (default "both")',
      },
      max_nodes:     { type: 'number', description: 'Cap on connected nodes in the response (default 60). Sorted closest + most-connected first.' },
      preview_chars: { type: 'number', description: 'Characters of each node\'s body to include as a preview (default 120; 0 = none)' },
      include_start_neighbourhood: { type: 'boolean', description: 'Include the full outgoing-links and backlinks arrays of the START node (default true).' },
    },
    required: ['slug', 'domain'],
  },
};

export async function getConnectedHandler(
  {
    slug, domain,
    depth = 1,
    direction = 'both',
    max_nodes = 60,
    preview_chars = 120,
    include_start_neighbourhood = true,
  },
  storage,
) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  if (!isValidSlug(slug))     return `Invalid slug "${slug}".`;

  const graph = await buildGraph(domain, storage);
  const startSlug = resolveNodeSlug(slug, graph.nodes);
  if (!startSlug) return `Page "${slug}" not found in domain "${domain}".`;

  const maxDepth = Math.min(Math.max(1, depth), 2);
  const visited = new Map();                   // slug → hop distance
  visited.set(startSlug, 0);
  let frontier = [startSlug];

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
    frontier = nextFrontier;
  }

  const start = graph.nodes.get(startSlug);

  // Rank connected nodes: closest hops first, then highest degree (hubs).
  const ranked = [];
  for (const [s, hop] of visited) {
    if (s === startSlug) continue;
    const n = graph.nodes.get(s);
    if (!n) continue;
    ranked.push({ node: n, hop, degree: n.backlinks.length + n.outgoing.length });
  }
  ranked.sort((a, b) => a.hop - b.hop || b.degree - a.degree);

  const totalConnected = ranked.length;
  const cap = Math.max(1, max_nodes);
  const top = ranked.slice(0, cap);
  const connected = top.map(({ node, hop }) => {
    const entry = {
      slug: node.slug,
      type: node.type,
      tags: node.tags,
      hop,
      in_degree: node.backlinks.length,
      out_degree: node.outgoing.length,
    };
    if (preview_chars > 0) {
      entry.preview = node.body.slice(0, preview_chars).replace(/\s+/g, ' ').trim();
    }
    return entry;
  });

  const result = {
    start: startSlug,
    domain,
    depth: maxDepth,
    direction,
    connected_count_total: totalConnected,
    connected_count_returned: connected.length,
    connected,
  };

  if (include_start_neighbourhood) {
    result.outgoing_from_start = start.outgoing;
    result.backlinks_to_start  = start.backlinks;
  }

  if (totalConnected > connected.length) {
    result._hint = `${totalConnected - connected.length} more connected node(s) exist beyond max_nodes. ` +
      `Raise max_nodes, narrow direction to "outgoing"/"incoming", or inspect specific slugs via get_node.`;
  }

  return result;
}
