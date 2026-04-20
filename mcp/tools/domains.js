export const listDomainsDefinition = {
  name: 'list_domains',
  description:
    'List all available knowledge domains (topic areas) in this Curator wiki. ' +
    'Always call this first to discover which domains exist before querying specific ones.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export async function listDomainsHandler(_args, storage) {
  if (!(await storage.baseExists())) {
    return `Curator domains folder not found at ${storage.getBase()}. ` +
      `The Curator must be installed and have at least one domain created.`;
  }
  const domains = await storage.listDomains();
  if (domains.length === 0) {
    return `No domains found in ${storage.getBase()}. ` +
      `Open the Curator app and create a domain first.`;
  }
  return {
    domains_path: storage.getBase(),
    count: domains.length,
    domains,
  };
}
