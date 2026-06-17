import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { loadJobEnv } from './load-job-env.mjs';

const OPENCLAW_CONFIG = resolve(homedir(), '.openclaw', 'openclaw.json');
const PROFILE = 'linkedin-jobs';
const JOBS_SEARCH_URL =
  'https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeJsString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

export function getLinkedInJobsCdpPort() {
  if (process.env.LINKEDIN_JOBS_CDP_PORT) {
    return Number(process.env.LINKEDIN_JOBS_CDP_PORT) || 18802;
  }
  if (existsSync(OPENCLAW_CONFIG)) {
    try {
      const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
      const port = cfg?.browser?.profiles?.[PROFILE]?.cdpPort;
      if (port) return Number(port) || 18802;
    } catch {
      /* ignore */
    }
  }
  return 18802;
}

export function getLinkedInCredentials() {
  loadJobEnv();
  const email = process.env.LINKEDIN_EMAIL || process.env.APPLICANT_EMAIL || '';
  const password = process.env.LINKEDIN_PASSWORD || process.env.WORKDAY_PASSWORD || '';
  return { email, password };
}

function runBrowserCli(args, { timeoutMs = 90_000 } = {}) {
  const r = spawnSync(
    'openclaw',
    ['browser', '--browser-profile', PROFILE, ...args],
    { encoding: 'utf8', timeout: timeoutMs },
  );
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { status: r.status ?? 1, out, error: r.error };
}

function parseEvaluateJson(out) {
  const trimmed = out.trim();
  if (!trimmed) return null;
  try {
    const outer = JSON.parse(trimmed);
    if (typeof outer === 'string') {
      try {
        return JSON.parse(outer);
      } catch {
        return { raw: outer };
      }
    }
    return outer;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function listBrowserTabs() {
  const r = runBrowserCli(['--json', 'tabs'], { timeoutMs: 45_000 });
  if (r.status !== 0) return { ok: false, error: r.out || r.error?.message || 'tabs failed' };
  try {
    const data = JSON.parse(r.out);
    return { ok: true, tabs: Array.isArray(data?.tabs) ? data.tabs : [] };
  } catch {
    return { ok: false, error: 'tabs json parse failed', raw: r.out?.slice(0, 400) };
  }
}

function isLinkedInPageTab(tab) {
  if (!tab || tab.type !== 'page') return false;
  const url = String(tab.url || '');
  return /^https:\/\/(www\.)?linkedin\.com\//i.test(url)
    && !/linkedin\.com\/login/i.test(url)
    && !/linkedin\.com\/(checkpoint|challenge|uas)/i.test(url);
}

function pickLinkedInPageTab(tabs) {
  const pages = tabs.filter(isLinkedInPageTab);
  if (!pages.length) return null;
  const score = (tab) => {
    const url = String(tab.url || '');
    if (/linkedin\.com\/jobs/i.test(url)) return 3;
    if (/linkedin\.com\/feed/i.test(url)) return 2;
    if (/linkedin\.com\/(mynetwork|messaging)/i.test(url)) return 1;
    return 0;
  };
  return pages.sort((a, b) => score(b) - score(a))[0];
}

function browserFocus(targetId) {
  if (!targetId) return false;
  const r = runBrowserCli(['focus', targetId], { timeoutMs: 30_000 });
  return r.status === 0;
}

/** Focus an existing LinkedIn page tab (not apply/ATS tab). */
function focusLinkedInTab(log) {
  const listed = listBrowserTabs();
  if (!listed.ok) {
    log(`[linkedin-login] tabs list failed: ${listed.error || 'unknown'}`);
    return null;
  }
  const tab = pickLinkedInPageTab(listed.tabs);
  if (!tab?.targetId) return null;
  if (!browserFocus(tab.targetId)) {
    log(`[linkedin-login] focus LinkedIn tab failed (${tab.url || tab.title})`);
    return null;
  }
  return tab;
}

function browserEvaluate(fn, { timeoutMs = 30_000 } = {}) {
  const args = ['evaluate', '--fn', fn];
  if (timeoutMs) args.push('--timeout-ms', String(timeoutMs));
  const r = runBrowserCli(args, { timeoutMs: timeoutMs + 15_000 });
  if (r.status !== 0) {
    return { ok: false, error: r.out || r.error?.message || 'evaluate failed' };
  }
  const data = parseEvaluateJson(r.out);
  return { ok: true, data };
}

async function browserNavigate(url, { retries = 3, delayMs = 1500, log } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const r = runBrowserCli(['navigate', url], { timeoutMs: 60_000 });
    if (r.status === 0) return true;
    if (log && attempt < retries) {
      log(`[linkedin-login] navigate retry ${attempt}/${retries} failed: ${r.out?.slice(0, 120) || 'unknown'}`);
    }
    if (attempt < retries) await sleep(delayMs * attempt);
  }
  return false;
}

function readSessionStateOnFocusedTab() {
  const fn = `() => JSON.stringify({
    url: location.href,
    onLogin: /linkedin\\.com\\/login/i.test(location.href),
    onCheckpoint: /linkedin\\.com\\/(checkpoint|challenge|uas)/i.test(location.href),
    onFeedOrJobs: /linkedin\\.com\\/(feed|jobs|mynetwork|messaging)/i.test(location.href),
    hasLoginForm: !!(document.querySelector('#username, input[name="session_key"]') || document.querySelector('input[type="email"]')),
    loggedIn: !!(document.querySelector('.global-nav__me-photo, button.global-nav__primary-link-me-menu-trigger, img.global-nav__me-photo, nav.global-nav a[href*="/in/"]'))
  })`;
  const r = browserEvaluate(fn);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...r.data };
}

