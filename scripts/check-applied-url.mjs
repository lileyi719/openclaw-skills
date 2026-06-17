#!/usr/bin/env node
/**
 * Check whether an ATS apply URL was already recorded in applied_jobs.json.
 * Use AFTER opening apply tab, BEFORE filling the form.
 *
 *   node scripts/check-applied-url.mjs 'https://jobs.lever.co/foo/apply'
 *   node scripts/check-applied-url.mjs 'https://...' --retry-incomplete
 */

import {
  loadAppliedJobs,
  normalizeJobUrl,
  findDuplicateJobEntry,
} from './lib/agent-session-record.mjs';

const rawUrl = process.argv[2];
const retryIncomplete = process.argv.includes('--retry-incomplete');

if (!rawUrl) {
  console.error('Usage: node scripts/check-applied-url.mjs \'<apply_url>\' [--retry-incomplete]');
  process.exit(1);
}

const key = normalizeJobUrl(rawUrl);
const jobs = loadAppliedJobs();
const dup = findDuplicateJobEntry(jobs, { url: rawUrl });

if (!dup) {
  console.log(`NEW url=${key}`);
  process.exit(0);
}

const st = String(dup.status || '');
const company = dup.company || dup.job_title || '';

if (st.startsWith('submitted')) {
  console.log(`ALREADY_SUBMITTED status=${st} company=${company} url=${key}`);
  process.exit(0);
}

if (st.startsWith('skipped_incomplete') && retryIncomplete) {
  console.log(`RETRY_INCOMPLETE prior=${st} reason=${dup.reason || dup.detail || ''} company=${company} url=${key}`);
  process.exit(0);
}

console.log(
  `ALREADY_SKIPPED status=${st} reason=${dup.reason || dup.detail || ''} company=${company} url=${key}`,
);
process.exit(0);
