import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JOB_APPS_DIR } from './pipeline-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * LinkedIn job search URL + scan target rules.
 *
 * scan_target:
 *   easy_apply  — only collect Easy Apply (f_AL=true, skip non-EA cards)
 *   external    — only collect external / company-site apply (no f_AL, skip EA cards)
 *   all         — collect both into separate JSON files
 */

export const SCAN_TARGETS = ['easy_apply', 'external', 'all'];

export function normalizeScanTarget(raw) {
  const t = String(raw || 'all').toLowerCase().replace(/\s+/g, '_');
  if (t === 'external_jobs' || t === 'external_apply' || t === 'external') return 'external';
  if (t === 'easy_apply_jobs' || t === 'easy' || t === 'easy_apply') return 'easy_apply';
  if (t === 'all' || t === 'both') return 'all';
  return 'all';
}

export function buildLinkedInSearchUrl({ keywords, location, scanTarget }) {
  const params = new URLSearchParams();
  params.set('keywords', keywords || 'Software Engineer');
  params.set('location', location || 'United States');
  if (normalizeScanTarget(scanTarget) === 'easy_apply') {
    params.set('f_AL', 'true');
  }
  params.set('sortBy', 'DD');
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/** What to write after scan completes */
export function outputFilesForTarget(scanTarget) {
  const t = normalizeScanTarget(scanTarget);
  if (t === 'easy_apply') {
    return { writeEasy: true, writeExternal: false, clearEasy: false, clearExternal: true };
  }
  if (t === 'external') {
    return { writeEasy: false, writeExternal: true, clearEasy: true, clearExternal: false };
  }
  return { writeEasy: true, writeExternal: true, clearEasy: false, clearExternal: false };
}

export function shouldCollectEasyApply(scanTarget) {
  const t = normalizeScanTarget(scanTarget);
  return t === 'easy_apply' || t === 'all';
}

export function shouldCollectExternal(scanTarget) {
  const t = normalizeScanTarget(scanTarget);
  return t === 'external' || t === 'all';
}

export function loadScanConfig() {
  const configPath = resolve(JOB_APPS_DIR, 'scan_config.json');
  const envTarget = process.env.SCAN_TARGET;
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const scan_target = normalizeScanTarget(raw.scan_target || envTarget || 'all');
    const keywords = raw.keywords || 'Software Engineer';
    const location = raw.location || 'United States';
    return {
      scan_target,
      keywords,
      location,
      limit: Number(raw.limit || process.env.SCAN_LIMIT || 15, 10),
      max_pages: Number(raw.max_pages || 3, 10),
      search_url:
        raw.search_url ||
        buildLinkedInSearchUrl({ keywords, location, scanTarget: scan_target }),
      instructions: raw.instructions || null,
      ats_allowlist_only: raw.ats_allowlist_only !== false && scan_target === 'external',
    };
  }
  const scan_target = normalizeScanTarget(envTarget || 'all');
  const keywords = process.env.LINKEDIN_KEYWORDS || 'Software Engineer';
  const location = process.env.LINKEDIN_LOCATION || 'United States';
  return {
    scan_target,
    keywords,
    location,
    limit: Number(process.env.SCAN_LIMIT || 15, 10),
    max_pages: 3,
    search_url:
      process.env.LINKEDIN_SEARCH_URL ||
      buildLinkedInSearchUrl({ keywords, location, scanTarget: scan_target }),
    instructions: null,
    ats_allowlist_only: normalizeScanTarget(envTarget || 'all') === 'external',
  };
}
