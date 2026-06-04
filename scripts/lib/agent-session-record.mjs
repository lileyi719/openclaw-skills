import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { JOB_APPS_DIR } from './pipeline-log.mjs';

export const APPLIED_JOBS_PATH = resolve(JOB_APPS_DIR, 'applied_jobs.json');
export const SESSION_RUNS_PATH = resolve(JOB_APPS_DIR, 'session_runs.json');

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function loadAppliedJobs() {
  if (!existsSync(APPLIED_JOBS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(APPLIED_JOBS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function loadSessionRuns() {
  if (!existsSync(SESSION_RUNS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(SESSION_RUNS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function isSubmittedStatus(status) {
  return typeof status === 'string'
    && (status === 'submitted' || status.startsWith('submitted_'));
}

/** Infer ATS platform slug from apply URL (for status normalization). */
export function inferPlatformFromUrl(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('jobs.ashbyhq.com') || u.includes('ashby_jid')) return 'ashbyhq';
  if (u.includes('jobs.lever.co')) return 'lever';
  if (u.includes('myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(u)) return 'myworkdayjobs';
  if (u.includes('greenhouse.io') || u.includes('gh_jid')) return 'greenhouse';
  if (u.includes('eightfold.ai')) return 'eightfold';
  if (u.includes('buildbuddy.io')) return 'buildbuddy';
  if (u.includes('bamboohr.com')) return 'bamboohr';
  if (u.includes('rippling.com')) return 'rippling';
  return '';
}

const GH_WD_URL = /greenhouse\.io|gh_jid|myworkdayjobs|\.wd\d+\.myworkday/i;

/** Normalize agent append payloads (bare `submitted`, GH/WD mistaken submit). */
export function normalizeSubmitEntry(entry) {
  const out = { ...entry };
  const url = out.url || '';

  if (GH_WD_URL.test(url) && /^submitted/i.test(out.status ?? '')) {
    out.status = 'skipped_platform';
    out.reason = out.reason
      || 'Auto-corrected: Greenhouse/Workday URLs must be skipped_platform, not submitted';
    out.platform = out.platform || inferPlatformFromUrl(url) || 'greenhouse';
    return out;
  }

  if (out.status === 'submitted') {
    const platform = out.platform || inferPlatformFromUrl(url) || 'unknown';
    const slug = platform.replace(/[^a-z0-9]/gi, '') || 'unknown';
    out.status = `submitted_${slug}`;
    out.platform = platform;
  } else if (out.status === 'submitted_ashby') {
    out.status = 'submitted_ashbyhq';
    out.platform = out.platform || 'ashbyhq';
  }

  return out;
}

/** Normalize ATS/job URL for dedupe (strip query/hash, lowercase host, trim trailing slash). */
export function normalizeJobUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.search = '';
    let path = u.pathname.replace(/\/+$/, '');
    if (path.endsWith('/apply') === false && /\/apply\/?$/i.test(path)) {
      path = path.replace(/\/apply\/?$/i, '/apply');
    }
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
  } catch {
    return raw.trim().toLowerCase().split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}

/** Return first existing entry with same normalized URL, if any. */
export function findDuplicateJobEntry(jobs, entry) {
  const key = normalizeJobUrl(entry?.url);
  if (!key) return null;
  return jobs.find((j) => normalizeJobUrl(j?.url) === key) ?? null;
}

export function summarizeJobs(entries) {
  let submitted = 0;
  let skipped = 0;
  const byPlatform = {};
  for (const e of entries) {
    const st = e?.status ?? '';
    if (isSubmittedStatus(st)) {
      submitted += 1;
      const p = e.platform || 'unknown';
      byPlatform[p] = (byPlatform[p] || 0) + 1;
    } else if (typeof st === 'string' && st.startsWith('skipped')) {
      skipped += 1;
    }
  }
  return {
    total: entries.length,
    submitted,
    skipped,
    byPlatform,
  };
}

/** New entries appended during this run (slice from prior length). */
export function diffAppliedJobs(before, after) {
  if (after.length <= before.length) return [];
  return after.slice(before.length);
}

export function appendSessionRun(record) {
  const runs = loadSessionRuns();
  runs.push(record);
  writeFileSync(SESSION_RUNS_PATH, `${JSON.stringify(runs, null, 2)}\n`, 'utf8');
  return record;
}
