#!/usr/bin/env node
/**
 * Run OpenClaw external-apply agent (apply phase only).
 * For full pipeline use: node scripts/run-external-apply.mjs
 */

import {
  DEFAULT_APPLY_PROMPT,
  resolveMaxContinuations,
  formatSessionStamp,
  runApplyBatch,
  printApplySummary,
  WORKSPACE,
} from './lib/external-apply-runner.mjs';
import { resolve } from 'path';

function parseArgs(argv) {
  const o = {
    sessionId: `linkedin-ext-${formatSessionStamp()}`,
    promptFile: DEFAULT_APPLY_PROMPT,
    message: null,
    local: false,
    agentTimeoutSeconds: 0,
    maxTurnMs: 0,
    turnIdleMs: 600_000,
    target: 100,
    autoContinue: true,
    maxContinuations: null,
  };
  for (const a of argv) {
    if (a.startsWith('--session-id=')) o.sessionId = a.slice(13);
    else if (a.startsWith('--prompt-file=')) o.promptFile = resolve(WORKSPACE, a.slice(14));
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a.startsWith('--target=')) o.target = Number(a.slice(9)) || 100;
    else if (a === '--unlimited-continuations') o.maxContinuations = 0;
    else if (a.startsWith('--max-continuations=')) {
      const n = Number(a.slice(20));
      o.maxContinuations = Number.isFinite(n) ? n : 0;
    }
    else if (a.startsWith('--timeout=')) o.agentTimeoutSeconds = Number(a.slice(10));
    else if (a.startsWith('--max-turn-min=')) o.maxTurnMs = (Number(a.slice(15)) || 0) * 60_000;
    else if (a.startsWith('--turn-idle-sec=')) o.turnIdleMs = (Number(a.slice(16)) || 600) * 1000;
    else if (a === '--local') o.local = true;
    else if (a === '--no-local') o.local = false;
    else if (a === '--no-auto-continue') o.autoContinue = false;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  if (o.maxContinuations == null) o.maxContinuations = resolveMaxContinuations(null, o.target);
  else o.maxContinuations = resolveMaxContinuations(o.maxContinuations, o.target);
  return o;
}

function printHelp() {
  console.log(`Apply-only wrapper. Full autonomous pipeline:
  node scripts/run-external-apply.mjs

This script (apply phase only):
  node scripts/run-external-apply-session.mjs [--target=100] [--session-id=ID]
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const record = await runApplyBatch(args, console.error);
printApplySummary(record, console.error);
process.exit(record.goalMet ? 0 : record.exitCode || 1);
