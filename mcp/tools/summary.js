import { isValidDomain, isValidSlug } from '../util.js';

export const getSummaryDefinition = {
  name: 'get_summary',
  description:
    'Get the full summary page for a specific ingested source (one source = one summary). ' +
    'Summaries contain the original document\'s key facts plus links to every entity and ' +
    'concept extracted from it — use them to trace knowledge back to its source.',
  inputSchema: {
    type: 'object',
    properties: {
      slug:   { type: 'string', description: 'Summary page slug (from get_index)' },
      domain: { type: 'string', description: 'Domain slug' },
    },
    required: ['slug', 'domain'],
  },
};

export async function getSummaryHandler({ slug, domain }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  if (!isValidSlug(slug))     return `Invalid slug "${slug}".`;

  const content = await storage.readFile(`${domain}/wiki/summaries/${slug}.md`);
  if (!content) return `Summary "${slug}" not found in domain "${domain}". Use get_index to browse available summaries.`;
  return content;
}
