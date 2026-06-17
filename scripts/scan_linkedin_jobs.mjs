/**
 * Phase 1 job SEARCH (script). Apply/submit resume must use OpenClaw browser — see easy-apply / external-apply skills.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPipelineLogger, isNonInteractive, JOB_APPS_DIR } from './lib/pipeline-log.mjs';
import { shouldSkipJob } from './lib/pipeline-queue.mjs';
import {
  loadScanConfig,
  outputFilesForTarget,
  shouldCollectEasyApply,
  shouldCollectExternal,
} from './lib/linkedin-search.mjs';
import { buildPipelineReport, emitFinalReport } from './lib/pipeline-report.mjs';
import {
  classifyExternalUrl,
  detectPlatformFromUrl,
  isAllowedAtsUrl,
} from './lib/ats-url-filter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = JOB_APPS_DIR;
const PROFILE_DIR = resolve(OUT_DIR, '.browser-profile', 'linkedin');
const ROOT = resolve(__dirname, '..');
const RESUME_SRC = resolve(ROOT, 'resume.txt');
const RESUME_DST = resolve(OUT_DIR, 'resume.txt');

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });

if (existsSync(RESUME_SRC) && !existsSync(RESUME_DST)) {
  copyFileSync(RESUME_SRC, RESUME_DST);
}

const scanConfig = loadScanConfig();
const SEARCH_URL = scanConfig.search_url;
const LIMIT = scanConfig.limit;
const MAX_PAGES = scanConfig.max_pages;
const SCAN_TARGET = scanConfig.scan_target;
const ATS_ALLOWLIST_ONLY = scanConfig.ats_allowlist_only !== false;
const STAGE = process.env.PIPELINE_STAGE || 'scan';

async function captureExternalApplyUrl(context, page, btn) {
  let href = (await btn.getAttribute('href')) || '';
  if (href.startsWith('http') && !href.includes('linkedin.com')) {
    return href;
  }

  const popupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
  await btn.click();
  await sleep(2000);
  const popup = await popupPromise;
  if (popup) {
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 20000 });
    } catch {
      /* partial load ok */
    }
    const url = popup.url();
    await popup.close().catch(() => {});
    if (url && !url.includes('linkedin.com')) return url;
  }

  const current = page.url();
  if (current && !current.includes('linkedin.com/jobs')) {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    return current;
  }
  return '';
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isLoggedIn(page) {
  const profileIcon = await page.$(
    '.global-nav__me-photo, .profile-icon, img[alt*="photo"], .nav-item__profile-member-photo',
  );
  if (profileIcon) return true;
  const signInBtn = await page.$(
    'a[href*="login"], a.nav__button-tertiary, a[data-tracking-control="guest-home-nav"]',
  );
  return !signInBtn;
}

async function tryAutoLogin(page, log) {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password) {
    log.warn('login', 'LINKEDIN_EMAIL / LINKEDIN_PASSWORD not set — cannot auto-login');
    return false;
  }

  log.info('login', 'Attempting LinkedIn auto-login');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);

  const userField = await page.$('#username, input[name="session_key"]');
  const passField = await page.$('#password, input[name="session_password"]');
  if (!userField || !passField) {
    log.warn('login', 'Login form fields not found');
    return false;
  }

  await userField.fill(email);
  await passField.fill(password);
  const submit = await page.$('button[type="submit"], button[data-litms-control-urn="login-submit"]');
  if (submit) await submit.click();
  else await page.keyboard.press('Enter');

  await sleep(5000);
  const ok = await isLoggedIn(page);
  if (ok) log.info('login', 'LinkedIn login succeeded');
  else log.error('login', 'LinkedIn login failed — check credentials or CAPTCHA');
  return ok;
}

function normalizeJob(record) {
  const url = record.url || record.linkedin_url || record.linkedin_link || '';
  const jobId =
    record.linkedin_job_id ||
    (url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? '');
  return {
    ...record,
    title: record.title || 'Unknown Title',
    company: record.company || 'Unknown Company',
    location: record.location || 'Unknown Location',
    linkedin_job_id: jobId,
    url,
    linkedin_link: url,
    linkedin_url: url,
  };
}

