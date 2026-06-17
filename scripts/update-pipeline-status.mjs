#!/usr/bin/env node
/**
 * Update run_status.json + append pipeline.log from OpenClaw browser workflows.
 *
 *   node scripts/update-pipeline-status.mjs --stage=scan --step=job --message="3/15 Verkada"
 *   node scripts/update-pipeline-status.mjs --stage=easy_apply --step=submit --message="done" --status=done
 */

import { createPipelineLogger } from './lib/pipeline-log.mjs';

function parseArgs(argv) {
  const o = { status: 'running' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--stage=')) o.stage = a.slice(8);
    else if (a.startsWith('--step=')) o.step = a.slice(7);
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a.startsWith('--status=')) o.status = a.slice(9);
    else if (a.startsWith('--progress=')) {
      const [c, t] = a.slice(11).split(',').map(Number);
      o.progress = { current: c, total: t };
    }
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
if (!args.stage || !args.step) {
  console.error('Usage: --stage=... --step=... [--message=...] [--progress=3,15] [--status=running|done|failed]');
  process.exit(1);
}

const log = createPipelineLogger({ stage: args.stage });
const level = args.status === 'done' ? 'done' : args.status === 'failed' ? 'error' : 'info';
const fn = log[level] || log.info;
fn(args.step, args.message || args.step, {
  progress: args.progress,
  statusFields: args.status !== 'running' ? { status: args.status } : undefined,
});
