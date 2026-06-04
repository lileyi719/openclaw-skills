#!/usr/bin/env node
/**
 * Periodic progress while long browser steps run.
 */

import { createPipelineLogger } from './lib/pipeline-log.mjs';

function parseArgs(argv) {
  const o = {
    interval: Number(process.env.PIPELINE_HEARTBEAT_SEC || '15', 10),
    maxMinutes: 120,
    once: false,
  };
  for (const a of argv) {
    if (a.startsWith('--stage=')) o.stage = a.slice(8);
    else if (a.startsWith('--step=')) o.step = a.slice(7);
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a.startsWith('--interval=')) o.interval = Number(a.slice(11), 10);
    else if (a.startsWith('--max-minutes=')) o.maxMinutes = Number(a.slice(14), 10);
    else if (a === '--once') o.once = true;
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
if (!args.stage || !args.step) {
  console.error(
    'Usage: --stage=... --step=... [--message=...] [--interval=15] [--max-minutes=120] [--once]',
  );
  process.exit(1);
}

const log = createPipelineLogger({ stage: args.stage });
const started = Date.now();

function tick() {
  const elapsedSec = Math.floor((Date.now() - started) / 1000);
  const base = args.message || args.step;
  log.heartbeat(args.step, `${base}（已运行 ${elapsedSec}s）`, { elapsedSec });
}

if (args.once) {
  tick();
  process.exit(0);
}

tick();
const timer = setInterval(tick, args.interval * 1000);
const maxMs = args.maxMinutes * 60 * 1000;
const stopTimer = setTimeout(() => {
  clearInterval(timer);
  log.warn(args.step, `heartbeat stopped after ${args.maxMinutes} min`);
  process.exit(0);
}, maxMs);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    clearInterval(timer);
    clearTimeout(stopTimer);
    process.exit(0);
  });
}
