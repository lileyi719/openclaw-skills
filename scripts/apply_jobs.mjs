#!/usr/bin/env node
/**
 * Phase 2–4: apply to queued jobs via Playwright (persistent Chromium profile).
 * Invoked automatically by run_job_pipeline.mjs --phase=all|apply|full.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { createPipelineLogger, isNonInteractive, JOB_APPS_DIR } from './lib/pipeline-log.mjs';
import { loadJson, appendApplied } from './lib/pipeline-queue.mjs';
import { loadApplicantProfile } from './lib/applicant-profile.mjs';
import {
  launchApplyBrowser,
  humanDelay,
  jsClick,
  jobIdFrom,
  isDailyLimitText,
} from './lib/apply-browser.mjs';
import { loadScanConfig } from './lib/linkedin-search.mjs';
import { buildPipelineReport, emitFinalReport } from './lib/pipeline-report.mjs';
import { shouldCollectEasyApply, shouldCollectExternal } from './lib/linkedin-search.mjs';

const STAGE = process.env.PIPELINE_STAGE || 'apply';
const SKIP_FINAL = process.env.SKIP_PIPELINE_FINAL === '1';

async function fillInputsInRoot(page, profile, log) {
  const fields = await page.$$('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])');
  for (const field of fields) {
    try {
      const type = ((await field.getAttribute('type')) || 'text').toLowerCase();
      const name = ((await field.getAttribute('name')) || '').toLowerCase();
      const id = ((await field.getAttribute('id')) || '').toLowerCase();
      const aria = ((await field.getAttribute('aria-label')) || '').toLowerCase();
      const label = `${name} ${id} ${aria}`;
      const visible = await field.isVisible();
      if (!visible) continue;

      if (type === 'file') continue;
      if (type === 'checkbox' || type === 'radio') continue;

      let value = null;
      if (type === 'email' || label.includes('email')) value = profile.email;
      else if (type === 'tel' || /phone|mobile/.test(label)) value = profile.phone;
      else if (/first.?name|given/.test(label)) value = profile.name.split(/\s+/)[0];
      else if (/last.?name|family|surname/.test(label)) value = profile.name.split(/\s+/).slice(-1)[0];
      else if (/full.?name|^name$/.test(label)) value = profile.name;
      else if (/linkedin/.test(label)) value = profile.linkedIn;
      else if (type === 'text' && /city|location/.test(label)) continue;

      if (!value) continue;
      await field.click({ timeout: 2000 }).catch(() => {});
      await field.fill('');
      await field.fill(value);
      await humanDelay(200, 500);
    } catch {
      /* field-level */
    }
  }
}

async function uploadResumeIfNeeded(page, resumePath, log) {
  if (!resumePath || !existsSync(resumePath)) return;
  const inputs = await page.$$('input[type="file"]');
  for (const input of inputs) {
    try {
      if (!(await input.isVisible())) continue;
      await input.setInputFiles(resumePath);
      log.info('upload', `Attached resume: ${resumePath}`);
      await humanDelay(800, 1500);
      return;
    } catch (e) {
      log.warn('upload', `Resume attach failed: ${e.message}`);
    }
  }
}

async function clickModalAction(page, patterns) {
  for (const pat of patterns) {
    const btn = page.locator(pat).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
      await jsClick(btn);
      return pat;
    }
  }
  return null;
}

