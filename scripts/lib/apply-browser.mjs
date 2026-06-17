import { chromium } from 'playwright';
import { resolve } from 'path';
import { JOB_APPS_DIR } from './pipeline-log.mjs';

export const PROFILE_DIR = resolve(JOB_APPS_DIR, '.browser-profile', 'linkedin');

export async function launchApplyBrowser(log, { headless } = {}) {
  const h = headless ?? process.env.HEADLESS === '1';
  log.info('browser', `Launching apply browser (headless=${h})`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: h,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

export function humanDelay(minMs = 600, maxMs = 1800) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Promise((r) => setTimeout(r, ms));
}

export async function jsClick(locator) {
  try {
    await locator.evaluate((node) => node.click());
    return true;
  } catch {
    return false;
  }
}

export function jobIdFrom(job) {
  const url = job.url || job.linkedin_url || job.linkedin_link || '';
  return job.linkedin_job_id || url.match(/\/jobs\/view\/(\d+)/)?.[1] || '';
}

export function isDailyLimitText(text) {
  return /daily limit|application limit|reached the limit|申请.*上限|too many applications/i.test(
    text || '',
  );
}
