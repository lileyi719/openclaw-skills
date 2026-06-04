import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { formatSystemTs, JOB_APPS_DIR } from './pipeline-log.mjs';
import { loadScanConfig } from './linkedin-search.mjs';

function loadJson(name, fallback) {
  const p = resolve(JOB_APPS_DIR, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function countAppliedByStatus(applied) {
  const stats = { submitted: 0, failed: 0, skipped: 0, other: 0 };
  if (!Array.isArray(applied)) return stats;
  for (const row of applied) {
    const s = String(row.status || '').toLowerCase();
    if (s.includes('submitted') || s.includes('success')) stats.submitted++;
    else if (s.includes('fail') || s.includes('error')) stats.failed++;
    else if (s.includes('skip') || s.includes('limit')) stats.skipped++;
    else stats.other++;
  }
  return stats;
}

/**
 * Build final report object (success or failure).
 */
export function buildPipelineReport({
  phase = 'pipeline',
  stage = 'pipeline',
  outcome = 'success',
  error = null,
  messageOverride = null,
} = {}) {
  const config = loadScanConfig();
  const easy = loadJson('easy_apply_jobs.json', []);
  const external = loadJson('external_apply_jobs.json', []);
  const workdayQ = loadJson('workday_queue.json', []);
  const externalQ = loadJson('external_queue.json', []);
  const skipped = loadJson('skipped_jobs.json', []);
  const applied = loadJson('applied_jobs.json', []);
  const applyStats = countAppliedByStatus(applied);

  const counts = {
    scan_target: config.scan_target,
    easy_apply: Array.isArray(easy) ? easy.length : 0,
    external_raw: Array.isArray(external) ? external.length : 0,
    workday_queue: Array.isArray(workdayQ) ? workdayQ.length : 0,
    external_queue: Array.isArray(externalQ) ? externalQ.length : 0,
    skipped: Array.isArray(skipped) ? skipped.length : 0,
    applied_submitted: applyStats.submitted,
    applied_failed: applyStats.failed,
    applied_skipped: applyStats.skipped,
  };

  let message = messageOverride;
  if (!message) {
    if (outcome === 'success') {
      message =
        `【完成】阶段=${phase}，扫描类型=${counts.scan_target}。` +
        `Easy Apply ${counts.easy_apply} 条，外链 ${counts.external_raw} 条；` +
        `队列：Workday ${counts.workday_queue}，External ${counts.external_queue}，跳过 ${counts.skipped}。` +
        counts.applied_submitted + counts.applied_failed + counts.applied_skipped > 0
          ? ` 投递：成功 ${counts.applied_submitted}，失败 ${counts.applied_failed}，跳过 ${counts.applied_skipped}。`
          : counts.easy_apply + counts.external_queue + counts.workday_queue > 0
            ? ' 投递：队列有待处理职位（若未自动投递，请检查 apply 阶段日志）。'
            : ' 投递：无待投递队列。';
    } else {
      message =
        `【失败】阶段=${phase}。原因：${error || '未知错误'}。` +
        `当前数据：Easy ${counts.easy_apply}，外链 ${counts.external_raw}，` +
        `Workday 队列 ${counts.workday_queue}，External 队列 ${counts.external_queue}。`;
    }
  }

  return {
    ts: formatSystemTs(),
    outcome,
    phase,
    stage,
    message,
    error: error || null,
    counts,
  };
}

/**
 * Write pipeline_report.json + [PIPELINE_FINAL] on stderr + pipeline.log + run_status.
 */
export function emitFinalReport(log, report) {
  const reportPath = resolve(JOB_APPS_DIR, 'pipeline_report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const line = `[PIPELINE_FINAL] ${JSON.stringify(report)}\n`;
  process.stderr.write(line);
  try {
    appendFileSync(resolve(JOB_APPS_DIR, 'pipeline.log'), line);
  } catch {
    /* ignore */
  }

  const extra = {
    statusFields: { status: report.outcome === 'success' ? 'done' : 'failed' },
    counts: report.counts,
    outcome: report.outcome,
    phase: report.phase,
  };

  if (report.outcome === 'success') {
    log.done('final_report', report.message, extra);
  } else {
    log.error('final_report', report.message, { ...extra, error: report.error || report.message });
  }

  return report;
}