async function main() {
  const log = createPipelineLogger({ stage: STAGE });
  let scanOutcome = 'success';
  let scanError = null;
  const nonInteractive = isNonInteractive();
  const headless = process.env.HEADLESS === '1';
  const scanStarted = Date.now();
  const heartbeatSec = Number(process.env.PIPELINE_HEARTBEAT_SEC || '15', 10);
  let heartbeatTimer = null;

  log.info('browser', `Launching browser (headless=${headless}, scan_target=${SCAN_TARGET})`);
  log.info('config', `limit=${LIMIT} pages=${MAX_PAGES} url=${SEARCH_URL} ats_allowlist_only=${ATS_ALLOWLIST_ONLY}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    heartbeatTimer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - scanStarted) / 1000);
      log.heartbeat('scan', `Playwright 扫描进行中（${elapsedSec}s）`, { elapsedSec });
    }, heartbeatSec * 1000);

    log.info('navigate', `Opening jobs search: ${SEARCH_URL}`);
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    if (!(await isLoggedIn(page))) {
      const loggedIn = await tryAutoLogin(page, log);
      if (!loggedIn) {
        if (nonInteractive) {
          throw new Error(
            'Not logged into LinkedIn. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD, or run once interactively to seed .browser-profile/linkedin',
          );
        }
        log.warn('login', 'Not logged in — open browser window and log in manually');
        await new Promise((r) => process.stdin.once('data', r));
        await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(3000);
      } else {
        await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(3000);
      }
    } else {
      log.info('login', 'Using existing LinkedIn session from browser profile');
    }

    try {
      await page.waitForSelector(
        '.job-card-container, .jobs-search-results__list, .scaffold-layout__list-container',
        { timeout: 15000 },
      );
    } catch {
      log.warn('dom', 'Job list selector timeout — continuing after extra wait');
      await sleep(5000);
    }

    await sleep(2000);
    const debugShot = resolve(OUT_DIR, 'linkedin_debug.png');
    await page.screenshot({ path: debugShot });
    log.info('screenshot', `Saved ${debugShot}`);

    const easyApplyJobs = [];
    const externalApplyJobs = [];
    let skippedExternal = 0;
    const collectEasy = shouldCollectEasyApply(SCAN_TARGET);
    const collectExternal = shouldCollectExternal(SCAN_TARGET);
    let collected = 0;
    let pageNum = 0;
    const seenIds = new Set();

    while (collected < LIMIT && pageNum < MAX_PAGES) {
      pageNum++;
      log.info('page', `Scanning page ${pageNum}/${MAX_PAGES}`, {
        progress: { current: collected, total: LIMIT },
      });

      const jobCards = await page.$$('.job-card-container, .jobs-search-results__list-item');
      log.info('list', `Page ${pageNum}: ${jobCards.length} cards visible`);

      for (let i = 0; i < jobCards.length && collected < LIMIT; i++) {
        const card = jobCards[i];
      log.info('job', `Processing ${collected + 1}/${LIMIT} (card ${i + 1})`, {
        progress: { current: collected + 1, total: LIMIT },
      });

      try {
        await card.scrollIntoViewIfNeeded();
        await sleep(500);

        const titleEl = await card.$(
          '.job-card-list__title, .jobs-search-results__list-item a, .job-card-container__link, a[data-tracking-control="job-card"]',
        );
        const title = titleEl ? (await titleEl.textContent()).trim() : 'Unknown Title';

        const companyEl = await card.$(
          '.job-card-container__company-name, .artdeco-entity-lockup__subtitle, .job-card-container__primary-description',
        );
        const company = companyEl ? (await companyEl.textContent()).trim() : 'Unknown Company';

        const locationEl = await card.$(
          '.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-card-container__secondary-description',
        );
        const location = locationEl ? (await locationEl.textContent()).trim() : 'Unknown Location';

        let jobUrl = '';
        const linkEl = await card.$('a');
        if (linkEl) {
          jobUrl = await linkEl.getAttribute('href');
          if (jobUrl && !jobUrl.startsWith('http')) {
            jobUrl = 'https://www.linkedin.com' + jobUrl;
          }
        }

        log.info('job_detail', `"${title}" @ ${company}`, { title, company, location, jobUrl });

        const cardText = await card.textContent();
        const hasEasyApply = cardText.includes('Easy Apply');
        const jobId = jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1] || '';
        if (jobId && seenIds.has(jobId)) {
          continue;
        }

        if (hasEasyApply && !collectEasy) {
          log.info('classify', 'Skip Easy Apply (scan_target excludes easy)');
          continue;
        }
        if (!hasEasyApply && !collectExternal) {
          log.info('classify', 'Skip non-EA card (scan_target excludes external)');
          continue;
        }

        if (hasEasyApply && collectEasy) {
          easyApplyJobs.push(
            normalizeJob({
              title,
              company,
              location,
              linkedin_job_id: jobId,
              url: jobUrl,
              apply_type: 'easy_apply',
            }),
          );
          if (jobId) seenIds.add(jobId);
          collected++;
          log.info('classify', 'Easy Apply (list card)');
        } else if (collectExternal) {
          try {
            await card.click();
            await sleep(3000);

            const easyApplyBtn = await page.$(
              'button:has-text("Easy Apply"), button[aria-label*="Easy Apply"]',
            );
            const companyApplyBtn = await page.$(
              'button:has-text("Apply on company website"), a:has-text("Apply on company website")',
            );
            const applyBtn = await page.$('button:has-text("Apply"), a:has-text("Apply")');

            if (easyApplyBtn && collectEasy) {
              easyApplyJobs.push(
                normalizeJob({
                  title,
                  company,
                  location,
                  linkedin_job_id: jobId,
                  url: jobUrl,
                  apply_type: 'easy_apply',
                }),
              );
              if (jobId) seenIds.add(jobId);
              collected++;
              log.info('classify', 'Easy Apply (detail panel)');
            } else if ((companyApplyBtn || applyBtn) && collectExternal && !easyApplyBtn) {
              const btn = companyApplyBtn || applyBtn;
              const externalUrl = await captureExternalApplyUrl(context, page, btn);
              const platform = detectPlatformFromUrl(externalUrl) || 'other';
              const classification = classifyExternalUrl(externalUrl);

              if (!externalUrl) {
                log.info('classify', 'External Apply button but no captured URL');
              } else if (ATS_ALLOWLIST_ONLY && !isAllowedAtsUrl(externalUrl)) {
                skippedExternal++;
                log.info('classify', `Skip non-allowlist URL (${classification.reason})`, {
                  title,
                  external_url: externalUrl,
                });
              } else {
                const candidate = normalizeJob({
                  title,
                  company,
                  location,
                  linkedin_job_id: jobId,
                  linkedin_url: jobUrl,
                  external_url: externalUrl,
                  apply_url: externalUrl,
                  platform,
                  apply_type: 'external_apply',
                  ats_priority: classification.priority || null,
                });
                const { skip, reason } = shouldSkipJob(candidate, {
                  allowlistOnly: ATS_ALLOWLIST_ONLY,
                });
                if (skip) {
                  skippedExternal++;
                  log.info('classify', `Skipped (${reason})`, { title, platform, external_url: externalUrl });
                } else {
                  externalApplyJobs.push(candidate);
                  if (jobId) seenIds.add(jobId);
                  collected++;
                  log.info('classify', `External Apply allowlisted (${platform})`, {
                    external_url: externalUrl,
                  });
                }
              }
            } else {
              log.warn('classify', 'No Apply button in detail view');
            }
          } catch (e) {
            log.warn('classify', `Detail check failed: ${e.message}`);
          }
        }

        await sleep(2000);
      } catch (e) {
        log.warn('job', `Card error: ${e.message}`);
      }
      }

      if (collected >= LIMIT) break;

      const nextBtn = await page.$(
        'button[aria-label*="Next"], button[aria-label*="下一页"], li[data-test-pagination-page-btn].selected + li button',
      );
      if (!nextBtn || pageNum >= MAX_PAGES) {
        log.info('page', 'No next page or max pages reached');
        break;
      }
      await nextBtn.click();
      await sleep(3000);
    }

    const easyPath = resolve(OUT_DIR, 'easy_apply_jobs.json');
    const extPath = resolve(OUT_DIR, 'external_apply_jobs.json');
    const outPlan = outputFilesForTarget(SCAN_TARGET);

    const easyOut = outPlan.writeEasy ? easyApplyJobs : [];
    const extOut = outPlan.writeExternal ? externalApplyJobs : [];

    writeFileSync(easyPath, JSON.stringify(easyOut, null, 2));
    writeFileSync(extPath, JSON.stringify(extOut, null, 2));

    log.done('write', `target=${SCAN_TARGET} easy=${easyOut.length} external=${extOut.length} skipped_external=${skippedExternal}`, {
      progress: { current: collected, total: LIMIT },
      scan_target: SCAN_TARGET,
      ats_allowlist_only: ATS_ALLOWLIST_ONLY,
      easyPath,
      extPath,
      easyCount: easyOut.length,
      externalCount: extOut.length,
      skippedExternal,
    });
  } catch (err) {
    scanOutcome = 'failed';
    scanError = err.message || String(err);
    log.error('fatal', scanError, { error: err.stack });
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (!nonInteractive && process.env.KEEP_BROWSER_OPEN === '1') {
      log.info('browser', 'KEEP_BROWSER_OPEN=1 — press Enter in terminal to close');
      await new Promise((r) => process.stdin.once('data', r));
    }
    await context.close();
    log.info('browser', 'Browser closed');

    if (process.env.SKIP_PIPELINE_FINAL !== '1') {
      emitFinalReport(
        log,
        buildPipelineReport({
          phase: 'scan',
          stage: STAGE,
          outcome: scanOutcome,
          error: scanError,
        }),
      );
    }
  }

  if (scanOutcome === 'failed') process.exit(1);
}

main().catch((err) => {
  const log = createPipelineLogger({ stage: STAGE });
  if (process.env.SKIP_PIPELINE_FINAL !== '1') {
    emitFinalReport(
      log,
      buildPipelineReport({
        phase: 'scan',
        stage: STAGE,
        outcome: 'failed',
        error: err.message || String(err),
      }),
    );
  }
  process.exit(1);
});
