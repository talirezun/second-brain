import { buildGraph } from '../graph.js';
import { isValidDomain, isValidSlug, resolveNodeSlug } from '../util.js';

export const getBacklinksDefinition = {
  name: 'get_backlinks',
  description:
    'Return every page that links TO the given slug — the incoming-edge list. ' +
    'For an entity, this reveals every source (summary), concept, and other entity ' +
    'that references it. Essential for understanding a page\'s role in the knowledge ' +
    'graph beyond what it points out to.',
  inputSchema: {
    type: 'object',
    properties: {
      slug:   { type: 'string', description: 'Target page slug' },
      domain: { type: 'string', description: 'Domain slug' },
    },
    required: ['slug', 'domain'],
  },
};

export async function getBacklinksHandler({ slug, domain }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  if (!isValidSlug(slug))     return `Invalid slug "${slug}".`;

  const graph = await buildGraph(domain, storage);
  const key = resolveNodeSlug(slug, graph.nodes);
  if (!key) return `Page "${slug}" not found in domain "${domain}".`;

  const node = graph.nodes.get(key);

  const enriched = node.backlinks.map(b => {
    const source = graph.nodes.get(b.slug);
    return {
      slug: b.slug,
      type: source?.type || 'unknown',
      tags: source?.tags || [],
      section: b.section,
    };
  });

  return {
    slug: key,
    domain,
    backlink_count: enriched.length,
    backlinks: enriched,
  };
}
