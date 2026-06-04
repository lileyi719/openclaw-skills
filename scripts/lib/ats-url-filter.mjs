/**
 * Tiered ATS URL classification for scan / queue / agent append validation.
 *
 * Tiers:
 *   primary     — Ashby + Lever (+ ashby_jid embed); maximize submits
 *   secondary   — Rippling, BambooHR, …; attempt when primary supply is low
 *   manual_only — Workday / Greenhouse pipelines (not this batch agent)
 *   blocked_*   — aggregators + enterprise ATS we do not automate here
 *   unknown     — custom corp sites; skip under allowlistOnly
 */

/** @typedef {'primary'|'secondary'|'manual_only'|'blocked_aggregator'|'blocked_platform'|'unknown'} AtsTier */

const AGGREGATOR_HOSTS = [
  'sundayy.com',
  'fetchjobs.co',
  'agilegrid',
  'joinhyra.com',
  'jobcase.com',
  'jobleads',
  'bestjobtool',
  'jobright.ai',
  'jobg8.com',
  'dice.com',
  'alignerr.com',
  'talentally.com',
  'jobgether.com',
  'remotehunter.com',
  'aplitrak.com',
  'haystack.cv',
  'ladders.com',
  'braintrust.com',
  'dataannotation.tech',
  'dataannotation.com',
  'micro1.ai',
  'hyre.io',
  'joinhyra.com',
];

const BLOCKED_PLATFORM_HOSTS = [
  'icims.com',
  'taleo.net',
  'successfactors.com',
  'oraclecloud.com',
];

const MANUAL_ONLY_HOSTS = [
  'greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
];

/** @type {{ hosts: string[], platform: string, priority?: string, maxSteps?: number }[]} */
const PRIMARY_ATS = [
  { hosts: ['jobs.ashbyhq.com', 'ashbyhq.com'], platform: 'ashbyhq', priority: 'high' },
  { hosts: ['jobs.lever.co'], platform: 'lever', priority: 'high' },
];

/** @type {{ hosts: string[], platform: string, priority?: string, maxSteps?: number }[]} */
const SECONDARY_ATS = [
  { hosts: ['ats.rippling.com', 'rippling.com'], platform: 'rippling', priority: 'medium', maxSteps: 45 },
  { hosts: ['jobs.smartrecruiters.com', 'smartrecruiters.com'], platform: 'smartrecruiters', priority: 'medium' },
  { hosts: ['pinpointhq.com'], platform: 'pinpointhq', priority: 'medium' },
  { hosts: ['bamboohr.com'], platform: 'bamboohr', priority: 'medium' },
  { hosts: ['applytojob.com'], platform: 'applytojob', priority: 'medium' },
  { hosts: ['sterling-engineering.com'], platform: 'sterling-engineering', priority: 'medium' },
];

const LEVER_APPLY_PATH = /lever\.co\/[^/]+\/apply/i;

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    return new URL(s).href.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function hostIncludes(url, fragment) {
  return url.includes(fragment.toLowerCase());
}

function matchHostList(url, hosts) {
  return hosts.some((h) => hostIncludes(url, h));
}

function isAshbyEmbed(url) {
  return url.includes('ashby_jid=') || url.includes('ashbyhq.com');
}

function isLeverApply(url) {
  return hostIncludes(url, 'jobs.lever.co') || LEVER_APPLY_PATH.test(url);
}

/**
 * @param {string} rawUrl
 * @returns {{ tier: AtsTier, platform: string, reason: string, priority?: string, mayAutoApply?: boolean, maxSteps?: number }}
 */
export function classifyExternalUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return { tier: 'unknown', platform: 'unknown', reason: 'empty_url', mayAutoApply: false };
  }

  for (const h of AGGREGATOR_HOSTS) {
    if (hostIncludes(url, h)) {
      return { tier: 'blocked_aggregator', platform: 'aggregator', reason: `aggregator:${h}`, mayAutoApply: false };
    }
  }

  if (hostIncludes(url, 'myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(url)) {
    return { tier: 'manual_only', platform: 'workday', reason: 'manual_only:workday', mayAutoApply: false };
  }

  for (const h of MANUAL_ONLY_HOSTS) {
    if (hostIncludes(url, h) || url.includes('gh_jid')) {
      const plat = h.includes('greenhouse') ? 'greenhouse' : h.split('.')[0];
      return { tier: 'manual_only', platform: plat, reason: `manual_only:${h}`, mayAutoApply: false };
    }
  }

  for (const h of BLOCKED_PLATFORM_HOSTS) {
    if (hostIncludes(url, h)) {
      const plat = h.split('.')[0];
      return { tier: 'blocked_platform', platform: plat, reason: `platform:${h}`, mayAutoApply: false };
    }
  }

  if (isAshbyEmbed(url)) {
    return {
      tier: 'primary',
      platform: url.includes('jobs.ashbyhq.com') ? 'ashbyhq' : 'ashby_embed',
      reason: 'primary:ashby',
      priority: 'high',
      mayAutoApply: true,
    };
  }

  if (isLeverApply(url)) {
    return {
      tier: 'primary',
      platform: 'lever',
      reason: 'primary:lever',
      priority: 'high',
      mayAutoApply: true,
    };
  }

  for (const entry of PRIMARY_ATS) {
    if (matchHostList(url, entry.hosts)) {
      return {
        tier: 'primary',
        platform: entry.platform,
        reason: `primary:${entry.platform}`,
        priority: entry.priority,
        mayAutoApply: true,
      };
    }
  }

  for (const entry of SECONDARY_ATS) {
    if (matchHostList(url, entry.hosts)) {
      return {
        tier: 'secondary',
        platform: entry.platform,
        reason: `secondary:${entry.platform}`,
        priority: entry.priority,
        mayAutoApply: true,
        maxSteps: entry.maxSteps,
      };
    }
  }

  return { tier: 'unknown', platform: 'other', reason: 'not_on_allowlist', mayAutoApply: false };
}

