/**
 * Tiered ATS URL classification for scan / queue / agent append validation.
 *
 * Tiers:
 *   primary     — Ashby + Lever (+ ashby_jid embed); maximize submits
 *   secondary   — Rippling, BambooHR, …; attempt when primary supply is low
 *   workday     — Workday (myworkdayjobs.com); use workday-apply skill in external loop
 *   blocked_*   — aggregators + enterprise ATS we do not automate here
 *   unknown     — custom corp sites; skip under allowlistOnly
 */

/** @typedef {'primary'|'secondary'|'workday'|'blocked_aggregator'|'blocked_platform'|'unknown'} AtsTier */

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

const GREENHOUSE_HOSTS = [
  'greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
];

/** @type {{ hosts: string[], platform: string, priority?: string, maxSteps?: number }[]} */
const PRIMARY_ATS = [
  { hosts: ['jobs.ashbyhq.com', 'ashbyhq.com'], platform: 'ashbyhq', priority: 'high' },
  { hosts: ['jobs.lever.co'], platform: 'lever', priority: 'high' },
  { hosts: GREENHOUSE_HOSTS, platform: 'greenhouse', priority: 'high', maxSteps: 50 },
];

/** @type {{ hosts: string[], platform: string, priority?: string, maxSteps?: number }[]} */
const SECONDARY_ATS = [
  { hosts: ['ats.rippling.com', 'rippling.com'], platform: 'rippling', priority: 'medium', maxSteps: 45 },
  { hosts: ['recruiting.ultipro.com', 'recruiting2.ultipro.com'], platform: 'ultipro', priority: 'medium', maxSteps: 55 },
  { hosts: ['hiresome.ai'], platform: 'hiresome', priority: 'medium', maxSteps: 45 },
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

function isGreenhouseUrl(url) {
  if (url.includes('gh_jid=') || url.includes('gh_src=')) return true;
  return matchHostList(url, GREENHOUSE_HOSTS);
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
    return {
      tier: 'workday',
      platform: 'workday',
      reason: 'workday:myworkdayjobs',
      priority: 'medium',
      mayAutoApply: true,
      maxSteps: 60,
    };
  }

  if (isGreenhouseUrl(url)) {
    return {
      tier: 'primary',
      platform: 'greenhouse',
      reason: 'primary:greenhouse',
      priority: 'high',
      mayAutoApply: true,
      maxSteps: 50,
    };
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

/** Scan / queue: primary + secondary + workday. */
export function isAllowedAtsUrl(rawUrl) {
  const t = classifyExternalUrl(rawUrl).tier;
  return t === 'primary' || t === 'secondary' || t === 'workday';
}

/** Workday apply URLs (myworkdayjobs.com / .wdN.myworkday). */
export function isWorkdayAtsUrl(rawUrl) {
  return classifyExternalUrl(rawUrl).tier === 'workday';
}

/** Tier-1 only (Ashby + Lever + embed). */
export function isPrimaryAtsUrl(rawUrl) {
  return classifyExternalUrl(rawUrl).tier === 'primary';
}

export function isLinkedInJobListingUrl(rawUrl) {
  return /linkedin\.com\/jobs\/view/i.test(String(rawUrl || ''));
}

/** @param {{ openAllowlist?: boolean, skipWorkday?: boolean }} [opts] */
export function resolveAppendValidationOpts(opts = {}) {
  return {
    openAllowlist: opts.openAllowlist ?? process.env.OPEN_ALLOWLIST === '1',
    skipWorkday: opts.skipWorkday ?? process.env.SKIP_WORKDAY === '1',
  };
}

/**
 * @param {object} entry append payload
 * @param {{ openAllowlist?: boolean, skipWorkday?: boolean }} [opts]
 * @returns {{ ok: boolean, error?: string, classification?: ReturnType<classifyExternalUrl> }}
 */
export function validateAppendEntry(entry, opts = {}) {
  const { openAllowlist, skipWorkday } = resolveAppendValidationOpts(opts);
  const status = String(entry?.status || '');
  const url = String(entry?.url || '');
  const c = classifyExternalUrl(url);

  if (status.startsWith('submitted')) {
    if (/linkedineasyapply|linkedin_easy_apply|linkedin_easy|submitted_easy/i.test(status)) {
      return {
        ok: false,
        error: 'REJECTED: External Apply pipeline 禁止 submitted_linkedineasyapply / LinkedIn 站内提交 / Easy Apply。',
      };
    }
    if (isLinkedInJobListingUrl(url)) {
      return { ok: false, error: 'REJECTED: submitted 必须写真实 ATS apply URL，禁止 linkedin.com/jobs/view' };
    }
    if (skipWorkday && c.tier === 'workday') {
      return {
        ok: false,
        error: 'REJECTED: 本 run 跳过 Workday；请用 skipped_platform reason workday_deferred。',
      };
    }
    if (openAllowlist) {
      return { ok: true, classification: c };
    }
    if (c.tier === 'workday') {
      if (!/^submitted_workday/i.test(status)) {
        return {
          ok: false,
          error: 'REJECTED: Workday URL 须用 status=submitted_workday（非 submitted_ashbyhq 等）。',
        };
      }
      return { ok: true, classification: c };
    }
    if (c.platform === 'greenhouse' && !/^submitted_greenhouse/i.test(status)) {
      return {
        ok: false,
        error: 'REJECTED: Greenhouse URL 须用 status=submitted_greenhouse。',
      };
    }
    if (c.tier !== 'primary' && c.tier !== 'secondary') {
      return {
        ok: false,
        error: `REJECTED: submitted URL tier=${c.tier} (${c.reason}). 仅允许 Tier1(primary) / Tier2(secondary) / Workday ATS。`,
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

  if (status === 'skipped_linkedin_easyapply' || status === 'skipped_easy_apply') {
    if (!isLinkedInJobListingUrl(url) && !/linkedin\.com\/jobs/i.test(url)) {
      return {
        ok: false,
        error: 'REJECTED: skipped_linkedin_easyapply 须写 LinkedIn job 列表/详情 URL（未开外链 tab 的快速 skip）。',
      };
    }
    return { ok: true, classification: c };
  }

  if (/easy.?apply/i.test(status) && !status.startsWith('skipped_linkedin')) {
    return {
      ok: false,
      error: 'REJECTED: External Apply 禁止 Easy Apply 相关 status（用 skipped_linkedin_easyapply 记录列表 skip）。',
    };
  }

  if (skipWorkday && c.tier === 'workday' && status === 'skipped_platform') {
    return { ok: true, classification: c };
  }

  if (!openAllowlist && status === 'skipped_platform' && (c.tier === 'primary' || c.tier === 'workday')) {
    const label = c.tier === 'workday' ? 'Workday' : 'primary ATS (Ashby/Lever)';
    return {
      ok: false,
      error: `REJECTED: ${label} 禁止 skipped_platform；必须填表尝试或 skipped_incomplete/captcha/timeout。`,
    };
  }

  return { ok: true, classification: c };
}

export function shouldSkipExternalUrl(rawUrl, {
  allowlistOnly = true,
  includeSecondary = true,
  openAllowlist = false,
  skipWorkday = false,
} = {}) {
  const c = classifyExternalUrl(rawUrl);

  if (skipWorkday && c.tier === 'workday') {
    return { skip: true, tier: 'workday', platform: 'workday', reason: 'workday_deferred' };
  }

  if (openAllowlist) {
    if (c.tier === 'blocked_aggregator') {
      return { skip: true, ...c };
    }
    return { skip: false, ...c };
  }

  if (c.tier === 'primary') return { skip: false, ...c };
  if (c.tier === 'secondary' && includeSecondary) return { skip: false, ...c };
  if (c.tier === 'workday') return { skip: false, ...c };
  if (c.tier === 'blocked_aggregator' || c.tier === 'blocked_platform') {
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
export function formatAllowlistSummary({ openAllowlist = false, skipWorkday = false } = {}) {
  if (openAllowlist) {
    return [
      '**开放 ATS 探索模式**：除 Workday 外所有 External Apply URL 都必须开 tab 尝试填表。',
      'TRY ALL: Ashby, Lever, Greenhouse, ICIMS, Taleo, Rippling, SmartRecruiters, BambooHR, ApplyToJob, 自定义 corp 站点, unknown URL',
      skipWorkday
        ? 'SKIP: Workday (myworkdayjobs.com) → skipped_platform reason workday_deferred（零尝试）'
        : 'WORKDAY: myworkdayjobs.com — read workday-apply/SKILL.md + MASTER_apply.md',
      'QUICK SKIP OK: 聚合站 (sundayy/fetchjobs/remotehunter/…) → skipped_aggregator（仍须先开 tab 确认 URL）',
      '禁止列表页 skip: 必须先开 apply tab 再 append',
    ].join('\n');
  }
  return [
    'Tier1 PRIMARY (必须尝试填表): jobs.ashbyhq.com, ?ashby_jid= embed, jobs.lever.co, greenhouse.io / job-boards.*.greenhouse.io / URL 含 gh_jid',
    'Tier2 SECONDARY (默认尝试): rippling, ultipro, hiresome, smartrecruiters, pinpointhq, bamboohr, applytojob, sterling-engineering',
    'WORKDAY (必须尝试填表): myworkdayjobs.com, *.wdN.myworkday — read workday-apply/SKILL.md + MASTER_apply.md；禁止 fill；人类打字协议（type slowly + Tab 验 value）',
    'HARD BLOCK: aggregators + ICIMS/Taleo + eightfold',
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
    ['https://job-boards.greenhouse.io/co/j/1', 'primary', 'greenhouse'],
    ['https://careers.example.com/jobs/x?gh_jid=123', 'primary', 'greenhouse'],
    ['https://recruiting2.ultipro.com/x', 'secondary', 'ultipro'],
    ['https://yohrconsultancy.hiresome.ai/apply_form/x', 'secondary', 'hiresome'],
    ['https://kla.wd1.myworkdayjobs.com/x', 'workday', 'workday'],
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
