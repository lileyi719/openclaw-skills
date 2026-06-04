import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JOB_APPS_DIR } from './pipeline-log.mjs';
import {
  classifyExternalUrl,
  isAllowedAtsUrl,
  isPrimaryAtsUrl,
  shouldSkipExternalUrl,
  detectPlatformFromUrl,
} from './ats-url-filter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadJson(path, fallback = []) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {object} job
 * @param {{ queueTier?: 'primary'|'all', allowlistOnly?: boolean }} opts
 */
export function shouldSkipJob(job, { queueTier = 'primary', allowlistOnly = true } = {}) {
  const externalUrl = job.external_url || job.apply_url || '';
  const linkedinUrl = job.url || job.linkedin_url || '';
  const combined = `${externalUrl}${linkedinUrl}`;

  if (externalUrl) {
    const ext = shouldSkipExternalUrl(externalUrl, {
      allowlistOnly,
      includeSecondary: queueTier !== 'primary',
    });
    if (ext.skip) return { skip: true, reason: ext.reason, tier: ext.tier };
    if (queueTier === 'primary' && !isPrimaryAtsUrl(externalUrl)) {
      return { skip: true, reason: 'not_primary_tier', tier: ext.tier };
    }
    return { skip: false, tier: ext.tier, platform: ext.platform };
  }

  const platform = (job.platform || '').toLowerCase();
  const url = combined.toLowerCase();
  const c = classifyExternalUrl(url);
  if (c.tier === 'blocked_aggregator' || c.tier === 'blocked_platform' || c.tier === 'manual_only') {
    return { skip: true, reason: c.reason, tier: c.tier };
  }
  if (allowlistOnly) {
    return { skip: true, reason: 'missing_external_url' };
  }
  return { skip: false };
}

export { isAllowedAtsUrl, isPrimaryAtsUrl, detectPlatformFromUrl, classifyExternalUrl };

export function isWorkdayJob(job) {
  const platform = (job.platform || '').toLowerCase();
  if (platform === 'workday') return true;
  const url = `${job.external_url || ''}${job.url || ''}`.toLowerCase();
  return url.includes('myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(url);
}

/**
 * Split scan outputs into workday / external / skipped queues.
 */
export function prepareQueues(log, { queueTier = 'primary' } = {}) {
  const externalPath = resolve(JOB_APPS_DIR, 'external_apply_jobs.json');
  const easyPath = resolve(JOB_APPS_DIR, 'easy_apply_jobs.json');

  const externalRaw = loadJson(externalPath, []);
  const easyRaw = loadJson(easyPath, []);

  const workdayQueue = [];
  const externalQueue = [];
  const skippedQueue = [];

  for (const job of externalRaw) {
    const { skip, reason } = shouldSkipJob(job, { queueTier, allowlistOnly: true });
    if (skip) {
      skippedQueue.push({ ...job, skip_reason: reason });
      continue;
    }
    if (isWorkdayJob(job)) {
      workdayQueue.push({
        ...job,
        apply_url: job.external_url || job.url,
      });
    } else {
      externalQueue.push({
        ...job,
        apply_url: job.external_url || job.url,
        ats_tier: classifyExternalUrl(job.external_url || job.url).tier,
      });
    }
  }

  const paths = {
    workday: resolve(JOB_APPS_DIR, 'workday_queue.json'),
    external: resolve(JOB_APPS_DIR, 'external_queue.json'),
    skipped: resolve(JOB_APPS_DIR, 'skipped_jobs.json'),
    easy: easyPath,
  };

  writeFileSync(paths.workday, JSON.stringify(workdayQueue, null, 2));
  writeFileSync(paths.external, JSON.stringify(externalQueue, null, 2));
  writeFileSync(paths.skipped, JSON.stringify(skippedQueue, null, 2));

  const summary = {
    easy: easyRaw.length,
    workday: workdayQueue.length,
    external: externalQueue.length,
    skipped: skippedQueue.length,
    queueTier,
  };

  if (log?.done) {
    log.done('prepare', `Queues ready: easy=${summary.easy} workday=${summary.workday} external=${summary.external} skipped=${summary.skipped} (tier=${queueTier})`, {
      summary,
      paths,
    });
  }

  return { summary, paths, easyRaw, workdayQueue, externalQueue, skippedQueue };
}

export function appendApplied(job, status, extra = {}) {
  const appliedPath = resolve(JOB_APPS_DIR, 'applied_jobs.json');
  const list = loadJson(appliedPath, []);
  list.push({
    ...job,
    status,
    applied_at: new Date().toISOString(),
    ...extra,
  });
  writeFileSync(appliedPath, JSON.stringify(list, null, 2));
}
