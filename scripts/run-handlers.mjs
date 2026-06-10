#!/usr/bin/env node
/**
 * CLI entry point for deterministic ATS handlers.
 *
 * Reads external_queue.json, launches a Playwright browser, processes
 * each job through the appropriate handler. Each job gets its own page
 * for crash isolation. Checkpoint after each job survives crashes.
 *
 * Usage:
 *   node scripts/run-handlers.mjs                         # all jobs in queue
 *   node scripts/run-handlers.mjs --limit=5               # first 5
 *   node scripts/run-handlers.mjs --headless              # headless
 *   node scripts/run-handlers.mjs --ats=ashby             # ashby only
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  launchHandlerBrowser,
  newJobPage,
  loadProfile,
  getResumePath,
  loadCheckpoint,
  saveCheckpoint,
  detectATS,
  appendAppliedJob,
  JOBS_DIR,
} from './handlers/base.js';
import { dispatch } from './handlers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    headless: false,
    keepOpen: false,
    limit: Infinity,
    atsFilter: null,
    resumePath: getResumePath(),
    queueFile: resolve(JOBS_DIR, 'external_queue.json'),
  };
  for (const arg of argv) {
    if (arg === '--headless') opts.headless = true;
    else if (arg === '--keep-open') opts.keepOpen = true;
    else if (arg === '--help') opts.help = true;
    else if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.slice(8), 10) || Infinity;
    else if (arg.startsWith('--ats=')) opts.atsFilter = arg.slice(6).toLowerCase();
    else if (arg.startsWith('--resume=')) opts.resumePath = arg.slice(9);
    else if (arg.startsWith('--queue=')) opts.queueFile = resolve(arg.slice(8));
  }
  return opts;
}

function printHelp() {
  console.log(`
Usage: node scripts/run-handlers.mjs [options]

Options:
  --headless         Run browser in headless mode
  --keep-open        Keep browser open after run (to verify result visually)
  --limit=N          Process at most N jobs (default: all)
  --ats=NAME         Only one ATS type (ashby, lever)
  --resume=PATH      Path to resume PDF
  --queue=PATH       Path to queue JSON (default: external_queue.json)
  --help

Examples:
  node scripts/run-handlers.mjs --headless --limit=5
  node scripts/run-handlers.mjs --ats=ashby --headless
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }

  // 1. Load queue
  if (!existsSync(opts.queueFile)) {
    console.error(`Queue not found: ${opts.queueFile}`);
    process.exit(1);
  }
  const allJobs = JSON.parse(readFileSync(opts.queueFile, 'utf8'));
  if (!Array.isArray(allJobs) || allJobs.length === 0) {
    console.log('Queue is empty.');
    process.exit(0);
  }

  console.log(`\n  Queue: ${opts.queueFile}`);
  console.log(`  Jobs available: ${allJobs.length}`);
  if (opts.limit < allJobs.length) console.log(`  Limit: ${opts.limit}`);
  if (opts.atsFilter) console.log(`  ATS filter: ${opts.atsFilter}`);
  console.log(`  Resume: ${opts.resumePath}`);
  console.log(`  Headless: ${opts.headless}\n`);

  // 2. Filter
  let jobs = allJobs;
  if (opts.atsFilter) {
    jobs = jobs.filter((j) => detectATS(j.apply_url || j.external_url || '') === opts.atsFilter);
    console.log(`  Matching ${opts.atsFilter}: ${jobs.length}\n`);
    if (jobs.length === 0) { console.log('No matching jobs.'); process.exit(0); }
  }
  if (opts.limit < jobs.length) jobs = jobs.slice(0, opts.limit);

  // 3. Profile
  const profile = loadProfile();
  console.log(`  Applicant: ${profile.name} <${profile.email}>`);

  // 4. Checkpoint
  const checkpoint = loadCheckpoint();
  const done = new Set(checkpoint.completed);
  const todo = jobs.filter((j) => !done.has(j.apply_url || j.external_url || j.url));
  console.log(`  Already completed: ${checkpoint.completed.length}`);
  console.log(`  Queued this run: ${todo.length}\n`);

  if (todo.length === 0) {
    console.log('All done. Clear handler_checkpoint.json to rerun.');
    process.exit(0);
  }

  // 5. Launch
  console.log('[handlers] Launching browser...\n');
  const { browser, context } = await launchHandlerBrowser(opts.headless);
  const results = { submitted: 0, failed: 0, errors: [] };

  try {
    for (const job of todo) {
      const applyUrl = job.apply_url || job.external_url || '';
      const company = job.company || '';
      const position = job.position || job.title || '';
      const jobKey = applyUrl || job.url || '';

      if (!applyUrl) {
        console.log(`  SKIP  ${company} — no apply URL`);
        continue;
      }

      const ats = detectATS(applyUrl);
      console.log(`\n  ── ${company} (${ats}) — ${position || ''}`);
      console.log(`      ${applyUrl.slice(0, 120)}`);

      if (!['ashby', 'lever'].includes(ats)) {
        console.log(`      SKIP — ${ats} handler not available`);
        checkpoint.completed.push(jobKey);
        saveCheckpoint(checkpoint);
        continue;
      }

      let page;
      try {
        page = await newJobPage(context, applyUrl, 20_000);
        console.log(`      Page loaded ✓`);

        const result = await dispatch(page, applyUrl, profile, opts.resumePath);

        if (result.ok) {
          console.log(`      ✓ SUBMITTED (${ats})`);
          appendAppliedJob({ status: `submitted_${ats}`, company, position, url: applyUrl, platform: ats });
          results.submitted++;
        } else {
          console.log(`      ✗ FAILED: ${result.error}`);
          results.failed++;
          results.errors.push({ company, url: applyUrl, error: result.error });
        }
      } catch (err) {
        console.log(`      ✗ CRASH: ${err.message}`);
        results.failed++;
        results.errors.push({ company, url: applyUrl, error: err.message });
      } finally {
        if (page) { try { await page.close(); } catch {} }
      }

      checkpoint.completed.push(jobKey);
      saveCheckpoint(checkpoint);
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    if (opts.keepOpen) {
      console.log('
  --keep-open: browser stays open. Press Ctrl+C to close.
');
      await new Promise(() => {}); // wait forever
    }
    await browser.close();
  }

  console.log('\n  ════════════════════════════════');
  console.log('  HANDLER RUN COMPLETE');
  console.log('  ════════════════════════════════');
  console.log(`    Attempted: ${todo.length}`);
  console.log(`    Submitted: ${results.submitted}`);
  console.log(`    Failed:    ${results.failed}`);
  if (results.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const e of results.errors.slice(0, 10)) {
      console.log(`    - ${e.company}: ${e.error}`);
    }
    if (results.errors.length > 10) console.log(`    ... ${results.errors.length - 10} more`);
  }
  console.log('');

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
