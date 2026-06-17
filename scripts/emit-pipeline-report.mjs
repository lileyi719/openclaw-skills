#!/usr/bin/env node
/**
 * Emit final pipeline report (success or failure). For OpenClaw after browser apply batch.
 *
 *   node scripts/emit-pipeline-report.mjs
 *   node scripts/emit-pipeline-report.mjs --outcome=failed --message="3/5 失败" --phase=external_apply
 */

import { createPipelineLogger } from './lib/pipeline-log.mjs';
import { buildPipelineReport, emitFinalReport } from './lib/pipeline-report.mjs';

function parseArgs(argv) {
  const o = { outcome: 'success', phase: 'apply' };
  for (const a of argv) {
    if (a.startsWith('--outcome=')) o.outcome = a.slice(10);
    else if (a.startsWith('--phase=')) o.phase = a.slice(8);
    else if (a.startsWith('--stage=')) o.stage = a.slice(8);
    else if (a.startsWith('--message=')) o.message = a.slice(10);
    else if (a.startsWith('--error=')) o.error = a.slice(8);
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
const log = createPipelineLogger({ stage: args.stage || args.phase });
const report = buildPipelineReport({
  phase: args.phase,
  stage: args.stage || args.phase,
  outcome: args.outcome === 'failed' ? 'failed' : 'success',
  error: args.error || null,
  messageOverride: args.message || null,
});
emitFinalReport(log, report);
process.exit(report.outcome === 'failed' ? 1 : 0);
