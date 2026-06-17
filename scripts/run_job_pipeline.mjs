#!/usr/bin/env node
/**
 * Job pipeline (scan → prepare → apply)
 *
 *   node scripts/run_job_pipeline.mjs --phase=all|full   # 全自动到投递
 *   node scripts/run_job_pipeline.mjs --phase=scan|prepare|apply
 *
 * Apply uses Playwright + persistent Chromium profile (same as scan).
 * Interactive OpenClaw browser skills remain optional for manual runs.
 *
 * Always emits one [PIPELINE_FINAL] on success or failure.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPipelineLogger, isNonInteractive, JOB_APPS_DIR } from './lib/pipeline-log.mjs';
import { prepareQueues } from './lib/pipeline-queue.mjs';
import { buildPipelineReport, emitFinalReport } from './lib/pipeline-report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { phase: 'prepare' };
  for (const a of argv) {
    if (a.startsWith('--phase=')) args.phase = a.slice('--phase='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function runNodeScript(scriptName, log, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const scriptPath = resolve(__dirname, scriptName);
    log.info('spawn', `Starting ${scriptName}`, { script: scriptName });

    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: {
        ...process.env,
        PIPELINE_NON_INTERACTIVE: isNonInteractive() ? '1' : '0',
        SKIP_PIPELINE_FINAL: '1',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (buf) => process.stderr.write(buf));
    child.stderr.on('data', (buf) => process.stderr.write(buf));

    child.on('close', (code) => {
      if (code === 0) {
        log.info('spawn', `${scriptName} exited 0`);
        resolvePromise();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function phaseScan(log) {
  log.info('scan', 'Script scan (Playwright) — reads scan_config.json');
  await runNodeScript('scan_linkedin_jobs.mjs', log, { PIPELINE_STAGE: 'scan' });
  log.done('scan', 'Script scan complete');
}

async function phasePrepare(log) {
  log.info('prepare', 'Splitting queues (workday / external / skipped)');
  const prepLog = createPipelineLogger({ stage: 'prepare' });
  const result = prepareQueues(prepLog);
  log.done('prepare', 'Queues written', { summary: result.summary });
  return result;
}

async function phaseApply(log) {
  log.info('apply', 'Starting automated apply (Playwright browser)');
  await runNodeScript('apply_jobs.mjs', log, { PIPELINE_STAGE: 'apply' });
  log.done('apply', 'Apply phase complete');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error(
      'Usage:\n' +
        '  node scripts/run_job_pipeline.mjs --phase=scan|prepare|apply|all|full\n' +
        '  all/full = scan + prepare + apply (end-to-end)\n',
    );
    process.exit(0);
  }

  const log = createPipelineLogger({ stage: 'pipeline' });
  let outcome = 'success';
  let errorText = null;

  log.info('start', `Pipeline (phase=${args.phase})`, { statusFields: { outputDir: JOB_APPS_DIR } });

  try {
    if (
      args.phase === 'scan' ||
      args.phase === 'all' ||
      args.phase === 'scan-playwright' ||
      args.phase === 'all-playwright'
    ) {
      await phaseScan(log);
    }

    if (
      args.phase === 'prepare' ||
      args.phase === 'all' ||
      args.phase === 'full' ||
      args.phase === 'all-playwright'
    ) {
      await phasePrepare(log);
    }

    if (
      args.phase === 'apply' ||
      args.phase === 'all' ||
      args.phase === 'full' ||
      args.phase === 'all-playwright' ||
      args.phase === 'easy_apply' ||
      args.phase === 'external_apply' ||
      args.phase === 'workday_apply'
    ) {
      await phaseApply(log);
    }
  } catch (err) {
    outcome = 'failed';
    errorText = err.message || String(err);
    log.error('fatal', errorText, { error: err.stack });
  } finally {
    const report = buildPipelineReport({
      phase: args.phase,
      stage: 'pipeline',
      outcome,
      error: errorText,
    });
    emitFinalReport(log, report);
  }

  if (outcome === 'failed') process.exit(1);
}

main();
