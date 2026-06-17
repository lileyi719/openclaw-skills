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
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';

const BACKUP_PATH = `${APPLIED_JOBS_PATH}.bak`;
const SHRINK_GUARD_MIN = 20;
const SHRINK_GUARD_DELTA = 5;

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

if (existsSync(BACKUP_PATH)) {
  try {
    const bak = JSON.parse(readFileSync(BACKUP_PATH, 'utf8'));
    if (Array.isArray(bak) && bak.length >= SHRINK_GUARD_MIN && bak.length > jobs.length + SHRINK_GUARD_DELTA) {
      console.error(
        `applied_jobs shrink detected (${jobs.length} rows vs backup ${bak.length}) — `
        + 'refusing append. Restore: cp skills/job-applications/applied_jobs.json.bak skills/job-applications/applied_jobs.json',
      );
      process.exit(1);
    }
  } catch {
    // ignore corrupt backup
  }
}

const dup = findDuplicateJobEntry(jobs, entry);
if (dup) {
  console.log(
    `duplicate skipped (${dup.status}${dup.company ? ` ${dup.company}` : ''}) `
    + `url=${normalizeJobUrl(entry.url)}`,
  );
  process.exit(0);
}

jobs.push(entry);

if (existsSync(APPLIED_JOBS_PATH)) {
  try {
    copyFileSync(APPLIED_JOBS_PATH, BACKUP_PATH);
  } catch {
    // best-effort backup
  }
}

writeFileSync(APPLIED_JOBS_PATH, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
console.log(`appended ${entry.status}${entry.company ? ` (${entry.company})` : ''}`);
