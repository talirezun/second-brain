import { buildGraph } from '../graph.js';
import { isValidDomain } from '../util.js';

export const getGraphOverviewDefinition = {
  name: 'get_graph_overview',
  description:
    'Orientation snapshot of a domain\'s knowledge graph. By default returns a compact ' +
    'summary (stats, top hubs, orphan count, top tags) that scales to wikis with thousands ' +
    'of pages. Use include_nodes to enumerate pages (size-guarded), include_edges for the ' +
    'full edge list, and min_connections to focus on well-connected nodes. For a single ' +
    'page\'s neighborhood, prefer get_connected_nodes.',
  inputSchema: {
    type: 'object',
    properties: {
      domain:          { type: 'string', description: 'Domain slug' },
      include_nodes:   { type: 'boolean', description: 'Enumerate every matching node (slug/type/tags/degrees). Default false — response is a compact summary.' },
      include_edges:   { type: 'boolean', description: 'Include the full edge list. Default false — can exceed the 1 MB MCP limit on wikis larger than a few hundred pages.' },
      include_body:    { type: 'boolean', description: 'Include each page\'s body in enumerated nodes (only when include_nodes is also true). Default false.' },
      min_connections: { type: 'number', description: 'Only include nodes with at least N total edges (default 0 = all). Set to 2 or 3 to skip noise.' },
      hubs_limit:      { type: 'number', description: 'Max number of hub slugs to return (default 20).' },
      orphan_limit:    { type: 'number', description: 'Max number of orphan slugs to return (default 20).' },
      top_tags_limit:  { type: 'number', description: 'Max number of top tags (by page count) to preview (default 10).' },
    },
    required: ['domain'],
  },
};

export async function getGraphOverviewHandler(
  {
    domain,
    include_nodes   = false,
    include_edges   = false,
    include_body    = false,
    min_connections = 0,
    hubs_limit      = 20,
    orphan_limit    = 20,
    top_tags_limit  = 10,
  },
  storage,
) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  const graph = await buildGraph(domain, storage);
  if (graph.nodes.size === 0) return `Domain "${domain}" has no wiki pages yet.`;

  const allNodes = [...graph.nodes.values()];

  // Filter by min_connections for both enumeration AND hub/orphan calc
  const matching = allNodes.filter(n => {
    const deg = n.backlinks.length + n.outgoing.length;
    return deg >= min_connections;
  });

  // Hubs (top-N by degree, descending)
  const sortedByDegree = [...matching].sort(
    (a, b) => (b.backlinks.length + b.outgoing.length) - (a.backlinks.length + a.outgoing.length),
  );
  const hubs = sortedByDegree.slice(0, hubs_limit).map(n => ({
    slug: n.slug,
    type: n.type,
    in_degree: n.backlinks.length,
    out_degree: n.outgoing.length,
  }));

  // Orphans — no connections either way
  const allOrphans = allNodes.filter(n => n.backlinks.length === 0 && n.outgoing.length === 0);
  const orphans = {
    count: allOrphans.length,
    sample: allOrphans.slice(0, orphan_limit).map(n => n.slug),
  };

  // Top tags (by page count, descending)
  const topTags = graph.tags.slice(0, top_tags_limit).map(t => ({
    tag: t.tag,
    count: t.count,
  }));

  // Type counts across ALL nodes (not just the matching subset — useful for orientation)
  const typeCounts = countBy(allNodes, n => n.type);

  const result = {
    domain,
    node_count: allNodes.length,
    matching_count: matching.length,
    edge_count: graph.edges.length,
    tag_count: graph.tags.length,
    type_counts: typeCounts,
    hubs,
    orphans,
    top_tags: topTags,
  };

  // Optionally enumerate nodes
  if (include_nodes) {
    result.nodes = matching.map(n => {
      const entry = {
        slug: n.slug,
        type: n.type,
        tags: n.tags,
        in_degree: n.backlinks.length,
        out_degree: n.outgoing.length,
      };
      if (include_body) entry.body = n.body;
      return entry;
    });
  }

  // Optionally include edges
  if (include_edges) {
    result.edges = graph.edges;
  }

  // Hints guide the LLM when defaults are restrictive
  const hints = [];
  if (!include_nodes) hints.push('Default omits full node list — pass include_nodes: true to enumerate.');
  if (!include_edges) hints.push('Default omits edges — pass include_edges: true only on small wikis or with min_connections set.');
  if (hints.length) result._hints = hints;

  return result;
}

function countBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
