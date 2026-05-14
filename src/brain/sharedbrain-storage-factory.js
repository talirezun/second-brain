/**
 * Shared Brain — Storage Adapter Factory
 *
 * Builds the right adapter for a given connection's storage_type.
 *
 * Currently supported:
 *   - "local"        → LocalFolderStorageAdapter (Phase 2A — battle-testing)
 *
 * Coming next:
 *   - "github"       → GitHubStorageAdapter (Phase 3)
 *   - "cloudflare-r2" → CloudflareR2Adapter (Phase 3.1)
 *
 * The brain layer (push/pull/synthesis) only ever calls
 * `createStorageAdapter(connection)` — it does not know or care which
 * concrete class it gets back. Swapping storage backends is a config
 * change, not a code change.
 */

import { LocalFolderStorageAdapter } from './sharedbrain-local-adapter.js';

export function createStorageAdapter(connection) {
  if (!connection || typeof connection !== 'object') {
    throw new Error('createStorageAdapter: connection object is required');
  }

  switch (connection.storage_type) {
    case 'local':
      return new LocalFolderStorageAdapter({
        storage_root: connection.local_storage_path,
      });

    case 'github':
      throw new Error(
        'SharedBrain storage_type "github": GitHubStorageAdapter is not yet implemented (Phase 3).'
      );

    case 'cloudflare-r2':
      throw new Error(
        'SharedBrain storage_type "cloudflare-r2": CloudflareR2Adapter is not yet implemented (Phase 3.1).'
      );

    default:
      throw new Error(
        `SharedBrain unknown storage_type: "${connection.storage_type}". ` +
        `Supported in this version: "local". Coming soon: "github", "cloudflare-r2".`
      );
  }
}