async function readSessionState(log) {
  const tab = focusLinkedInTab(log);
  if (!tab) return { ok: false, error: 'no_linkedin_tab' };
  await sleep(400);
  return readSessionStateOnFocusedTab();
}

function sessionLooksLoggedIn(state) {
  return Boolean(state?.ok && (state.loggedIn || state.onFeedOrJobs) && !state.onLogin);
}

function tabLooksLoggedIn(tab) {
  const url = String(tab?.url || '');
  return /linkedin\.com\/(jobs|feed|mynetwork|messaging)/i.test(url)
    && !/linkedin\.com\/login/i.test(url);
}

function buildLoginEvaluateFn(email, password) {
  const e = escapeJsString(email);
  const p = escapeJsString(password);
  return `async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const inputs = Array.from(document.querySelectorAll('input'));
    const emailEl = document.querySelector('#username, input[name="session_key"]')
      || inputs.find(i => i.type === 'email')
      || inputs.find(i => /email|phone/i.test(i.getAttribute('aria-label') || ''));
    const passEl = document.querySelector('#password, input[name="session_password"]')
      || inputs.find(i => i.type === 'password');
    if (!emailEl || !passEl) return JSON.stringify({ ok: false, reason: 'login_form_not_found' });
    setter.call(emailEl, '${e}');
    emailEl.dispatchEvent(new Event('input', { bubbles: true }));
    emailEl.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    setter.call(passEl, '${p}');
    passEl.dispatchEvent(new Event('input', { bubbles: true }));
    passEl.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    const btn = document.querySelector('button[type="submit"], button[data-litms-control-urn="login-submit"]')
      || Array.from(document.querySelectorAll('button')).find(b => /^sign in$|^登录$/i.test((b.textContent || '').trim()));
    if (!btn) return JSON.stringify({ ok: false, reason: 'submit_not_found' });
    btn.click();
    return JSON.stringify({ ok: true, reason: 'submitted' });
  }`;
}

async function ensureJobsSearchPage(log) {
  const tab = focusLinkedInTab(log);
  if (tab && /linkedin\.com\/jobs/i.test(tab.url || '')) return tab;
  await browserNavigate(JOBS_SEARCH_URL, { log });
  await sleep(1500);
  return focusLinkedInTab(log);
}

