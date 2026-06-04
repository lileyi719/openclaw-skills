#!/usr/bin/env node
/**
 * Scan LinkedIn External Apply and keep ONLY allowlisted ATS URLs
 * (Lever / Ashby / Rippling / SmartRecruiters / BambooHR / …).
 *
 *   export LINKEDIN_EMAIL=... LINKEDIN_PASSWORD=...
 *   node scripts/scan-ats-external.mjs
 *   node scripts/scan-ats-external.mjs --keywords="Backend Engineer" --limit=25 --pages=5
 *
 * Writes:
 *   skills/job-applications/external_apply_jobs.json
 *   skills/job-applications/external_queue.json  (after prepare)
 */

import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { prepareQueues } from './lib/pipeline-queue.mjs';
import { JOB_APPS_DIR } from './lib/pipeline-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const o = {
    keywords: 'Software Engineer',
    location: 'United States',
    limit: 25,
    pages: 5,
  };
  for (const a of argv) {
    if (a.startsWith('--keywords=')) o.keywords = a.slice(11);
    else if (a.startsWith('--location=')) o.location = a.slice(11);
    else if (a.startsWith('--limit=')) o.limit = Number(a.slice(8)) || 25;
    else if (a.startsWith('--pages=')) o.pages = Number(a.slice(8)) || 5;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function runNode(script, extraArgs = []) {
  const r = spawnSync(process.execPath, [resolve(__dirname, script), ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, PIPELINE_NON_INTERACTIVE: '1', SKIP_PIPELINE_FINAL: '1' },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/scan-ats-external.mjs [options]

Options:
  --keywords=TEXT   (default: Software Engineer)
  --location=TEXT   (default: United States)
  --limit=N         Target allowlisted jobs to collect (default: 25)
  --pages=N         Max LinkedIn pages to scan (default: 5)

Requires LINKEDIN_EMAIL + LINKEDIN_PASSWORD (or logged-in Playwright profile).
`);
  process.exit(0);
}

console.error('[scan-ats] writing scan_config (external + ats_allowlist_only)');
const cfgCode = runNode('write-scan-config.mjs', [
  '--target=external',
  '--ats-only',
  `--keywords=${args.keywords}`,
  `--location=${args.location}`,
  `--limit=${args.limit}`,
  `--pages=${args.pages}`,
]);
if (cfgCode !== 0) process.exit(cfgCode);

console.error('[scan-ats] Playwright scan (may take several minutes)…');
const scanCode = runNode('scan_linkedin_jobs.mjs');
if (scanCode !== 0) process.exit(scanCode);

console.error('[scan-ats] prepare queues');
const prep = prepareQueues(console);

const extPath = resolve(JOB_APPS_DIR, 'external_queue.json');
const queue = existsSync(extPath) ? JSON.parse(readFileSync(extPath, 'utf8')) : [];

console.error('');
console.error('[scan-ats] ── summary ──');
console.error(`  allowlisted in external_queue: ${queue.length}`);
console.error(`  skipped (GH/WD/aggregator/unknown): ${prep.summary.skipped}`);
console.error(`  file: ${extPath}`);
if (queue.length > 0) {
  console.error('  sample:');
  for (const j of queue.slice(0, 5)) {
    console.error(`    - ${j.company} | ${j.platform} | ${j.apply_url || j.external_url}`);
  }
}

process.exit(0);
