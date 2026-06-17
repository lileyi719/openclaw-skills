#!/usr/bin/env node
/**
 * Print session_runs.json as a readable table.
 *   node scripts/list-agent-sessions.mjs
 *   node scripts/list-agent-sessions.mjs --last=5
 */

import { loadSessionRuns, SESSION_RUNS_PATH } from './lib/agent-session-record.mjs';

function parseArgs(argv) {
  const o = { last: null };
  for (const a of argv) {
    if (a.startsWith('--last=')) o.last = Number(a.slice(7));
  }
  return o;
}

const { last } = parseArgs(process.argv.slice(2));
const runs = loadSessionRuns();

if (runs.length === 0) {
  console.log(`No sessions recorded yet. Run:\n  node scripts/run-external-apply-session.mjs`);
  console.log(`Log file: ${SESSION_RUNS_PATH}`);
  process.exit(0);
}

const slice = last && last > 0 ? runs.slice(-last) : runs;

console.log('sessionId\tstarted\t\tduration\tsubmitted\ttarget\tgoal\tskipped\ttotal\tincomplete');
for (const r of slice) {
  const j = r.jobs || {};
  const target = r.targetPerRun ?? 100;
  const goal = r.goalMet ?? (j.submitted >= target);
  console.log(
    [
      r.sessionId,
      (r.startedAt || '').slice(0, 19),
      r.durationHuman || '-',
      j.submitted ?? 0,
      target,
      goal ? 'yes' : 'no',
      j.skipped ?? 0,
      j.total ?? 0,
      r.incompleteTurn ? 'yes' : 'no',
    ].join('\t'),
  );
}

console.log(`\n${slice.length} session(s) shown | file: ${SESSION_RUNS_PATH}`);