async function applyEasyApplyJob(page, job, profile, log) {
  const url = job.url || job.linkedin_url || job.linkedin_link;
  if (!url) throw new Error('Job missing URL');

  log.info('job', `Easy Apply: ${job.title} @ ${job.company}`, {
    title: job.title,
    company: job.company,
    jobUrl: url,
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await humanDelay(2000, 3500);

  let body = await page.locator('body').innerText();
  if (isDailyLimitText(body)) {
    return { status: 'failed_linkedin_daily_limit', stopPipeline: true };
  }
  if (/Applied\s+\d|You applied|已申请/i.test(body) && !/Easy Apply/i.test(body)) {
    return { status: 'skipped_already_applied' };
  }

  const easyBtn = page
    .locator(
      'button:has-text("Easy Apply"), button[aria-label*="Easy Apply"], .jobs-apply-button--top-card',
    )
    .first();
  if ((await easyBtn.count()) === 0) {
    return { status: 'failed_no_easy_apply_button' };
  }
  await jsClick(easyBtn);
  await humanDelay(1500, 2500);

  for (let step = 0; step < 30; step++) {
    const modal = page.locator('.jobs-easy-apply-modal, div[role="dialog"]').first();
    const hasModal = (await modal.count()) > 0;
    const scope = hasModal ? modal : page;

    body = await page.locator('body').innerText();
    if (isDailyLimitText(body)) {
      return { status: 'failed_linkedin_daily_limit', stopPipeline: true };
    }

    await uploadResumeIfNeeded(scope, profile.resumePath, log);
    await fillInputsInRoot(scope, profile, log);

    const submitted = await clickModalAction(scope, [
      'button:has-text("Submit application")',
      'button[aria-label*="Submit application"]',
      'button:has-text("Submit")',
    ]);
    if (submitted) {
      await humanDelay(2500, 4000);
      body = await page.locator('body').innerText();
      if (/application sent|submitted|已发送|已提交/i.test(body)) {
        return { status: 'submitted_easy_apply' };
      }
      if (isDailyLimitText(body)) {
        return { status: 'failed_linkedin_daily_limit', stopPipeline: true };
      }
      return { status: 'submitted_easy_apply' };
    }

    const reviewed = await clickModalAction(scope, [
      'button:has-text("Review")',
      'button[aria-label*="Review"]',
    ]);
    if (reviewed) {
      await humanDelay(1000, 2000);
      continue;
    }

    const next = await clickModalAction(scope, [
      'button:has-text("Next")',
      'button[aria-label*="Continue"]',
      'button:has-text("Continue")',
    ]);
    if (next) {
      await humanDelay(1200, 2200);
      continue;
    }

    const dismiss = await clickModalAction(scope, [
      'button[aria-label="Dismiss"]',
      'button:has-text("Discard")',
    ]);
    if (dismiss) break;
    break;
  }

  return { status: 'failed_easy_apply_incomplete' };
}

async function applyExternalJob(page, job, profile, log) {
  const url = job.apply_url || job.external_url || job.url;
  if (!url) return { status: 'failed_no_apply_url' };

  log.info('job', `External: ${job.title} @ ${job.company}`, { jobUrl: url });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await humanDelay(2000, 4000);

  const body = await page.locator('body').innerText();
  if (isDailyLimitText(body)) return { status: 'failed_linkedin_daily_limit', stopPipeline: true };

  await fillInputsInRoot(page, profile, log);
  await uploadResumeIfNeeded(page, profile.resumePath, log);

  const submitted = await clickModalAction(page, [
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'input[type="submit"]',
  ]);
  if (submitted) {
    await humanDelay(2000, 3500);
    return { status: 'submitted_external' };
  }
  return { status: 'failed_external_manual_needed' };
}

async function applyWorkdayJob(page, job, profile, log) {
  const url = job.apply_url || job.external_url;
  if (!url) return { status: 'failed_no_apply_url' };

  const email = process.env.WORKDAY_EMAIL || profile.email;
  const password = process.env.WORKDAY_PASSWORD || process.env.LINKEDIN_PASSWORD;

  log.info('job', `Workday: ${job.title} @ ${job.company}`, { jobUrl: url });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await humanDelay(2500, 4000);

  if (email && password) {
    const emailField = page.locator('input[type="email"], input[name*="email" i]').first();
    const passField = page.locator('input[type="password"]').first();
    if ((await emailField.count()) > 0 && (await passField.count()) > 0) {
      await emailField.fill(email);
      await passField.fill(password);
      await clickModalAction(page, ['button:has-text("Sign In")', 'button[type="submit"]']);
      await humanDelay(3000, 5000);
    }
  }

  await fillInputsInRoot(page, profile, log);
  await uploadResumeIfNeeded(page, profile.resumePath, log);

  const submitted = await clickModalAction(page, [
    'button:has-text("Submit")',
    'button[data-automation-id="bottom-navigation-next-button"]',
  ]);
  if (submitted) return { status: 'submitted_workday' };
  return { status: 'failed_workday_manual_needed' };
}

function loadAppliedIds() {
  const applied = loadJson(resolve(JOB_APPS_DIR, 'applied_jobs.json'), []);
  const ids = new Set();
  for (const row of applied) {
    const id = jobIdFrom(row);
    if (id) ids.add(id);
    const st = String(row.status || '');
    if (st.includes('submitted')) {
      const u = row.url || row.linkedin_url || '';
      if (u) ids.add(u);
    }
  }
  return { applied, ids };
}

function wasApplied(job, ids) {
  const id = jobIdFrom(job);
  const url = job.url || job.linkedin_url || job.apply_url || '';
  return (id && ids.has(id)) || (url && ids.has(url));
}

async function main() {
  const log = createPipelineLogger({ stage: STAGE });
  const scanConfig = loadScanConfig();
  const profile = loadApplicantProfile();
  const { ids } = loadAppliedIds();

  let outcome = 'success';
  let errorText = null;
  let stopPipeline = false;
  const stats = { submitted: 0, failed: 0, skipped: 0 };
  let context;

  const heartbeatSec = Number(process.env.PIPELINE_HEARTBEAT_SEC || '15', 10);
  const started = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    log.heartbeat('apply', `投递进行中（${elapsedSec}s）`, { elapsedSec });
  }, heartbeatSec * 1000);

  log.info('start', 'Apply phase (Playwright browser)', {
    scan_target: scanConfig.scan_target,
    resume: profile.resumePath,
  });

  try {
    const launched = await launchApplyBrowser(log);
    context = launched.context;
    const page = launched.page;

    const easyJobs = shouldCollectEasyApply(scanConfig.scan_target)
      ? loadJson(resolve(JOB_APPS_DIR, 'easy_apply_jobs.json'), [])
      : [];
    const externalQ = shouldCollectExternal(scanConfig.scan_target)
      ? loadJson(resolve(JOB_APPS_DIR, 'external_queue.json'), [])
      : [];
    const workdayQ = shouldCollectExternal(scanConfig.scan_target)
      ? loadJson(resolve(JOB_APPS_DIR, 'workday_queue.json'), [])
      : [];

    const maxPerRun = Number(process.env.APPLY_LIMIT || scanConfig.limit || '50', 10);
    let processed = 0;

    const queues = [
      { name: 'easy_apply', jobs: easyJobs, fn: applyEasyApplyJob },
      { name: 'external', jobs: externalQ, fn: applyExternalJob },
      { name: 'workday', jobs: workdayQ, fn: applyWorkdayJob },
    ];

    for (const { name, jobs, fn } of queues) {
      if (!jobs.length) {
        log.info('queue', `${name}: empty — skip`);
        continue;
      }
      log.info('queue', `${name}: ${jobs.length} job(s)`);

      for (const job of jobs) {
        if (processed >= maxPerRun) {
          log.info('limit', `Reached APPLY_LIMIT=${maxPerRun}`);
          break;
        }
        if (wasApplied(job, ids)) {
          stats.skipped++;
          log.info('skip', `Already applied: ${job.title}`, { title: job.title });
          continue;
        }

        processed++;
        let result;
        try {
          result = await fn(page, job, profile, log);
        } catch (e) {
          result = { status: `failed_${name}_error`, error: e.message };
        }

        appendApplied(job, result.status, {
          method: 'playwright_browser',
          queue: name,
          error: result.error || null,
        });

        if (result.status.includes('submitted')) stats.submitted++;
        else if (result.status.includes('skip')) stats.skipped++;
        else stats.failed++;

        log.done('result', `${job.title}: ${result.status}`, {
          title: job.title,
          company: job.company,
          status: result.status,
        });

        if (result.stopPipeline) {
          stopPipeline = true;
          errorText = 'LinkedIn daily application limit';
          log.error('limit', errorText);
          break;
        }
        await humanDelay(1500, 3000);
      }
      if (stopPipeline) break;
    }

    if (stats.submitted === 0 && stats.failed > 0 && !stopPipeline) {
      outcome = 'failed';
      errorText = `0 submitted, ${stats.failed} failed`;
    } else if (stopPipeline) {
      outcome = 'failed';
    }

    log.done('apply', `Apply complete: submitted=${stats.submitted} failed=${stats.failed} skipped=${stats.skipped}`, {
      stats,
    });
  } catch (err) {
    outcome = 'failed';
    errorText = err.message || String(err);
    log.error('fatal', errorText, { error: err.stack });
  } finally {
    clearInterval(heartbeat);
    if (context) {
      if (!isNonInteractive() && process.env.KEEP_BROWSER_OPEN === '1') {
        log.info('browser', 'KEEP_BROWSER_OPEN=1 — press Enter to close');
        await new Promise((r) => process.stdin.once('data', r));
      }
      await context.close();
      log.info('browser', 'Browser closed');
    }

    if (!SKIP_FINAL) {
      const phase = STAGE === 'apply' ? 'apply' : 'pipeline';
      emitFinalReport(
        log,
        buildPipelineReport({
          phase,
          stage: STAGE,
          outcome,
          error: errorText,
          messageOverride:
            outcome === 'success'
              ? `【完成】投递阶段结束。成功 ${stats.submitted}，失败 ${stats.failed}，跳过 ${stats.skipped}。`
              : `【失败】投递阶段：${errorText || '见日志'}。成功 ${stats.submitted}，失败 ${stats.failed}。`,
        }),
      );
    }
  }

  if (outcome === 'failed') process.exit(1);
}

main();