export function detectPlatformFromUrl(rawUrl) {
  return classifyExternalUrl(rawUrl).platform;
}

/** Scan / queue: primary + secondary. */
export function isAllowedAtsUrl(rawUrl) {
  const t = classifyExternalUrl(rawUrl).tier;
  return t === 'primary' || t === 'secondary';
}

/** Tier-1 only (Ashby + Lever + embed). */
export function isPrimaryAtsUrl(rawUrl) {
  return classifyExternalUrl(rawUrl).tier === 'primary';
}

export function isLinkedInJobListingUrl(rawUrl) {
  return /linkedin\.com\/jobs\/view/i.test(String(rawUrl || ''));
}

/**
 * @param {object} entry append payload
 * @returns {{ ok: boolean, error?: string, classification?: ReturnType<classifyExternalUrl> }}
 */
export function validateAppendEntry(entry) {
  const status = String(entry?.status || '');
  const url = String(entry?.url || '');
  const c = classifyExternalUrl(url);

  if (status.startsWith('submitted')) {
    if (isLinkedInJobListingUrl(url)) {
      return { ok: false, error: 'REJECTED: submitted 必须写真实 ATS apply URL，禁止 linkedin.com/jobs/view' };
    }
    if (c.tier !== 'primary' && c.tier !== 'secondary') {
      return {
        ok: false,
        error: `REJECTED: submitted URL tier=${c.tier} (${c.reason}). 仅允许 Tier1(primary) / Tier2(secondary) ATS。`,
      };
    }
    return { ok: true, classification: c };
  }

  const needsAtsUrl = /^skipped_(platform|incomplete|captcha|timeout|external_assessment|auth_wall|closed)/.test(status);
  if (needsAtsUrl && isLinkedInJobListingUrl(url)) {
    return {
      ok: false,
      error: 'REJECTED: 此 skip 必须写 apply tab 的真实 ATS URL。禁止在 LinkedIn 列表页 append。'
        + ' 流程：click Apply → tabs → snapshot(apply) → classify URL → 再 append。',
    };
  }

  if (status === 'skipped_platform' && c.tier === 'primary') {
    return {
      ok: false,
      error: 'REJECTED: primary ATS (Ashby/Lever) 禁止 skipped_platform；必须填表尝试或 skipped_incomplete。',
    };
  }

  return { ok: true, classification: c };
}

export function shouldSkipExternalUrl(rawUrl, { allowlistOnly = true, includeSecondary = true } = {}) {
  const c = classifyExternalUrl(rawUrl);
  if (c.tier === 'primary') return { skip: false, ...c };
  if (c.tier === 'secondary' && includeSecondary) return { skip: false, ...c };
  if (c.tier === 'blocked_aggregator' || c.tier === 'blocked_platform' || c.tier === 'manual_only') {
    return { skip: true, ...c };
  }
  if (c.tier === 'secondary' && !includeSecondary) {
    return { skip: true, tier: 'secondary', platform: c.platform, reason: 'secondary_disabled' };
  }
  if (allowlistOnly) {
    return { skip: true, tier: 'unknown', platform: c.platform, reason: c.reason };
  }
  return { skip: false, ...c };
}

/** Human-readable tier summary for prompts. */
export function formatAllowlistSummary() {
  return [
    'Tier1 PRIMARY (必须尝试填表): jobs.ashbyhq.com, ?ashby_jid= embed, jobs.lever.co',
    'Tier2 SECONDARY (Tier1 不足时可试): rippling, smartrecruiters, pinpointhq, bamboohr, applytojob, sterling-engineering',
    'HARD BLOCK: aggregators + GH/WD/ICIMS + eightfold',
    '禁止列表页 skip: 必须先开 apply tab 再用上面规则',
  ].join('\n');
}

const SELF_TEST = process.argv[1]?.endsWith('ats-url-filter.mjs');
if (SELF_TEST) {
  const cases = [
    ['https://jobs.lever.co/foo/apply', 'primary', 'lever'],
    ['https://jobs.ashbyhq.com/co/id/application', 'primary', 'ashbyhq'],
    ['https://thatgamecompany.com/careers/?ashby_jid=abc', 'primary', 'ashby_embed'],
    ['https://www.sundayy.com/job/123', 'blocked_aggregator', 'aggregator'],
    ['https://job-boards.greenhouse.io/co/j/1', 'manual_only', 'greenhouse'],
    ['https://kla.wd1.myworkdayjobs.com/x', 'manual_only', 'workday'],
    ['https://ats.rippling.com/j/1', 'secondary', 'rippling'],
    ['https://www.linkedin.com/jobs/view/123', 'unknown', 'other'],
  ];
  let fail = 0;
  for (const [url, tier, platform] of cases) {
    const c = classifyExternalUrl(url);
    const ok = c.tier === tier && (platform === 'other' || c.platform === platform);
    if (!ok) fail += 1;
    console.log(ok ? 'OK' : 'FAIL', url, '→', c);
  }
  const v = validateAppendEntry({ status: 'skipped_platform', url: 'https://www.linkedin.com/jobs/view/1', company: 'X' });
  console.log(v.ok ? 'FAIL validate linkedin skip' : 'OK validate linkedin skip', v.error?.slice(0, 60));
  process.exit(fail ? 1 : 0);
}
