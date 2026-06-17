#!/usr/bin/env node
/**
 * One-time / periodic cleanup of applied_jobs.json:
 * - bare "submitted" → submitted_<platform>
 * - mistaken GH/WD submitted → skipped_platform
 * - drop exact duplicate URLs (keep first)
 */

import { writeFileSync } from 'fs';
import {
  APPLIED_JOBS_PATH,
  loadAppliedJobs,
  normalizeJobUrl,
  normalizeSubmitEntry,
} from './lib/agent-session-record.mjs';

const jobs = loadAppliedJobs();
const seen = new Set();
let changed = 0;
const out = [];

for (const raw of jobs) {
  const before = JSON.stringify(raw);
  const entry = normalizeSubmitEntry({ ...raw });
  const key = normalizeJobUrl(entry.url);
  if (key && seen.has(key)) {
    changed += 1;
    continue;
  }
  if (key) seen.add(key);
  if (before !== JSON.stringify(entry)) changed += 1;
  out.push(entry);
}

writeFileSync(APPLIED_JOBS_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`normalize-applied-jobs: ${jobs.length} → ${out.length} entries (${changed} fixes/dedupes)`);
