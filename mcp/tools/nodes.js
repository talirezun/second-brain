import { buildGraph } from '../graph.js';
import { isValidDomain, isValidSlug, resolveNodeSlug } from '../util.js';

export const getNodeDefinition = {
  name: 'get_node',
  description:
    'Get the full content of a wiki page by slug, enriched with structured metadata: ' +
    'type (entity/concept/summary), tags, outgoing [[wikilinks]] (with the section each ' +
    'appears in), and backlinks (pages that link to this one). This is the primary tool ' +
    'for pulling a single piece of knowledge with its full graph context.',
  inputSchema: {
    type: 'object',
    properties: {
      slug:   { type: 'string', description: 'Page slug e.g. "andrej-karpathy" or "transformer-architecture"' },
      domain: { type: 'string', description: 'Domain slug' },
    },
    required: ['slug', 'domain'],
  },
};

export async function getNodeHandler({ slug, domain }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  if (!isValidSlug(slug))     return `Invalid slug "${slug}". Slugs are lowercase alphanumerics, hyphens, or underscores.`;

  const graph = await buildGraph(domain, storage);
  const resolved = resolveNodeSlug(slug, graph.nodes);
  if (!resolved) {
    return `Page "${slug}" not found in domain "${domain}". Use search_wiki or get_index to find the correct slug.`;
  }
  const node = graph.nodes.get(resolved);

  return {
    slug: node.slug,
    path: node.path,
    type: node.type,
    tags: node.tags,
    source: node.source,
    created: node.created,
    date: node.date,
    outgoing_links: node.outgoing,
    outgoing_count: node.outgoing.length,
    backlinks: node.backlinks,
    backlink_count: node.backlinks.length,
    body: node.body,
  };
}
