/**
 * Shared utilities for deterministic ATS handlers.
 * - Browser launch (fresh context, no profile needed for ATS pages)
 * - Profile loading (name, email, phone, LinkedIn URL)
 * - Resume upload (setInputFiles on hidden input[type=file])
 * - Checkpoint management (crash-recovery per job)
 * - Append to applied_jobs.json
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..', '..');
export const JOBS_DIR = resolve(PROJECT_ROOT, 'skills', 'job-applications');
export const APPLIED_JOBS_PATH = resolve(JOBS_DIR, 'applied_jobs.json');
export const CHECKPOINT_PATH = resolve(JOBS_DIR, 'handler_checkpoint.json');

// ── Profile & Resume ──────────────────────────────────────────────

export function loadProfile() {
  const path = resolve(JOBS_DIR, 'applicant-profile.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadResumeText() {
  const path = resolve(JOBS_DIR, 'resume.txt');
  return readFileSync(path, 'utf8');
}

export function getResumePath() {
  const candidates = [
    resolve(JOBS_DIR, 'resume.pdf'),
    '/tmp/openclaw/uploads/resume.pdf',
    '/tmp/resume.pdf',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

// ── Checkpoint (survives crash) ──────────────────────────────────

export function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return { completed: [], failed: [] };
  return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
}

export function saveCheckpoint(data) {
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

// ── ATS Detection ─────────────────────────────────────────────────

export function detectATS(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('jobs.ashbyhq.com') || u.includes('ashby_jid')) return 'ashby';
  if (u.includes('jobs.lever.co')) return 'lever';
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse.io') || u.includes('gh_jid')) return 'greenhouse';
  if (u.includes('myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(u)) return 'workday';
  if (u.includes('rippling.com') || u.includes('ats.rippling.com')) return 'rippling';
  if (u.includes('bamboohr.com')) return 'bamboohr';
  if (u.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (u.includes('applytojob.com')) return 'applytojob';
  if (u.includes('pinpointhq.com')) return 'pinpointhq';
  return 'unknown';
}

// ── Browser ───────────────────────────────────────────────────────

export async function launchHandlerBrowser(headless = false) {
  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  return { browser, context };
}

export async function newJobPage(context, url, timeoutMs = 30_000) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
  await page.waitForTimeout(1500);
  return page;
}

// ── Resume Upload ─────────────────────────────────────────────────

export async function uploadResume(page, resumePath) {
  if (!existsSync(resumePath)) {
    console.warn(`[uploadResume] resume not found: ${resumePath}`);
    return false;
  }

  let input = await page.$('input[type="file"]');
  if (input) {
    await input.setInputFiles(resumePath);
    await page.waitForTimeout(800);
    return true;
  }

  input = await page.$('input[accept*="pdf"], input[accept*="doc"], input[accept*="resume"]');
  if (input) {
    await input.setInputFiles(resumePath);
    await page.waitForTimeout(800);
    return true;
  }

  input = await page.$('input[type="file"][style*="display: none"], input[type="file"][style*="visibility: hidden"]');
  if (input) {
    await input.setInputFiles(resumePath);
    await page.waitForTimeout(800);
    return true;
  }

  console.warn('[uploadResume] no file input found on page — resume may be missing');
  return false;
}

// ── Field Utilities ──────────────────────────────────────────────

export async function fillField(page, selector, value) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    await el.click();
    await el.fill('');
    await el.fill(value);
    return true;
  } catch {
    return false;
  }
}

export async function clickButton(page, text) {
  try {
    const btn = await page.$(`button:has-text("${text}"), input[type="submit"][value="${text}"]`);
    if (!btn) return false;
    await btn.click();
    return true;
  } catch {
    return false;
  }
}

export function randomDelay(minMs = 400, maxMs = 1200) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Promise((r) => setTimeout(r, ms));
}

// ── Append to applied_jobs.json ──────────────────────────────────

export function appendAppliedJob(entry) {
  const list = existsSync(APPLIED_JOBS_PATH)
    ? JSON.parse(readFileSync(APPLIED_JOBS_PATH, 'utf8'))
    : [];
  list.push({
    ...entry,
    ts: new Date().toISOString(),
    method: 'handler',
  });
  mkdirSync(dirname(APPLIED_JOBS_PATH), { recursive: true });
  writeFileSync(APPLIED_JOBS_PATH, JSON.stringify(list, null, 2));
}
