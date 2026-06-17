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

/** LinkedIn Easy Apply — not counted as External Apply progress. */
export function isLinkedInEasyApplySubmitted(status, url = '') {
  const st = String(status || '').toLowerCase();
  if (/linkedineasyapply|linkedin_easy_apply|linkedin_easy/i.test(st)) return true;
  return isSubmittedStatus(st) && /linkedin\.com\/jobs\/view/i.test(String(url || ''));
}

/** External ATS submit only (Ashby / Lever / Workday / …). Excludes LinkedIn Easy Apply. */
export function isExternalSubmittedStatus(status, url = '') {
  return isSubmittedStatus(status) && !isLinkedInEasyApplySubmitted(status, url);
}

/** Infer ATS platform slug from apply URL (for status normalization). */
export function inferPlatformFromUrl(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('jobs.ashbyhq.com') || u.includes('ashby_jid')) return 'ashbyhq';
  if (u.includes('jobs.lever.co')) return 'lever';
  if (u.includes('myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(u)) return 'myworkdayjobs';
  if (u.includes('greenhouse.io') || u.includes('gh_jid') || u.includes('gh_src=')) return 'greenhouse';
  if (u.includes('ats.rippling.com') || u.includes('rippling.com')) return 'rippling';
  if (u.includes('ultipro.com')) return 'ultipro';
  if (u.includes('hiresome.ai')) return 'hiresome';
  return '';
}


/** Normalize agent append payloads (bare `submitted`, platform suffix). */
export function normalizeSubmitEntry(entry) {
  const out = { ...entry };
  const url = out.url || '';

  if (/^submitted/i.test(out.status ?? '') && inferPlatformFromUrl(url) === 'greenhouse') {
    out.status = 'submitted_greenhouse';
    out.platform = 'greenhouse';
  }

  if (/^submitted/i.test(out.status ?? '') && (out.platform === 'workday' || inferPlatformFromUrl(url) === 'myworkdayjobs')) {
    out.status = 'submitted_workday';
    out.platform = 'workday';
  }

  if (out.status === 'applied') {
    const inferred = inferPlatformFromUrl(url);
    if (inferred === 'greenhouse') {
      out.status = 'submitted_greenhouse';
      out.platform = 'greenhouse';
    } else if (inferred === 'myworkdayjobs') {
      out.status = 'submitted_workday';
      out.platform = 'workday';
    } else if (inferred === 'ashbyhq') {
      out.status = 'submitted_ashbyhq';
      out.platform = 'ashbyhq';
    }
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
    if (/\/application\/?$/i.test(path)) {
      path = path.replace(/\/application\/?$/i, '');
    }
    if (path.endsWith('/apply') === false && /\/apply\/?$/i.test(path)) {
      path = path.replace(/\/apply\/?$/i, '');
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
    if (isExternalSubmittedStatus(st, e?.url)) {
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

/** Best-effort timestamp for run progress (prefers append script `ts`). */
export function entryTimestampMs(entry) {
  for (const key of ['ts', 'timestamp', 'submittedAt', 'appliedAt']) {
    const raw = entry?.[key];
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

/** Stable key for dedupe within a run diff. */
export function entryProgressKey(entry) {
  const url = normalizeJobUrl(entry?.url || entry?.applyUrl || '');
  const st = entry?.status ?? '';
  if (url) return `${url}|${st}`;
  const ms = entryTimestampMs(entry);
  if (Number.isFinite(ms)) {
    return `@${ms}|${st}|${entry?.company ?? entry?.company_name ?? ''}`;
  }
  return '';
}

/**
 * Snapshot at run start — survives applied_jobs.json truncate/replace mid-run.
 * @param {Date|string|number} startedAt
 */
export function createRunProgressBaseline(startedAt = new Date()) {
  const startedAtMs = startedAt instanceof Date
    ? startedAt.getTime()
    : typeof startedAt === 'number'
      ? startedAt
      : Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    throw new Error('createRunProgressBaseline: invalid startedAt');
  }
  const snapshot = loadAppliedJobs();
  const snapshotKeys = new Set();
  for (const e of snapshot) {
    const k = entryProgressKey(e);
    if (k) snapshotKeys.add(k);
  }
  return {
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    snapshotLength: snapshot.length,
    snapshotKeys,
  };
}

const RUN_TS_GRACE_MS = 2000;

function isEntryFromRun(entry, baseline, seen) {
  const key = entryProgressKey(entry);
  if (key && seen.has(key)) return false;

  const ms = entryTimestampMs(entry);
  if (Number.isFinite(ms) && ms >= baseline.startedAtMs - RUN_TS_GRACE_MS) {
    if (key) seen.add(key);
    return true;
  }

  if (key && baseline.snapshotKeys && !baseline.snapshotKeys.has(key)) {
    seen.add(key);
    return true;
  }

  return false;
}

/** Entries belonging to this run (timestamp + snapshot keys; not slice-length). */
export function diffAppliedJobsSinceBaseline(baseline, after) {
  if (!baseline) return [];
  const seen = new Set();
  const out = [];
  for (const e of after) {
    if (isEntryFromRun(e, baseline, seen)) out.push(e);
  }
  return out;
}

/**
 * @deprecated Prefer diffAppliedJobsSinceBaseline — slice breaks when file is truncated.
 */
export function diffAppliedJobs(before, after, baseline = null) {
  if (baseline) return diffAppliedJobsSinceBaseline(baseline, after);
  if (after.length <= before.length) return [];
  return after.slice(before.length);
}

export function appendSessionRun(record) {
  const runs = loadSessionRuns();
  runs.push(record);
  writeFileSync(SESSION_RUNS_PATH, `${JSON.stringify(runs, null, 2)}\n`, 'utf8');
  return record;
}
