import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  APPLIED_JOBS_PATH,
  SESSION_RUNS_PATH,
  appendSessionRun,
  diffAppliedJobs,
  formatDuration,
  loadAppliedJobs,
  summarizeJobs,
} from './agent-session-record.mjs';
import {
  detectEarlyApplyStop,
  detectEmbeddedFallback,
  runOpenClawAgent,
  abortGatewayAgentSession,
  startSessionProgressMonitor,
  DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS,
  DEFAULT_MAX_TURN_MS,
  DEFAULT_TURN_IDLE_MS,
} from './openclaw-agent-runner.mjs';
import { JOB_APPS_DIR } from './pipeline-log.mjs';
import { formatKeywordListInline } from './linkedin-job-search-keywords.mjs';
import { formatAllowlistSummary } from './ats-url-filter.mjs';
import { prepareQueues } from './pipeline-queue.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKSPACE = resolve(__dirname, '../..');
export const DEFAULT_APPLY_PROMPT = resolve(JOB_APPS_DIR, 'prompts/linkedin-external-compact.md');
/** OpenClaw-managed CDP profile for LinkedIn batch apply (not user MCP / not default openclaw). */
export const APPLY_BROWSER_PROFILE = 'linkedin-jobs';

export function formatSessionStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function ensureApplyBrowserRunning(log = console.error) {
  log(`[pipeline] ensuring browser profile ${APPLY_BROWSER_PROFILE} is running…`);
  const r = spawnSync('openclaw', ['browser', '--browser-profile', APPLY_BROWSER_PROFILE, 'start'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (r.stdout) process.stderr.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    log(`[pipeline] warn: browser start returned non-zero — retry after Gateway restart if profile is new`);
  }
  return true;
}

/** @deprecated use ensureApplyBrowserRunning */
export const ensureUserBrowserRunning = ensureApplyBrowserRunning;

/** Fail fast if managed CDP profile cannot list tabs (start alone is not enough). */
export function verifyBrowserAttach(log = console.error) {
  log(`[pipeline] preflight: openclaw browser --browser-profile ${APPLY_BROWSER_PROFILE} tabs…`);
  const r = spawnSync('openclaw', ['browser', '--browser-profile', APPLY_BROWSER_PROFILE, 'tabs'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    timeout: 45_000,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (r.stdout) process.stderr.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0 || /timed out|Could not connect|ProfileUnavailable|attach failed|browser not running/i.test(out)) {
    throw new Error(
      `Browser preflight failed — start ${APPLY_BROWSER_PROFILE} profile, then retry:\n`
      + `  openclaw browser --browser-profile ${APPLY_BROWSER_PROFILE} start\n`
      + `  openclaw browser --browser-profile ${APPLY_BROWSER_PROFILE} tabs\n`
      + '  See skills/job-applications/LINKEDIN_JOBS_BROWSER.md for first-time LinkedIn login.\n'
      + out.slice(0, 400),
    );
  }
  log('[pipeline] preflight: browser tabs OK');
  return true;
}

export function detectIncomplete(outputText) {
  return /incomplete turn detected|Agent couldn't generate a response/i.test(outputText);
}

function loadPromptFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Prompt file not found: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

/** No cap on auto-continue turns (stop only at target, incomplete, or Ctrl+C). */
export const UNLIMITED_CONTINUATIONS = Infinity;

export function defaultMaxContinuations(target) {
  return Math.max(12, Math.ceil(target / 2));
}

/** @param {number|null|undefined} raw CLI value; 0 = unlimited */
export function resolveMaxContinuations(raw, target) {
  if (raw === 0 || raw === UNLIMITED_CONTINUATIONS) return UNLIMITED_CONTINUATIONS;
  if (raw == null) return UNLIMITED_CONTINUATIONS;
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return defaultMaxContinuations(target);
}

export function isUnlimitedContinuations(max) {
  return max === UNLIMITED_CONTINUATIONS || !Number.isFinite(max);
}

export function formatContinuationsCap(max) {
  return isUnlimitedContinuations(max) ? 'unlimited' : String(max);
}

export function injectRunTarget(text, target) {
  return text.replace(/\{\{RUN_TARGET\}\}/g, String(target));
}

export function loadExternalQueue(limit = 40) {
  const path = resolve(JOB_APPS_DIR, 'external_queue.json');
  if (!existsSync(path)) return [];
  try {
    const q = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(q) ? q.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function runPreflightScan(log = console.error, opts = {}) {
  const keywords = opts.keywords || 'Software Engineer';
  const limit = opts.scanLimit ?? 25;
  const pages = opts.scanPages ?? 3;
  log('[pipeline] preflight scan (Tier1 ATS → external_queue)…');
  const r = spawnSync(
    'node',
    [
      resolve(WORKSPACE, 'scripts/scan-ats-external.mjs'),
      `--keywords=${keywords}`,
      `--limit=${limit}`,
      `--pages=${pages}`,
    ],
    { cwd: WORKSPACE, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  );
  if (r.stdout) process.stderr.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const prep = prepareQueues(null, { queueTier: 'primary' });
  log(`[pipeline] queue after scan: external=${prep.externalQueue.length} skipped=${prep.skippedQueue.length}`);
  return prep;
}

export function buildApplyBatchPreamble(args) {
  const atsRules = formatAllowlistSummary();
  const queueBlock = args.fromQueue?.length
    ? [
      `- **队列模式**：先处理下列 ${args.fromQueue.length} 条 Tier1 \`external_queue\`（browser open 其 apply_url），完成后再 LinkedIn 搜索补货。`,
      '```json',
      JSON.stringify(args.fromQueue.map((j) => ({
        company: j.company,
        apply_url: j.apply_url || j.external_url,
        platform: j.platform,
      })), null, 2),
      '```',
      '',
    ].join('\n')
    : '';

  return [
    `【本 run 独立批次】sessionId=${args.sessionId}；target=${args.target} 个**新** submitted（External Apply）。`,
    `- 进度只数本 run 新写入 applied_jobs.json 的 submitted_* 条数，从 0 开始，满 ${args.target} 才结束。`,
    `- applied_jobs.json 历史 submitted 仅 dedupe skip，不计入本 run 进度。`,
    `- **必须用 browser 工具 JSON**；禁止 exec openclaw browser CLI；禁止 pkill/gateway restart/config set。`,
    `- **ATS 分级（必须先开 apply tab 再判定）**：`,
    atsRules,
    args.includeSecondary
      ? '- Tier2 SECONDARY 在本 run **允许** 尝试（Rippling/BambooHR/…）。'
      : '- 本 run **仅 Tier1 PRIMARY**（Ashby/Lever/embed）；Tier2 一律 skipped_platform + reason not_primary_tier。',
    `- **禁止** 在 LinkedIn 列表页因「company website / external_apply / senior」直接 append skip；必须 click Apply → snapshot(apply) → 用 apply tab 的 **真实 URL** append。`,
    `- append-applied-job.mjs **拒绝** linkedin.com/jobs/view 上的 skipped_platform/incomplete（聚合站 skipped_aggregator 除外）。`,
    queueBlock,
    `- LinkedIn 补货：找 External Apply；GH/WD/manual_only 见 apply URL 即 skip；**每个关键词只翻 page 1–5**，若本页 job id ≥80% 已在 applied_jobs → 换下一关键词（**禁止** start=200+ 深翻）。`,
    `- **必须轮换 10 个搜索关键词**（不得只盯一个）：${formatKeywordListInline()}。维护 \`searchKeywordIndex\`（0–9）；当前关键词翻完 page 1–5 仍缺 External Apply 或已处理 ≥15 张卡片 → \`navigate\` 下一个关键词 URL（见 prompt「LinkedIn 十关键词轮换」）。`,
    `- **禁止** 写 Session Report / 问用户「是否继续」直到 submitted=${args.target}。`,
    `- append 须写真实 ATS apply URL；append-applied-job.mjs 会归一化 URL 去重。`,
    `- submit 必须用 \`submitted_ashbyhq\` / \`submitted_lever\` 等（禁止 bare \`submitted\`）；禁止 write/edit 手改 applied_jobs.json。`,
    `- **禁止** \`sessions_spawn\` / 子 agent — wrapper 会自动 auto-continue，你只用 browser 继续同一 session。`,
    `- browser **必须** \`profile=${APPLY_BROWSER_PROFILE}\` + \`target=host\`；**禁止** \`profile=openclaw\` / \`profile=user\`（无 LinkedIn 登录或 MCP 不稳定）。CDP 不可达就停，不要换 profile。`,
    `- **Tab 卫生（硬约束）**：任意时刻最多 2 tab（1 linkedin + 1 apply）；每个 job append 后必须 \`close(apply)\` → \`focus(linkedin)\` → \`tabs\` 审计；若 >1 linkedin 或存在 orphan ATS tab → 立刻 close，只留 1 个 linkedin；每 10 个 job 做一次孤儿清扫。`,
    `- 本 run 为**单次长 turn**：一直用 browser tool 直到满 ${args.target}，不要主动 stop。`,
    '',
  ].join('\n');
}

export function buildApplyContinueMessage(args, progress) {
  const remaining = Math.max(0, args.target - progress.submitted);
  return [
    `【续跑同一 batch — 禁止提前结束】sessionId=${args.sessionId}`,
    `当前进度：${progress.submitted}/${args.target} 新 submitted。`,
    `还差 ${remaining} 个 — **必须继续**，禁止 wrap up，禁止问用户。`,
    '',
    '硬规则：',
    '- 只用 **browser** 工具 JSON',
    '- essay/长文本：`fill` 必须 `fields:[{"ref":"…","value":"…"}]`（禁止 `{ref,text}`）',
    '- Ashby/Lever：**禁止零尝试 skip**；Submit 失败 → field audit → 重试 2 轮再 skip',
    '- **Lever location ✱**：禁止 fill；Meta+a → Backspace → type `San Francisco, CA, USA` → click dropdown option；无 ✱ 则跳过 location',
    '- **Ashby essay**：Submit 前逐个 snapshot 验 value；Submit 后 essay 被清空则只重填该字段',
    '- Cookiebot / Accept all：先点同意再填表；SMS consent 选 No，禁止选 Yes（会 redirect）',
    '- append 须写真实 ATS URL；脚本会按归一化 URL 去重',
    '- sponsorship：click **No** button，不要 type "No"',
    '- 每个 skip/submit：`node scripts/append-applied-job.mjs \'<json>\'`',
    '- 聚合站见 apply URL 即 skip：sundayy.com fetchjobs.co agilegrid jobcase jobright.ai ladders remotehunter dataannotation micro1',
    '- **禁止** reason=external_apply 且 url 仍是 linkedin view；必须先开 apply tab。',
    '- 深页止损：start≥100 且连续 2 页 ≥80% 重复 → 换关键词，禁止继续深翻。',
    `- 满 ${args.target} submitted 才写最终 report。`,
    '- 禁止 Session Report / 「是否需要继续」/ 「ATS 极少」等理由提前 stop。',
    `- 轮换 10 个 LinkedIn 关键词（${formatKeywordListInline()}）；当前词 **只翻 page 1–5** → navigate 下一词；**禁止** start=200+ 深翻同一词。`,
    '- 填错字段必须先清空再填（fill value="" → snapshot 空 → 再填）；**Lever location ✱ 例外：只用 type+dropdown，禁止 fill**。',
    '- Cookie 横幅先 Accept；SMS/marketing consent 选 No。',
    `- **禁止** sessions_spawn / write / edit applied_jobs.json；禁止 profile=openclaw / profile=user；禁止 exec openclaw browser CLI；browser 必须 profile=${APPLY_BROWSER_PROFILE}。`,
    '- Greenhouse/Workday URL → 只许 skipped_platform，**禁止** submitted（脚本会自动纠正）。',
    '- **Tab 卫生（硬约束）**：每个 job append 后 \`close(apply)\` → \`focus(linkedin)\` → **`tabs` 审计**；只留 1 个 linkedin tab，close 全部 orphan ATS/多余 linkedin tab；审计合格才开下一个 apply。任意时刻 ≤2 tab（linkedin+apply）。每 10 job 孤儿清扫一次。',
    '- 续跑开头：`tabs` → 若有 orphan 先 close → `focus(linkedin)` → snapshot → 下一个 job；不要 exec 调试。',
    '',
  ].join('\n');
}

/**
 * Run apply agent loop until submitted >= target or limits hit.
 */
export async function runApplyBatch(args, log = console.error) {
  const appliedAtStart = loadAppliedJobs();
  const startedAt = new Date();
  const startedMs = startedAt.getTime();
  const rawPrompt = args.message ?? loadPromptFile(args.promptFile);
  const basePrompt = args.message ? rawPrompt : injectRunTarget(rawPrompt, args.target);
  const preambleArgs = {
    ...args,
    fromQueue: args.fromQueue ?? (args.useQueue ? loadExternalQueue(args.queueLimit ?? 40) : []),
  };
  let message = args.message ?? `${buildApplyBatchPreamble(preambleArgs)}${basePrompt}`;
  let combinedOutput = '';
  let lastResult = { status: 1 };
  let continuations = 0;

  log(`[apply] sessionId=${args.sessionId} target=${args.target} applied_before=${appliedAtStart.length}`);
  log(`[apply] mode=${args.local ? 'embedded (--local)' : `gateway (timeout=${args.agentTimeoutSeconds ?? DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS})`}`);
  log(`[apply] turn limits: maxTurn=${(args.maxTurnMs ?? DEFAULT_MAX_TURN_MS) > 0 ? `${Math.round((args.maxTurnMs ?? DEFAULT_MAX_TURN_MS) / 60_000)}m` : 'none'} turnIdle=${Math.round((args.turnIdleMs ?? DEFAULT_TURN_IDLE_MS) / 1000)}s`);
  log(`[apply] auto-continue: ${args.autoContinue ? `on (cap=${formatContinuationsCap(args.maxContinuations)})` : 'off'}`);
  log(`[apply] live output + heartbeat every ${Math.round((args.heartbeatMs ?? 20_000) / 1000)}s (Ctrl+C stops pipeline)`);

  let earlyStop = false;
  let embeddedFallback = false;
  const heartbeatMs = args.heartbeatMs ?? 20_000;

  let attempt = 0;
  while (true) {
    if (attempt > 0) {
      const progress = summarizeJobs(diffAppliedJobs(appliedAtStart, loadAppliedJobs()));
      log(`[apply] auto-continue #${attempt}: ${progress.submitted}/${args.target} submitted`);
      message = buildApplyContinueMessage(args, progress);
    }

    const stopMonitor = startSessionProgressMonitor({
      sessionId: args.sessionId,
      phase: 'apply',
      log,
      intervalMs: heartbeatMs,
      getMetrics: () => {
        const p = summarizeJobs(diffAppliedJobs(appliedAtStart, loadAppliedJobs()));
        return `submitted=${p.submitted}/${args.target} skipped=${p.skipped}`;
      },
    });

    try {
      lastResult = await runOpenClawAgent({
        sessionId: args.sessionId,
        message,
        local: args.local ?? false,
        verbose: args.verbose !== false,
        log,
        turnIdleMs: args.turnIdleMs ?? DEFAULT_TURN_IDLE_MS,
        maxTurnMs: args.maxTurnMs ?? DEFAULT_MAX_TURN_MS,
        agentTimeoutSeconds: args.agentTimeoutSeconds ?? DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS,
      });
    } finally {
      stopMonitor();
    }

    const stdout = lastResult.stdout ?? '';
    const stderr = lastResult.stderr ?? '';
    const turnOutput = `${stdout}\n${stderr}`;
    combinedOutput += `${turnOutput}\n`;

    const turnEmbeddedFallback = lastResult.embeddedFallback
      || detectEmbeddedFallback(turnOutput);
    if (turnEmbeddedFallback) {
      embeddedFallback = true;
      const progress = summarizeJobs(diffAppliedJobs(appliedAtStart, loadAppliedJobs()));
      if (lastResult.killedForIdle && progress.submitted < args.target && args.autoContinue) {
        log('[apply] warn: embedded fallback after idle stop — continuing auto-continue (no subagent)');
      } else {
        log(`[apply] EMBEDDED FALLBACK — stop batch (Gateway timeout or embedded path; restart ${APPLY_BROWSER_PROFILE} browser, retry run)`);
        break;
      }
    }

    if (lastResult.killedForIdle) {
      log('[apply] agent CLI closed after idle (turn likely done) — checking auto-continue');
    }

    const progress = summarizeJobs(diffAppliedJobs(appliedAtStart, loadAppliedJobs()));
    if (progress.submitted >= args.target) break;

    earlyStop = detectEarlyApplyStop(combinedOutput, progress.submitted, args.target);
    if (earlyStop) {
      log(`[apply] agent stopped early at ${progress.submitted}/${args.target} — auto-continue will retry`);
    }

    if (detectIncomplete(combinedOutput)) {
      log('[apply] incomplete turn — stop apply auto-continue');
      break;
    }
    if (!args.autoContinue || args.message) break;
    if (!isUnlimitedContinuations(args.maxContinuations) && attempt >= args.maxContinuations) {
      log(`[apply] max continuations (${args.maxContinuations}) reached`);
      break;
    }
    continuations += 1;
    attempt += 1;
  }

  const appliedAfter = loadAppliedJobs();
  const newEntries = diffAppliedJobs(appliedAtStart, appliedAfter);
  const jobs = summarizeJobs(newEntries);
  const durationMs = Date.now() - startedMs;
  const incompleteTurn = detectIncomplete(combinedOutput);

  const record = {
    phase: 'apply',
    sessionId: args.sessionId,
    targetPerRun: args.target,
    goalMet: jobs.submitted >= args.target,
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs,
    durationHuman: formatDuration(durationMs),
    exitCode: lastResult.status ?? 1,
    incompleteTurn,
    continuations,
    earlyStop,
    embeddedFallback,
    autoContinue: args.autoContinue,
    promptFile: args.message ? null : args.promptFile.replace(`${WORKSPACE}/`, ''),
    jobs,
    submittedUrls: newEntries.filter((e) => e.status?.startsWith('submitted')).map((e) => e.url).filter(Boolean),
  };

  appendSessionRun(record);
  return record;
}

export function printApplySummary(record, log = console.error) {
  log('');
  log('[apply] ── summary ──');
  log(`  sessionId:     ${record.sessionId}`);
  log(`  duration:      ${record.durationHuman}`);
  log(`  continuations: ${record.continuations}`);
  log(`  submitted:     ${record.jobs.submitted}/${record.targetPerRun} (skipped ${record.jobs.skipped})`);
  log(`  goal met:      ${record.goalMet ? 'yes' : 'no'}`);
  log(`  embedded fb:   ${record.embeddedFallback ? 'yes (Gateway fell back to embedded)' : 'no'}`);
  log(`  incomplete:    ${record.incompleteTurn ? 'yes' : 'no'}`);
  log(`  log:           ${SESSION_RUNS_PATH}`);
  log(`  applied_jobs:  ${APPLIED_JOBS_PATH}`);
}

export function printPipelineSummary(pipeline, log = console.error) {
  log('');
  log('[pipeline] ══ FINAL ══');
  log(`  pipelineId:    ${pipeline.pipelineId}`);
  log(`  total time:    ${pipeline.durationHuman}`);
  log(`  apply:         ${pipeline.apply.jobs.submitted}/${pipeline.apply.targetPerRun} submitted — goal ${pipeline.apply.goalMet ? 'MET' : 'NOT MET'}`);
}
