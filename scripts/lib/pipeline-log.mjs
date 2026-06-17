import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const JOB_APPS_DIR = resolve(__dirname, '..', '..', 'skills', 'job-applications');

export function isNonInteractive() {
  if (process.env.PIPELINE_NON_INTERACTIVE === '1') return true;
  if (process.env.PIPELINE_NON_INTERACTIVE === '0') return false;
  return !process.stdin.isTTY;
}

/** Single timestamp: current wall-clock in OS timezone (name included in string). */
export function formatSystemTs(date = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

/**
 * Structured logs for OpenClaw: stderr + pipeline.log + run_status.json
 * Time field: `ts` only (system local).
 */
export function createPipelineLogger({ runId = `run_${Date.now()}`, stage = 'pipeline' } = {}) {
  mkdirSync(JOB_APPS_DIR, { recursive: true });
  const logPath = resolve(JOB_APPS_DIR, 'pipeline.log');
  const statusPath = resolve(JOB_APPS_DIR, 'run_status.json');

  function writeStatus(partial) {
    const status = {
      runId,
      stage,
      step: 'init',
      status: 'running',
      message: '',
      progress: null,
      error: null,
      elapsedSec: null,
      ts: formatSystemTs(),
      ...partial,
    };
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    return status;
  }

  writeStatus({ step: 'init', message: '' });

  function emit(level, step, message, extra = {}) {
    const { progress, error, statusFields, elapsedSec, ...rest } = extra;
    const entry = {
      ts: formatSystemTs(),
      level,
      stage,
      step,
      message,
      runId,
      ...(progress != null ? { progress } : {}),
      ...(elapsedSec != null ? { elapsedSec } : {}),
      ...rest,
    };
    const line = `[PIPELINE] ${JSON.stringify(entry)}\n`;
    process.stderr.write(line);
    try {
      appendFileSync(logPath, line);
    } catch {
      /* best-effort */
    }

    const statusLevel =
      level === 'error' ? 'failed' : level === 'done' ? 'done' : 'running';

    writeStatus({
      step,
      status: statusFields?.status ?? statusLevel,
      message,
      progress: progress ?? null,
      error: level === 'error' ? (error ?? message) : null,
      elapsedSec: elapsedSec ?? null,
      ts: entry.ts,
      ...statusFields,
    });
    return entry;
  }

  return {
    logPath,
    statusPath,
    info: (step, message, extra) => emit('info', step, message, extra),
    warn: (step, message, extra) => emit('warn', step, message, extra),
    error: (step, message, extra) => emit('error', step, message, extra),
    done: (step, message, extra) => emit('done', step, message, extra),
    heartbeat: (step, message, extra) => emit('heartbeat', step, message, extra),
  };
}
