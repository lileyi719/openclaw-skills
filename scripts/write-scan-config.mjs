#!/usr/bin/env node
/**
 * Write skills/job-applications/scan_config.json
 *
 *   node scripts/write-scan-config.mjs --target=external --keywords="Software Engineer" --location="United States" --limit=15 --pages=3
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeScanTarget, buildLinkedInSearchUrl } from './lib/linkedin-search.mjs';
import { JOB_APPS_DIR } from './lib/pipeline-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { limit: 15, max_pages: 3, ats_allowlist_only: false };
  for (const a of argv) {
    if (a.startsWith('--target=')) o.scan_target = a.slice(9);
    else if (a.startsWith('--keywords=')) o.keywords = a.slice(11);
    else if (a.startsWith('--location=')) o.location = a.slice(11);
    else if (a.startsWith('--limit=')) o.limit = Number(a.slice(8), 10);
    else if (a.startsWith('--pages=')) o.max_pages = Number(a.slice(8), 10);
    else if (a.startsWith('--url=')) o.search_url = a.slice(6);
    else if (a === '--ats-only') o.ats_allowlist_only = true;
    else if (a === '--no-ats-only') o.ats_allowlist_only = false;
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
const scan_target = normalizeScanTarget(args.scan_target || process.env.SCAN_TARGET || 'all');
const ats_allowlist_only =
  args.ats_allowlist_only || (scan_target === 'external' && !process.argv.includes('--no-ats-only'));

const config = {
  scan_target,
  keywords: args.keywords || 'Software Engineer',
  location: args.location || 'United States',
  limit: args.limit,
  max_pages: args.max_pages,
  ats_allowlist_only,
  search_url: args.search_url || buildLinkedInSearchUrl({
    keywords: args.keywords,
    location: args.location,
    scanTarget: scan_target,
  }),
  instructions: null,
};

mkdirSync(JOB_APPS_DIR, { recursive: true });
const path = resolve(JOB_APPS_DIR, 'scan_config.json');
writeFileSync(path, JSON.stringify(config, null, 2));
console.error(`[scan_config] wrote ${path}`);
console.error(JSON.stringify(config, null, 2));
