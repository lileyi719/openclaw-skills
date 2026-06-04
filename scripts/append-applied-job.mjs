#!/usr/bin/env node
/**
 * Safely append one entry to applied_jobs.json (avoids sed/manual JSON edits).
 *
 *   node scripts/append-applied-job.mjs '{"status":"skipped_aggregator","reason":"Sundayy","platform":"sundayy","url":"..."}'
 */

import {
  loadAppliedJobs,
  APPLIED_JOBS_PATH,
  findDuplicateJobEntry,
  normalizeJobUrl,
  normalizeSubmitEntry,
} from './lib/agent-session-record.mjs';
import { validateAppendEntry } from './lib/ats-url-filter.mjs';
import { writeFileSync } from 'fs';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/append-applied-job.mjs \'<json object>\'');
  process.exit(1);
}

let entry;
try {
  entry = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

if (!entry.status || typeof entry.status !== 'string') {
  console.error('Entry must include status string');
  process.exit(1);
}

entry.method = entry.method ?? 'openclaw_browser';
entry.ts = entry.ts ?? new Date().toISOString();

const beforeStatus = entry.status;
entry = normalizeSubmitEntry(entry);
if (beforeStatus !== entry.status) {
  console.error(`normalized status: ${beforeStatus} → ${entry.status}`);
}

const validation = validateAppendEntry(entry);
if (!validation.ok) {
  console.error(validation.error);
  process.exit(1);
}

const jobs = loadAppliedJobs();
const dup = findDuplicateJobEntry(jobs, entry);
if (dup) {
  console.log(
    `duplicate skipped (${dup.status}${dup.company ? ` ${dup.company}` : ''}) `
    + `url=${normalizeJobUrl(entry.url)}`,
  );
  process.exit(0);
}

jobs.push(entry);
writeFileSync(APPLIED_JOBS_PATH, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
console.log(`appended ${entry.status}${entry.company ? ` (${entry.company})` : ''}`);
