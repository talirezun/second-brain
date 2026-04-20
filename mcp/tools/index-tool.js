import { isValidDomain } from '../util.js';

export const getIndexDefinition = {
  name: 'get_index',
  description:
    'Get the full wiki catalog (index.md) for a domain. Returns a human-readable ' +
    'list of every page with its slug. Use this to browse what is available before ' +
    'calling get_node or search_wiki.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain slug (from list_domains)' },
    },
    required: ['domain'],
  },
};

export async function getIndexHandler({ domain }, storage) {
  if (!isValidDomain(domain)) return `Invalid domain name "${domain}". Use list_domains.`;
  const content = await storage.readFile(`${domain}/wiki/index.md`);
  if (!content) return `No index found for domain "${domain}". Try list_domains first.`;
  return content;
}
