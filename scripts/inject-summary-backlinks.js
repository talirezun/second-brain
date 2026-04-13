#!/usr/bin/env node
/**
 * Retroactively inject [[summaries/...]] backlinks into every entity page
 * that is mentioned in an existing summary, across all domains.
 *
 * Run once after upgrading files.js with the injectSummaryBacklinks fix.
 * Safe to re-run — dedupKey() prevents duplicate backlinks.
 *
 * Usage:
 *   node scripts/inject-summary-backlinks.js
 *   node scripts/inject-summary-backlinks.js --dry-run
 *   node scripts/inject-summary-backlinks.js --domain=articles
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { listDomains, wikiPath, injectSummaryBacklinks } from '../src/brain/files.js';

const dryRun = process.argv.includes('--dry-run');
const domainArg = process.argv.find(a => a.startsWith('--domain='))?.slice('--domain='.length);

async function processDomain(domain) {
  const summariesDir = path.join(wikiPath(domain), 'summaries');
  let files;
  try {
    files = await readdir(summariesDir);
  } catch {
    console.log(`[${domain}] No summaries directory — skipping.`);
    return;
  }

  const summaryFiles = files.filter(f => f.endsWith('.md'));
  if (!summaryFiles.length) {
    console.log(`[${domain}] No summaries found — skipping.`);
    return;
  }

  console.log(`\n[${domain}] Processing ${summaryFiles.length} summaries...`);

  for (const filename of summaryFiles) {
    const summarySlug = filename.replace(/\.md$/, '');
    const fullPath = path.join(summariesDir, filename);
    const content = await readFile(fullPath, 'utf8');

    if (dryRun) {
      console.log(`  [dry-run] Would inject backlinks from: summaries/${filename}`);
      continue;
    }

    console.log(`  Injecting backlinks from: summaries/${filename}`);
    await injectSummaryBacklinks(summarySlug, content, wikiPath(domain));
  }
}

const domains = domainArg ? [domainArg] : await listDomains();
console.log(`Domains to process: ${domains.join(', ')}`);
if (dryRun) console.log('(dry-run mode — no files will be modified)');

for (const domain of domains) {
  await processDomain(domain);
}

console.log('\nDone.');
