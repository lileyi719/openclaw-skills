#!/usr/bin/env node
/**
 * One human command — External Apply until target met (auto-continue):
 *   browser start → apply agent
 *
 *   node scripts/run-external-apply.mjs
 *   node scripts/run-external-apply.mjs --target=100
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_APPLY_PROMPT,
  resolveMaxContinuations,
  formatSessionStamp,
  ensureApplyBrowserRunning,
  verifyBrowserAttach,
  verifyLinkedInSession,
  runApplyBatch,
  runPreflightScan,
  printApplySummary,
  printPipelineSummary,
} from './lib/external-apply-runner.mjs';
import {
  DEFAULT_ROTATE_MAX_BROWSER,
  DEFAULT_ROTATE_MAX_SUBMITS,
  resolveRotateMaxBrowser,
} from './lib/openclaw-agent-runner.mjs';
import { JOB_APPS_DIR } from './lib/pipeline-log.mjs';
import { formatDuration } from './lib/agent-session-record.mjs';
import { abortGatewayAgentSession } from './lib/openclaw-agent-runner.mjs';
import { loadJobEnv } from './lib/load-job-env.mjs';

loadJobEnv();

const PIPELINE_RUNS_PATH = resolve(JOB_APPS_DIR, 'pipeline_runs.json');

function parseArgs(argv) {
  const stamp = formatSessionStamp();
  const o = {
    pipelineId: `linkedin-pipeline-${stamp}`,
    applySessionId: `linkedin-ext-${stamp}`,
    target: 100,
    autoContinue: true,
    maxContinuations: null,
    heartbeatMs: 20_000,
    verbose: true,
    local: false,
    agentTimeoutSeconds: 0,
    maxTurnMs: 0,
    turnIdleMs: 600_000,
    promptFile: DEFAULT_APPLY_PROMPT,
    message: null,
    preflightScan: false,
    useQueue: false,
    queueLimit: 40,
    scanLimit: 25,
    scanPages: 3,
    includeSecondary: true,
    openAllowlist: false,
    skipWorkday: false,
    rotateMaxBrowser: null,
    rotateMaxSubmits: DEFAULT_ROTATE_MAX_SUBMITS,
  };
  for (const a of argv) {
    if (a.startsWith('--pipeline-id=')) o.pipelineId = a.slice(14);
    else if (a.startsWith('--target=')) o.target = Number(a.slice(9)) || 100;
    else if (a.startsWith('--session-id=')) o.applySessionId = a.slice(13);
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a === '--unlimited-continuations') o.maxContinuations = 0;
    else if (a.startsWith('--max-continuations=')) {
      const n = Number(a.slice(20));
      o.maxContinuations = Number.isFinite(n) ? n : 0;
    }
    else if (a.startsWith('--heartbeat=')) o.heartbeatMs = (Number(a.slice(12)) || 20) * 1000;
    else if (a.startsWith('--timeout=')) o.agentTimeoutSeconds = Number(a.slice(10));
    else if (a.startsWith('--max-turn-min=')) o.maxTurnMs = (Number(a.slice(15)) || 0) * 60_000;
    else if (a.startsWith('--turn-idle-sec=')) o.turnIdleMs = (Number(a.slice(16)) || 600) * 1000;
    else if (a === '--quiet') o.verbose = false;
    else if (a === '--no-auto-continue') o.autoContinue = false;
    else if (a === '--local') o.local = true;
    else if (a === '--no-local') o.local = false;
    else if (a === '--preflight-scan') o.preflightScan = true;
    else if (a === '--from-queue') o.useQueue = true;
    else if (a.startsWith('--queue-limit=')) o.queueLimit = Number(a.slice(14)) || 40;
    else if (a.startsWith('--scan-limit=')) o.scanLimit = Number(a.slice(13)) || 25;
    else if (a.startsWith('--scan-pages=')) o.scanPages = Number(a.slice(13)) || 3;
    else if (a === '--include-secondary') o.includeSecondary = true;
    else if (a === '--open-allowlist') o.openAllowlist = true;
    else if (a === '--skip-workday') o.skipWorkday = true;
    else if (a.startsWith('--rotate-browser=')) {
      const n = Number(a.slice(17));
      o.rotateMaxBrowser = Number.isFinite(n) && n > 0 ? n : null;
    }
    else if (a.startsWith('--rotate-submits=')) {
      o.rotateMaxSubmits = Number(a.slice(17)) || DEFAULT_ROTATE_MAX_SUBMITS;
    }
    else if (a === '--help' || a === '-h') o.help = true;
  }
  if (o.maxContinuations == null) o.maxContinuations = resolveMaxContinuations(null, o.target);
  else o.maxContinuations = resolveMaxContinuations(o.maxContinuations, o.target);
  return o;
}

function appendPipelineRun(record) {
  mkdirSync(JOB_APPS_DIR, { recursive: true });
  let runs = [];
  if (existsSync(PIPELINE_RUNS_PATH)) {
    try {
      runs = JSON.parse(readFileSync(PIPELINE_RUNS_PATH, 'utf8'));
    } catch {
      runs = [];
    }
  }
  runs.push(record);
  writeFileSync(PIPELINE_RUNS_PATH, `${JSON.stringify(runs, null, 2)}\n`, 'utf8');
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-external-apply.mjs [options]

  ONE command — autonomous External Apply (human does nothing else):

    1. openclaw browser --browser-profile linkedin-jobs start
    2. Gateway agent (single long turn, no CLI timeout) until --target submitted

Options:
  --target=N                 Apply goal (default: 100)
  --max-continuations=N      Cap auto-continue turns (N>0); 0 = unlimited
  --unlimited-continuations  Same as --max-continuations=0 (default when auto-continue on)
  --no-auto-continue         No agent turn auto-continue (single turn only)
  --heartbeat=SEC            Progress heartbeat interval (default: 20)
  --timeout=SEC              openclaw agent --timeout (default: 0 = unlimited Gateway wait)
  --max-turn-min=MIN         Wrapper max turn duration (default: 0 = unlimited)
  --turn-idle-sec=SEC        Kill CLI if session jsonl idle (default: 600)
  --quiet                    Hide openclaw agent verbose stream
  --local                    Embedded agent (--local); not recommended for batch apply
  --no-local                 Gateway agent (default)
  --session-id=ID            Override first apply session id (each auto-continue still gets -cN suffix)
  --message=TEXT             Custom apply message (skip default prompt)
  --preflight-scan           Run scan-ats-external before apply (fills Tier1 queue)
  --from-queue               Prefer external_queue.json jobs before LinkedIn search
  --queue-limit=N            Max queue jobs injected into prompt (default: 40)
  --scan-limit=N             Jobs to collect when --preflight-scan (default: 25)
  --scan-pages=N             LinkedIn pages per keyword when scanning (default: 3)
  --include-secondary        Agent may also attempt Tier2 ATS (Rippling, BambooHR, …)
  --open-allowlist           Try all ATS platforms (Greenhouse, ICIMS, custom sites, …)
  --skip-workday             Skip Workday URLs (skipped_platform workday_deferred)
  --rotate-submits=N         Proactive session rotate after N submits in one turn (default: 5)
  --rotate-browser=N         Browser safety cap (default: N_submits × 80, i.e. 400 when submits=5)

Prerequisites (one-time):
  - openclaw gateway running (restart after openclaw.json browser profile change)
  - linkedin-jobs managed profile configured (see LINKEDIN_JOBS_BROWSER.md)
  - skills/job-applications/.env with LINKEDIN_EMAIL + LINKEDIN_PASSWORD (pipeline auto-login)
  - openclaw.json tools.alsoAllow includes browser

Examples:
  node scripts/run-external-apply.mjs
  node scripts/run-external-apply.mjs --target=5
  node scripts/run-external-apply.mjs --no-auto-continue
`);
}

function main() {
  return mainAsync().catch((err) => {
    console.error('[pipeline] fatal:', err.message);
    process.exit(1);
  });
}

async function mainAsync() {
  let activeSessionId = null;
  const onStop = () => {
    if (activeSessionId) abortGatewayAgentSession(activeSessionId, console.error);
  };
  process.once('SIGINT', () => {
    onStop();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    onStop();
    process.exit(143);
  });

  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }

    const pipelineStarted = Date.now();
    console.error(`[pipeline] id=${args.pipelineId} started=${new Date().toISOString()}`);
    console.error(`[pipeline] apply target=${args.target} session=${args.applySessionId}`);

    ensureApplyBrowserRunning(console.error);
    verifyBrowserAttach(console.error);
    await verifyLinkedInSession(console.error);

    if (args.preflightScan) {
      runPreflightScan(console.error, {
        scanLimit: args.scanLimit,
        scanPages: args.scanPages,
        openAllowlist: args.openAllowlist,
        skipWorkday: args.skipWorkday,
      });
    }

    console.error(`[pipeline] apply until ${args.target} new submitted (new session=${args.applySessionId})`);
    if (args.openAllowlist) console.error('[pipeline] mode: open-allowlist (try all ATS except Workday if --skip-workday)');
    if (args.skipWorkday) console.error('[pipeline] mode: skip-workday');
    if (args.useQueue) console.error('[pipeline] mode: queue-first (--from-queue)');
    activeSessionId = args.applySessionId;
    const applyRecord = await runApplyBatch(
      {
        sessionId: args.applySessionId,
        target: args.target,
        promptFile: args.promptFile,
        message: args.message,
        autoContinue: args.autoContinue,
        maxContinuations: args.maxContinuations,
        heartbeatMs: args.heartbeatMs,
        verbose: args.verbose,
        local: args.local,
        agentTimeoutSeconds: args.agentTimeoutSeconds,
        maxTurnMs: args.maxTurnMs,
        turnIdleMs: args.turnIdleMs,
        useQueue: args.useQueue,
        queueLimit: args.queueLimit,
        includeSecondary: args.includeSecondary || args.openAllowlist,
        openAllowlist: args.openAllowlist,
        skipWorkday: args.skipWorkday,
        rotateMaxBrowser: resolveRotateMaxBrowser(args.rotateMaxBrowser, args.rotateMaxSubmits),
        rotateMaxSubmits: args.rotateMaxSubmits,
      },
      console.error,
    );
    printApplySummary(applyRecord, console.error);
    activeSessionId = null;

    const durationMs = Date.now() - pipelineStarted;
    const pipeline = {
      pipelineId: args.pipelineId,
      startedAt: new Date(pipelineStarted).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs,
      durationHuman: formatDuration(durationMs),
      apply: applyRecord,
      goalMet: applyRecord.goalMet,
    };

    appendPipelineRun(pipeline);
    printPipelineSummary(pipeline, console.error);

    process.exit(applyRecord.goalMet ? 0 : applyRecord.exitCode || 1);
  } catch (err) {
    console.error('[pipeline] fatal:', err.message);
    process.exit(1);
  }
}

main();
