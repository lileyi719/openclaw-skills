#!/usr/bin/env node
/**
 * Queue-driven Hybrid Handler v2
 *
 * Architecture (Path A):
 *   Handler (this script) = queue orchestrator + crash recovery
 *   OpenClaw agent        = the one with eyes (browser tool + prompts)
 *
 * No Playwright. No CSS guessing. The agent uses the browser tool's
 * accessibility snapshot to see ALL fields and fill correctly.
 *
 * Flow per job:
 *   1. Check browser is running (linkedin-jobs profile)
 *   2. Call `openclaw agent --json --timeout 240` with a prompt
 *      that includes the URL, company, position, and apply instructions
 *   3. Parse agent reply for RESULT: SUCCESS or RESULT: FAILURE
 *   4. Save checkpoint
 *   5. Move to next job
 *
 * Usage:
 *   node scripts/run-handlers.mjs                         # all Ashby/Lever jobs in queue
 *   node scripts/run-handlers.mjs --limit=3               # first 3
 *   node scripts/run-handlers.mjs --ats=lever             # lever only
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const JOBS_DIR = resolve(PROJECT_ROOT, 'skills', 'job-applications');
const PROMPTS_DIR = resolve(JOBS_DIR, 'prompts');
const APPLIED_JOBS_PATH = resolve(JOBS_DIR, 'applied_jobs.json');
const CHECKPOINT_PATH = resolve(JOBS_DIR, 'handler_checkpoint.json');

// ── Config ───────────────────────────────────────────────────────

const AGENT_TIMEOUT = 240;   // 4 min per job
const BROWSER_PROFILE = 'linkedin-jobs';

// ── Helpers ──────────────────────────────────────────────────────

function log(msg) {
  console.log(`[handler] ${msg}`);
}

function warn(msg) {
  console.warn(`[handler] ⚠ ${msg}`);
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function detectATS(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('jobs.ashbyhq.com') || u.includes('ashby_jid')) return 'ashby';
  if (u.includes('jobs.lever.co')) return 'lever';
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse.io')) return 'greenhouse';
  if (u.includes('myworkdayjobs.com') || /\.wd\d+\.myworkday/i.test(u)) return 'workday';
  if (u.includes('rippling.com') || u.includes('ats.rippling.com')) return 'rippling';
  if (u.includes('bamboohr.com')) return 'bamboohr';
  return 'unknown';
}

// ── Checkpoint ───────────────────────────────────────────────────

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return { completed: [], failed: [] };
  return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
}

function saveCheckpoint(data) {
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

// ── Append result ────────────────────────────────────────────────

function appendAppliedJob(entry) {
  const list = existsSync(APPLIED_JOBS_PATH)
    ? JSON.parse(readFileSync(APPLIED_JOBS_PATH, 'utf8'))
    : [];
  list.push({ ...entry, ts: new Date().toISOString(), method: 'handler-agent' });
  mkdirSync(dirname(APPLIED_JOBS_PATH), { recursive: true });
  writeFileSync(APPLIED_JOBS_PATH, JSON.stringify(list, null, 2));
}

// ── Build Agent Prompt ───────────────────────────────────────────

function buildPrompt(job, ats) {
  const company = job.company || job.org || 'the company';
  const position = job.position || job.title || 'the position';
  const url = job.apply_url || job.external_url || '';

  const atsHint = ats === 'ashby'
    ? `Apply at ${company} for ${position}.
This is an Ashby ATS form.
Follow the Ashby apply rules precisely:
- Cookie banner: accept first
- Upload resume first
- Location type: fill "San Francisco, CA", wait for dropdown, click correct US city option
- SMS consent: answer No (Yes redirects to careers page)
- Essay fields: fill → Tab → verify value stays → if empty, refill
- Before submit: verify every essay has value (Ashby clears essays on Submit)
- Handle all Yes/No radio buttons, select dropdowns
- Submit: click Submit button, wait for confirmation, verify URL changed or "Your application has been submitted" text
- If submit fails, check errors, fix one field at a time, retry (max 2 tries)
- Work authorization: click "Yes" for work authorization / "No" for sponsorship needed`
    : ats === 'lever'
    ? `Apply at ${company} for ${position}.
This is a Lever ATS form.
Follow the Lever apply rules precisely:
- Location: NEVER use fill(). Use press Meta+a → Backspace → type "San Francisco, CA, USA" → wait for dropdown → click → Tab → verify.
- If location has no ✱ indicator, skip it entirely.
- Essay field: use type(), not fill()
- Upload resume
- Fill standard fields (name, email, phone, LinkedIn)
- Handle radio buttons (sponsorship: No, EEO: Decline to answer)
- Handle combobox selects (EEO → "Decline")
- Submit: click Submit, wait for confirmation
- If resume shows "No file selected" after submit, re-upload and retry`
    : `Apply at ${company} for ${position}. This is a ${ats} ATS form. Fill all required fields and submit.`;

  return `Open the browser with profile "${BROWSER_PROFILE}".

Navigate to this URL: ${url}

${atsHint}

After you finish, report your result on a line starting with exactly "RESULT: " followed by:
- RESULT: SUCCESS — if the application was successfully submitted (you saw the confirmation page)
- RESULT: FAILURE: <reason> — if something went wrong (captcha, missing field, submit failed, etc.)
- RESULT: SKIP: <reason> — if this job should be skipped (already applied, requires manual process, etc.)

Be honest. Only say SUCCESS if you actually submitted and saw the confirmation page.`;
}

// ── Run Agent ────────────────────────────────────────────────────

function runAgent(prompt, sessionId, timeoutSec) {
  log(`Agent session: ${sessionId}, timeout: ${timeoutSec}s`);

  // Use a fresh session per job for isolation
  const args = [
    'agent',
    '--session-id', sessionId,
    '--message', prompt,
    '--json',
    '--timeout', String(timeoutSec),
  ];

  const result = spawnSync('openclaw', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024, // 20MB
    timeout: (timeoutSec + 30) * 1000,
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { error: `agent timed out after ${timeoutSec}s` };
    }
    return { error: result.error.message };
  }

  // Parse JSON output
  try {
    const parsed = JSON.parse(result.stdout);
    // The agent's reply is usually in parsed.reply or parsed.text
    const reply = parsed.reply || parsed.text || parsed.content || result.stdout;
    return { reply: String(reply).trim(), raw: parsed };
  } catch {
    // Not JSON — use raw stdout
    return { reply: result.stdout.trim() };
  }
}

// ── Parse Result ─────────────────────────────────────────────────

function parseResult(reply) {
  if (!reply) return { ok: false, error: 'no agent reply' };

  // Look for RESULT: marker
  for (const line of reply.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('RESULT: SUCCESS')) {
      return { ok: true };
    }
    if (trimmed.startsWith('RESULT: FAILURE:')) {
      return { ok: false, error: trimmed.slice('RESULT: FAILURE:'.length).trim() };
    }
    if (trimmed.startsWith('RESULT: SKIP:')) {
      return { ok: false, error: trimmed.slice('RESULT: SKIP:'.length).trim(), skip: true };
    }
  }

  // No RESULT marker — try heuristic
  if (/submitted|thank you|application received|success/i.test(reply)
    && !/couldn't|failed|could not|unable to|error|missing|recaptcha/i.test(reply)) {
    return { ok: true, uncertain: true };
  }

  return { ok: false, error: 'could not determine result from agent reply' };
}

// ── Browser Status Check ────────────────────────────────────────

function checkBrowser() {
  const result = spawnSync('openclaw', ['browser', '--browser-profile', BROWSER_PROFILE, 'status'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0 || !result.stdout) {
    return { running: false, error: result.stderr?.trim() || 'unknown' };
  }
  const out = result.stdout.toLowerCase();
  const running = out.includes('running') && !out.includes('stopped');
  return { running };
}

function startBrowser() {
  log(`Starting browser with profile "${BROWSER_PROFILE}"...`);
  const result = spawnSync('openclaw', ['browser', '--browser-profile', BROWSER_PROFILE, 'start', '--headless=false'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.status !== 0) {
    warn(`Failed to start browser: ${result.stderr?.trim() || result.stdout?.trim() || 'unknown'}`);
    return false;
  }
  log('Browser started.');
  return true;
}

// ── CLI ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    limit: Infinity,
    atsFilter: null,
    agentTimeout: AGENT_TIMEOUT,
  };
  for (const arg of argv) {
    if (arg === '--help') opts.help = true;
    else if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.slice(8), 10) || Infinity;
    else if (arg.startsWith('--ats=')) opts.atsFilter = arg.slice(6).toLowerCase();
    else if (arg.startsWith('--timeout=')) opts.agentTimeout = parseInt(arg.slice(10), 10) || AGENT_TIMEOUT;
  }
  return opts;
}

function printHelp() {
  console.log(`
Usage: node scripts/run-handlers.mjs [options]

Queue-driven hybrid handler. Reads external_queue.json, delegates each
Ashby/Lever job to the OpenClaw agent via \`openclaw agent --json\`.

Options:
  --limit=N        Process at most N jobs (default: all)
  --ats=NAME       Only one ATS type (ashby, lever)
  --timeout=N      Agent timeout in seconds (default: 240)
  --help

Requires: OpenClaw browser with profile "linkedin-jobs" running.
          The agent needs the browser tool + apply prompts.

Examples:
  node scripts/run-handlers.mjs
  node scripts/run-handlers.mjs --limit=5
  node scripts/run-handlers.mjs --ats=ashby
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }

  // 1. Load queue
  const queueFile = resolve(JOBS_DIR, 'external_queue.json');
  if (!existsSync(queueFile)) {
    console.error(`Queue not found: ${queueFile}`);
    process.exit(1);
  }
  const allJobs = JSON.parse(readFileSync(queueFile, 'utf8'));
  if (!Array.isArray(allJobs) || allJobs.length === 0) {
    console.log('Queue is empty.');
    process.exit(0);
  }
  console.log(`\n  Queue: ${queueFile}`);
  console.log(`  Jobs available: ${allJobs.length}`);
  if (opts.limit < allJobs.length) console.log(`  Limit: ${opts.limit}`);

  // 2. Filter
  let jobs = allJobs;
  if (opts.atsFilter) {
    jobs = jobs.filter((j) => detectATS(j.apply_url || j.external_url || '') === opts.atsFilter);
    console.log(`  ATS filter: ${opts.atsFilter} → ${jobs.length} matching`);
    if (jobs.length === 0) { console.log('No matching jobs.'); process.exit(0); }
  }
  if (opts.limit < jobs.length) jobs = jobs.slice(0, opts.limit);

  // 3. Check browser
  console.log('\n  Checking browser...');
  const browserStatus = checkBrowser();
  if (!browserStatus.running) {
    warn(`Browser "${BROWSER_PROFILE}" is not running: ${browserStatus.error || 'unknown'}`);
    const started = startBrowser();
    if (!started) {
      console.error('Cannot start browser. Aborting.');
      process.exit(1);
    }
    // Give it time
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    console.log('  Browser is running ✓');
  }

  // 4. Load checkpoint
  const checkpoint = loadCheckpoint();
  const done = new Set(checkpoint.completed);
  const todo = jobs.filter((j) => !done.has(j.apply_url || j.external_url || j.url));
  console.log(`  Already completed: ${checkpoint.completed.length}`);
  console.log(`  Queued this run: ${todo.length}\n`);

  if (todo.length === 0) {
    console.log('All done. Clear handler_checkpoint.json to rerun.');
    process.exit(0);
  }

  // 5. Process each job
  const results = { submitted: 0, failed: 0, skipped: 0, errors: [] };

  for (let i = 0; i < todo.length; i++) {
    const job = todo[i];
    const company = job.company || job.org || 'Unknown';
    const position = job.position || job.title || '';
    const url = job.apply_url || job.external_url || '';
    const ats = detectATS(url);
    const sessionId = `ats-job-${ats}-${Date.now()}-${i}`;

    console.log(`\n  ════════════════════════════════════`);
    console.log(`  [${i + 1}/${todo.length}] ${company} (${ats})`);
    console.log(`  ${position}`);
    console.log(`  ${url.slice(0, 120)}`);
    console.log(`  Session: ${sessionId}`);
    console.log(`  ════════════════════════════════════\n`);

    if (!['ashby', 'lever'].includes(ats)) {
      console.log(`  → SKIP (handler:${ats} not available)`);
      checkpoint.completed.push(url);
      saveCheckpoint(checkpoint);
      results.skipped++;
      continue;
    }

    // Build prompt and run agent
    const prompt = buildPrompt(job, ats);
    log(`Sending to agent...`);

    const agentResult = runAgent(prompt, sessionId, opts.agentTimeout);

    if (agentResult.error) {
      console.log(`  → CRASH: ${agentResult.error}`);
      results.failed++;
      results.errors.push({ company, url, error: agentResult.error });
      checkpoint.completed.push(url);
      saveCheckpoint(checkpoint);
      continue;
    }

    // Agent replied — parse result
    const status = parseResult(agentResult.reply);

    if (status.ok) {
      const certainty = status.uncertain ? ' (uncertain)' : '';
      console.log(`  → ✓ SUBMITTED${certainty}`);
      appendAppliedJob({ status: `submitted_${ats}`, company, position, url, platform: ats });
      results.submitted++;
    } else if (status.skip) {
      console.log(`  → SKIP: ${status.error}`);
      results.skipped++;
    } else {
      console.log(`  → ✗ FAILED: ${status.error}`);
      results.failed++;
      results.errors.push({ company, url, error: status.error });
    }

    checkpoint.completed.push(url);
    saveCheckpoint(checkpoint);

    // Brief pause between jobs
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 6. Summary
  console.log(`\n  ════════════════════════════════`);
  console.log(`  HANDLER RUN COMPLETE`);
  console.log(`  ════════════════════════════════`);
  console.log(`    Attempted: ${todo.length}`);
  console.log(`    Submitted: ${results.submitted}`);
  console.log(`    Failed:    ${results.failed}`);
  console.log(`    Skipped:   ${results.skipped}`);
  if (results.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const e of results.errors.slice(0, 10)) {
      console.log(`    - ${e.company}: ${e.error}`);
    }
    if (results.errors.length > 10) console.log(`    ... ${results.errors.length - 10} more`);
  }
  console.log('');

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('[handler] Fatal:', err); process.exit(1); });
