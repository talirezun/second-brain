/**
 * Local filesystem storage adapter for the My Curator MCP server.
 *
 * Phase 1 — reads markdown files directly from the user's domains/ folder.
 * Phase 3 will add an r2.js adapter with the same interface.
 *
 * Domains path resolution order:
 *   1. --domains-path CLI arg (passed from the generated Claude Desktop config)
 *   2. DOMAINS_PATH env var
 *   3. .curator-config.json in the Curator project root (alongside this file)
 *   4. ./domains relative to process.cwd()
 */

import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURATOR_ROOT = path.resolve(__dirname, '../..');

export function createStorageAdapter({ domainsPath } = {}) {
  const resolveDomainsPath = () => {
    if (domainsPath) return path.resolve(domainsPath);
    if (process.env.DOMAINS_PATH) return path.resolve(process.env.DOMAINS_PATH);
    const configPath = path.join(CURATOR_ROOT, '.curator-config.json');
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
        if (cfg.domainsPath) return path.resolve(cfg.domainsPath);
      } catch { /* fall through */ }
    }
    return path.join(CURATOR_ROOT, 'domains');
  };

  const base = resolveDomainsPath();
  const resolvedBase = path.resolve(base);

  /**
   * Resolve a relative path under base and refuse to escape the base directory.
   * Returns null for any attempt at path traversal (../, absolute paths, etc.).
   * This is the single chokepoint for all filesystem reads driven by LLM input.
   */
  const resolveInsideBase = (relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath) return null;
    // Reject absolute paths outright — the MCP never needs them.
    if (path.isAbsolute(relativePath)) return null;
    const resolved = path.resolve(resolvedBase, relativePath);
    // Must live under base (path.resolve canonicalises .., //, etc.)
    const rel = path.relative(resolvedBase, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return resolved;
  };

  return {
    getType() { return 'local'; },
    getBase() { return base; },

    async baseExists() {
      try { const s = await fs.stat(base); return s.isDirectory(); }
      catch { return false; }
    },

    async listDomains() {
      try {
        const entries = await fs.readdir(base, { withFileTypes: true });
        const candidates = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name);
        // A directory is only a real domain if it has a CLAUDE.md schema.
        // Sync-deleted domains sometimes leave empty dir shells behind because
        // git doesn't track empty directories — filtering on the schema file
        // ignores those ghosts.
        const real = [];
        for (const name of candidates) {
          try {
            const s = await fs.stat(path.join(base, name, 'CLAUDE.md'));
            if (s.isFile()) real.push(name);
          } catch { /* no schema → not a real domain */ }
        }
        return real.sort();
      } catch {
        return [];
      }
    },

    async readFile(relativePath) {
      const full = resolveInsideBase(relativePath);
      if (!full) return null;    // traversal attempt, absolute path, or empty input
      try { return await fs.readFile(full, 'utf8'); }
      catch { return null; }
    },

    /** Returns all .md files under a domain's wiki/ folder with their content. */
    async listWikiFiles(domain) {
      // Reject any domain containing path separators or parent refs
      if (typeof domain !== 'string' || !domain || domain.includes('/') || domain.includes('\\') || domain.includes('..')) {
        return [];
      }
      const wikiRoot = resolveInsideBase(path.join(domain, 'wiki'));
      if (!wikiRoot) return [];
      const files = [];
      const walk = async (dir) => {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith('.md')) {
            const rel = path.relative(wikiRoot, full).split(path.sep).join('/');
            let content = '';
            try { content = await fs.readFile(full, 'utf8'); } catch {}
            files.push({ path: rel, content });
          }
        }
      };
      await walk(wikiRoot);
      return files;
    },
  };
}