async function performAutoLogin(email, password, log) {
  focusLinkedInTab(log);
  if (!(await browserNavigate('https://www.linkedin.com/login', { log }))) {
    const listed = listBrowserTabs();
    const tab = listed.ok ? pickLinkedInPageTab(listed.tabs) : null;
    if (tab && tabLooksLoggedIn(tab)) {
      log('[linkedin-login] navigate login failed but LinkedIn tab still logged in — continuing');
      await ensureJobsSearchPage(log);
      return { ok: true, reason: 'linkedin_tab_present', url: tab.url };
    }
    return { ok: false, reason: 'navigate_login_failed' };
  }

  let state = null;
  for (let i = 0; i < 5; i += 1) {
    await sleep(i === 0 ? 2500 : 2000);
    state = readSessionStateOnFocusedTab();
    if (!state.ok) continue;
    if (state.onCheckpoint) {
      return { ok: false, reason: 'challenge_required', url: state.url };
    }
    if (sessionLooksLoggedIn(state)) {
      log('[linkedin-login] session restored (redirected from login)');
      await browserNavigate(JOBS_SEARCH_URL, { log });
      return { ok: true, reason: 'session_restored', url: state.url };
    }
    if (state.hasLoginForm || state.onLogin) break;
  }

  if (!state?.ok) {
    return { ok: false, reason: 'login_page_unreachable', error: state?.error };
  }
  if (!state.hasLoginForm && !state.onLogin) {
    return { ok: false, reason: 'login_form_not_found', url: state.url };
  }

  log(`[linkedin-login] auto-login as ${email}`);
  const evalFn = buildLoginEvaluateFn(email, password);
  const submit = browserEvaluate(evalFn, { timeoutMs: 45_000 });
  if (!submit.ok) {
    return { ok: false, reason: 'login_eval_failed', error: submit.error };
  }
  if (!submit.data?.ok) {
    return { ok: false, reason: submit.data?.reason || 'login_submit_failed' };
  }

  await sleep(6000);
  state = readSessionStateOnFocusedTab();
  if (!state.ok) {
    return { ok: false, reason: 'post_login_state_failed', error: state.error };
  }
  if (state.onCheckpoint) {
    return { ok: false, reason: 'challenge_required', url: state.url };
  }
  if (state.onLogin && state.hasLoginForm) {
    return { ok: false, reason: 'login_failed', url: state.url };
  }
  if (sessionLooksLoggedIn(state)) {
    await browserNavigate(JOBS_SEARCH_URL, { log });
    return { ok: true, reason: 'login_succeeded', url: state.url };
  }
  return { ok: false, reason: 'login_unknown_state', url: state.url };
}

/**
 * Ensure linkedin-jobs profile is logged in using skills/job-applications/.env credentials.
 */
export async function ensureLinkedInLoggedIn({ log = console.error } = {}) {
  loadJobEnv();
  const { email, password } = getLinkedInCredentials();
  if (!email || !password) {
    log('[linkedin-login] LINKEDIN_EMAIL / LINKEDIN_PASSWORD missing (skills/job-applications/.env)');
    return { ok: false, reason: 'missing_credentials' };
  }

  const listed = listBrowserTabs();
  const linkedInTab = listed.ok ? pickLinkedInPageTab(listed.tabs) : null;

  if (linkedInTab && tabLooksLoggedIn(linkedInTab)) {
    browserFocus(linkedInTab.targetId);
    await sleep(400);
    const state = readSessionStateOnFocusedTab();
    if (sessionLooksLoggedIn(state) || tabLooksLoggedIn(linkedInTab)) {
      log('[linkedin-login] already logged in (LinkedIn tab found)');
      if (!/linkedin\.com\/jobs/i.test(linkedInTab.url || '')) {
        await browserNavigate(JOBS_SEARCH_URL, { log });
      }
      return { ok: true, reason: 'already_logged_in', url: linkedInTab.url || state.url };
    }
  }

  let state = await readSessionState(log);
  if (!state.ok && state.error === 'no_linkedin_tab') {
    log('[linkedin-login] no LinkedIn tab — opening login page');
    await browserNavigate('https://www.linkedin.com/login', { log });
    await sleep(2000);
    state = readSessionStateOnFocusedTab();
  } else if (!state.ok) {
    log('[linkedin-login] opening login page (evaluate failed on LinkedIn tab)');
    await browserNavigate('https://www.linkedin.com/login', { log });
    await sleep(2000);
    state = readSessionStateOnFocusedTab();
  }

  if (sessionLooksLoggedIn(state)) {
    log('[linkedin-login] already logged in');
    if (!/linkedin\.com\/jobs/i.test(state.url || '')) {
      await browserNavigate(JOBS_SEARCH_URL, { log });
    }
    return { ok: true, reason: 'already_logged_in', url: state.url };
  }

  if (state.ok && state.onCheckpoint) {
    return { ok: false, reason: 'challenge_required', url: state.url };
  }

  return performAutoLogin(email, password, log);
}

export async function isLinkedInLoggedIn() {
  const listed = listBrowserTabs();
  const tab = listed.ok ? pickLinkedInPageTab(listed.tabs) : null;
  if (tab && tabLooksLoggedIn(tab)) return true;
  browserFocus(tab?.targetId);
  const state = readSessionStateOnFocusedTab();
  if (!state.ok) return false;
  return sessionLooksLoggedIn(state);
}

export async function isLinkedInLoginPage() {
  focusLinkedInTab(() => {});
  const state = readSessionStateOnFocusedTab();
  if (!state.ok) return false;
  return Boolean(state.onLogin || state.hasLoginForm);
}

export async function isLinkedInChallengePage() {
  focusLinkedInTab(() => {});
  const state = readSessionStateOnFocusedTab();
  if (!state.ok) return false;
  return Boolean(state.onCheckpoint);
}
