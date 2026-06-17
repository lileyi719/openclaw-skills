import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  APPLIED_JOBS_PATH,
  SESSION_RUNS_PATH,
  appendSessionRun,
  createRunProgressBaseline,
  diffAppliedJobsSinceBaseline,
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
  DEFAULT_ROTATE_MAX_SUBMITS,
  resolveRotateMaxBrowser,
} from './openclaw-agent-runner.mjs';
import { JOB_APPS_DIR } from './pipeline-log.mjs';
import { formatKeywordListInline } from './linkedin-job-search-keywords.mjs';
import { formatAllowlistSummary } from './ats-url-filter.mjs';
import { prepareQueues } from './pipeline-queue.mjs';
import { loadJobEnv } from './load-job-env.mjs';
import { ensureLinkedInLoggedIn } from './linkedin-auto-login.mjs';

/** External Apply only — zero tolerance for LinkedIn Easy Apply (save time). */
const EASY_APPLY_HARD_RULES = [
  '- **Easy Apply 零容忍（最高优先级）**：本 run **只做 External Apply**；任何 LinkedIn Easy Apply UI = **立刻放弃**，**禁止**填表/Submit/append submitted。',
  '- **LinkedIn 搜索 URL**：**禁止** `f_AL=true` / `f_EA=true`；若 URL 或页面 filter chip 含 **Easy Apply 筛选已开启** → `navigate` 到**无 f_AL** 的同关键词 URL（见 prompt 十关键词表）或 click 关掉 Easy Apply filter chip。',
  '- **列表选 job**：卡片 text/badge 含 **Easy Apply** → **仅 scroll**，**禁止 click 卡片**、**禁止 click Apply 若右侧会是 Easy Apply**；只 click **Apply on company website** / 会开 **新 tab 外链 ATS** 的 **Apply**。',
  '- **右侧 panel**：出现 **Easy Apply to …** / Easy Apply 弹窗 → **禁止**填任何字段；`press Escape` → scroll 下一卡片（误点时才 append `skipped_linkedin_easyapply`，日常 scroll **不必** append）。',
  '- **禁止**：`submitted_linkedineasyapply` / `submitted_linkedin` / LinkedIn 站内 Submit；**禁止** read `easy-apply/SKILL.md`；**禁止**为 Easy Apply 点 LinkedIn「Did you apply? Yes」。',
  '- 历史 `submitted_linkedineasyapply` **不算**进度；**禁止**模仿。',
].join('\n');

const APPEND_INTEGRITY_RULES = [
  '- **记录唯一入口**：skip/submit **只能** `node scripts/append-applied-job.mjs \'<json>\'`。',
  '- **禁止 bypass**：禁止 python3 / sed / write / edit 直接改 `applied_jobs.json`（append 脚本会校验并拒绝 Easy Apply / linkedin view submitted）。',
  '- **进度计数**：pipeline 只计 **外链** submitted_*（Ashby/Lever/Workday 等）；Easy Apply **不计入** target。',
].join('\n');

/** Universal ATS Create Account / Sign In — all platforms (Workday, UltiPro, Rippling, GH, …). */
const ATS_ACCOUNT_CREATION_RULES = [
  '- **Create Account / Register / Sign up（任意 ATS）禁止 skip**：见 **Create Account / Sign In / Register** → **必须**创建或登录，**禁止** `skipped_auth_wall` / `skipped_platform` 零尝试跳过。',
  '- **全站统一凭据（写死）**：Email `unojose234@gmail.com`；Password **`Waibao1234567Go!`**（含 `!`）。适用于 Workday / UltiPro / Rippling / Greenhouse / ICIMS / 自定义 portal 等 **所有** Create Account、Verify Password、Sign In。',
  '- **禁止** grep `.env` 或 `LINKEDIN_PASSWORD` 填 ATS 注册/登录（LinkedIn 密码无 `!`，会导致静默失败）。',
  '- Create Account 成功 → redirect **Sign In** → **同一 Email + Password**（不是 LinkedIn 密码）。',
  '- 已有账号 / “email already exists” → pivot **Sign In**，仍用同一密码。',
  '- **仅当**页面要求 **验证码**（SMS OTP / email verification code / 人工输入 one-time code）且无法自动完成 → 才 `skipped_verification` 或 `skipped_captcha`；**不要**因「要建账号」就 skip。',
  '- **禁止** skip：UltiPro/UKG 注册、Rippling 注册、Workday Create Account 等 — 一律用上面凭据 + fill（Workday 用人类打字协议）。',
  '- Create Account + Sign In **各 2 轮**完整协议失败 → `skipped_incomplete`（reason 写明平台，如 `ultipro create account failed`）。',
].join('\n');

/** Resume CDP upload — never click file buttons (macOS Finder trap). */
const URL_DEDUPE_RULES = [
  '- **开 tab 后、填表前必查 dedupe**：拿到 apply tab **真实 URL** 后立刻 exec：',
  '  `node scripts/check-applied-url.mjs \'<apply_url>\' --retry-incomplete`',
  '- 输出 **ALREADY_SUBMITTED** → **禁止填表**；`close(apply)` → `focus(linkedin)` → scroll 下一 job（**不要**再 append duplicate）。',
  '- 输出 **ALREADY_SKIPPED**（aggregator/platform）→ close apply tab，scroll 下一 job。',
  '- 输出 **RETRY_INCOMPLETE** → 允许重试填表（尤其 ClearCompany / Hiresome resume 失败）。',
  '- 输出 **NEW** → 继续填表。',
  '- LinkedIn 列表卡片：公司名已在 applied_jobs 且 status=submitted_* → **禁止 click Apply**（scroll 跳过，省 8–10 min）。',
].join('\n');

const CLEARCOMPANY_HARD_RULES = [
  '- **ClearCompany**（`clearcompany.com/careers` / `*.clearcompany.com/.../apply`）→ read `clearcompany-apply/SKILL.md` + `MASTER_apply.md`。',
  '- jQuery File Upload：**禁止 click** 「+ Upload」/「Choose File」；用 evaluate 列 `input[type=file]` → CDP `upload` + id/index；失败走 **unhide CSS** 协议（MASTER §2 Round B），最多 3 轮。',
  '- Continue 卡 Page 1 → ref click Continue 2 轮 + 验 validation；仍失败才 skip。',
  '- 成功 append `submitted_clearcompany` + 真实 apply URL。',
].join('\n');

const RESUME_UPLOAD_HARD_RULES = [
  '- **简历 upload 禁止 click**：Attach / Upload / Choose file / Browse / **Resume Required*** / 任何上传按钮 — **会弹 macOS Finder**，OpenClaw 无法自动关，会卡住。',
  '- **OpenClaw upload 参数**：HTML `#id`/CSS 选择器 → **`element`**（如 `"#resume"`、`"#ce_resume"`、`"input[type=file]"`）；**仅** snapshot ref（`e120` 等）→ **`inputRef`**。',
  '- **禁止** 把 HTML id 填进 `inputRef`（如 ~~`inputRef:"resume"`~~ → 变成 `aria-ref=resume`，**挂起 ~20s timeout**；错误文案可能写 restart gateway，**Gateway 未坏**）。',
  '- **唯一正确**：`{"action":"upload","profile":"linkedin-jobs","paths":["/tmp/openclaw/uploads/resume.pdf"],"element":"#<file_input_id>"}` — **不要**先 click 上传按钮。',
  '- evaluate 列 `input[type=file]` 取 id → `element:"#"+id`；无 id 时用 `element:"input[type=file]"`；仍 **禁止 click** 按钮试探。',
  '- upload 后 snapshot 或只读 evaluate 验 `files[0].name` 含 `resume.pdf`；按钮文案仍写 Required **不是**失败依据。',
  '- **upload 失败 / UI 未变 → 禁止 click 上传控件**；只换 `element` 选择器重试 upload（最多 3 次）；仍失败可走 unhide CSS + change event（见 clearcompany/greenhouse MASTER §5）。',
  '- **upload timeout 禁止 `openclaw gateway restart`** — 只换 locator 或 Enter manually / Paste resume。',
  '- **Finder 已弹出**：`press Escape` → snapshot → 再 `upload` + `element`；**禁止**第二次 click Attach/Resume 按钮。',
  '- **禁止** evaluate 注入 File/DataTransfer 上传简历；**禁止** click 隐藏 file input（也会弹 Finder）。',
  '- 有 Paste resume / Enter manually → 可 `type` 粘贴；简历非必填 → 跳过，不点 Attach。',
].join('\n');

const WORKDAY_RESUME_RULES = [
  '- **续跑 / overflow 后第一步**：`tabs` → 若有 **myworkdayjobs.com** apply tab 仍 open → **focus(apply)** → snapshot（**优先于** LinkedIn 搜下一条）。',
  '- 若 snapshot 含 **Sign In** / URL 含 `/login` → Email `unojose234@gmail.com` + Password **`Waibao1234567Go!`**（与 Create Account 相同；**禁止** `LINKEDIN_PASSWORD`）。',
  '- 若 snapshot 含 **Self Identify** / `spinbutton "Year"`+`Month`+`Day` / `Date字段为必填` → 这是 **Trap 4B**（分别 type `2026`→`06`→`08`，各 click→Meta+a→Backspace→type slowly→Tab）。',
  '- **顺序**：Name（若空）→ disability checkbox（snapshot 验 checked）→ **Date 三字段** → Save and Continue；**禁止** Date 未填就 skip 或换 job。',
  '- Self Identify Date：**必须完整 2 轮** Trap 4B 物理协议；仍失败才 `skipped_incomplete`（reason 含 `workday spinbutton date`）。**禁止** evaluate/reload/只点 Year 就放弃。',
].join('\n');

const OPEN_ALLOWLIST_RULES = [
  '- **开放 ATS 探索 run**：除 Workday 外 **所有** External Apply URL 必须 **开 apply tab 并尝试填表**（Greenhouse、ICIMS、Taleo、Rippling、SmartRecruiters、BambooHR、自定义 corp 站点、unknown URL 等）。',
  '- **禁止** 因 not_primary_tier / manual_only / greenhouse hard block / 「非 Ashby」零尝试 skip。',
  '- **Workday**（myworkdayjobs.com / .wdN.myworkday）：**本 run 跳过** — 见 URL 后 append `skipped_platform` reason `workday_deferred`（**不要**开 tab）。',
  '- 聚合站（sundayy/fetchjobs/remotehunter 等）：可先开 tab 确认 URL → `skipped_aggregator`。',
  '- 尝试过但失败：用 `skipped_incomplete` / `skipped_captcha` / `skipped_timeout`；成功用 `submitted_<platform>` 或 `submitted`（脚本归一化）。',
  '- **Breadth over depth**：多平台各试至少 1 次，再回头重试 captcha/incomplete。',
].join('\n');

const GREENHOUSE_HARD_RULES = [
  '- **Greenhouse 必须填表**：URL 含 `greenhouse.io` / `gh_jid=` / `gh_src=` → read `skills/job-applications/greenhouse-apply/SKILL.md` + `MASTER_apply.md`（**不是** npm 包内路径）；append `submitted_greenhouse`。',
  '- **Create Account / Sign In**：统一凭据 `unojose234@gmail.com` / **`Waibao1234567Go!`**（fill）；2 轮失败才 skip；仅 MyGreenhouse OAuth 无表单 → `skipped_auth_wall`。',
  '- **禁止** 见 Greenhouse 就 `skipped_platform`；**禁止** click **Quick Apply with MyGreenhouse**；有 MyGreenhouse 按钮 **不是** skip 理由。',
  '- GH Resume upload：evaluate 取 file input **id** → `upload` + `paths` + **`element:"#<id>"`**（标准 board `#resume`；Waymo 自托管 `#question_*`）。**禁止** `inputRef` 填 HTML id；**禁止 click Attach**。',
  '- GH upload 失败：unhide CSS Round B（MASTER §5）→ Enter manually；3 轮仍空 → `skipped_incomplete` reason `greenhouse resume upload failed`。**upload timeout 禁止 gateway restart**。',
  '- GH 填表：fill `fields`；Phone country React Select（click → United States +1）；**2 轮**完整填表+Submit 失败 → `skipped_incomplete`（禁止 reason=`Greenhouse` 的 skipped_platform）。',
].join('\n');

/** Injected into apply batch preamble + auto-continue (keep in sync with workday-apply/MASTER_apply.md §2.5). */
const WORKDAY_HARD_RULES = [
  '- **Workday auth/forms 禁止 `fill`**：每字段 click ref → Meta+a → Backspace → **type ref slowly:true** → Tab → snapshot 验 value=（见 MASTER_apply PHASE 2）。',
  '- **Workday 禁止 evaluate 写值/submit**（nativeInputValueSetter、.click()、requestSubmit、PointerEvent 链）。',
  '- **Workday 凭据写死**：Email `unojose234@gmail.com`；Password **`Waibao1234567Go!`**（Create Account / Verify / **Sign In 同一密码**）。Create Account 成功 redirect 到 Sign In 仍用此密码；**禁止** grep `LINKEDIN_PASSWORD` 或 `.env` 填 Workday。',
  '- Create Account / Sign In **各 2 轮**完整物理协议失败后才 `skipped_incomplete`；禁止 fill 一轮就写 “React SPA blocks submission”。',
  '- Workday **spinbutton 日期**：Experience/Education 仅 Month+Year → 整串 `122022` 打进 **Month** ref；Self Identify 有 **3 个独立** Year/Month/Day → **分别**填 `2026`/`06`/`08`（各 click→清空→type slowly→Tab），**禁止** MMDDYYYY 打进 Month；calendar 错乱 Escape 重填；禁止 reload；见 MASTER_apply Trap 4 / §11。',
  '- Self Identify：**Name → disability(验checked) → Date Trap 4B → Save**；Date 未完成 **2 轮** Trap 4B 禁止 skipped_incomplete。',
].join('\n');

loadJobEnv();

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

/** Auto-login LinkedIn via .env when login page / session expired. */
export async function verifyLinkedInSession(log = console.error) {
  log('[pipeline] preflight: LinkedIn session / auto-login…');
  const result = await ensureLinkedInLoggedIn({ log });
  if (!result.ok) {
    throw new Error(
      `LinkedIn auto-login failed (${result.reason})`
      + `${result.url ? ` — ${result.url}` : ''}`
      + `${result.error ? ` — ${result.error}` : ''}`
      + '\n  Check skills/job-applications/.env (LINKEDIN_EMAIL / LINKEDIN_PASSWORD)'
      + '\n  Or run: node scripts/ensure-linkedin-login.mjs',
    );
  }
  log(`[pipeline] preflight: LinkedIn OK (${result.reason})`);
  return true;
}

export function detectIncomplete(outputText) {
  return /incomplete turn detected|Agent couldn't generate a response/i.test(outputText);
}

export function detectContextOverflow(outputText) {
  return /context overflow|prompt too large for the model/i.test(outputText);
}

/** Fresh Gateway session for each auto-continue (avoids context bloat). */
export function continuationSessionId(baseSessionId, attempt) {
  if (attempt <= 0) return baseSessionId;
  return `${baseSessionId}-c${attempt}`;
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
  const openAllowlist = opts.openAllowlist === true;
  log(openAllowlist
    ? '[pipeline] preflight scan (open allowlist → external_queue)…'
    : '[pipeline] preflight scan (Tier1 ATS → external_queue)…');
  const cfgArgs = [
    resolve(WORKSPACE, 'scripts/write-scan-config.mjs'),
    '--target=external',
    openAllowlist ? '--no-ats-only' : '--ats-only',
    `--keywords=${keywords}`,
    `--limit=${limit}`,
    `--pages=${pages}`,
  ];
  const cfg = spawnSync('node', cfgArgs, { cwd: WORKSPACE, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (cfg.stdout) process.stderr.write(cfg.stdout);
  if (cfg.stderr) process.stderr.write(cfg.stderr);
  const r = spawnSync(
    'node',
    [resolve(WORKSPACE, 'scripts/scan_linkedin_jobs.mjs')],
    { cwd: WORKSPACE, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  );
  if (r.stdout) process.stderr.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const prep = prepareQueues(null, {
    queueTier: openAllowlist ? 'all' : 'primary',
    openAllowlist,
    skipWorkday: opts.skipWorkday === true,
  });
  log(`[pipeline] queue after scan: external=${prep.externalQueue.length} skipped=${prep.skippedQueue.length}`);
  return prep;
}

export function buildApplyBatchPreamble(args) {
  const atsRules = formatAllowlistSummary({
    openAllowlist: args.openAllowlist === true,
    skipWorkday: args.skipWorkday === true,
  });
  const queueBlock = args.fromQueue?.length
    ? [
      `- **队列模式**：先处理下列 ${args.fromQueue.length} 条 \`external_queue\`（browser open 其 apply_url），完成后再 LinkedIn 搜索补货。`,
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

  const tierRule = args.openAllowlist
    ? OPEN_ALLOWLIST_RULES
    : '- Tier1 PRIMARY（Ashby / Lever / **Greenhouse**）+ Tier2（Rippling / UltiPro / Hiresome / …）**默认全部尝试**；禁止 not_primary_tier skip。';

  const linkedInReplenish = args.openAllowlist
    ? '- LinkedIn 补货：找 **External Apply**（含 Greenhouse/ICIMS/自定义站点）；**Workday → skipped_platform workday_deferred**；聚合站 → skipped_aggregator；**每个关键词只翻 page 1–5**；本页 job id ≥80% 已处理 → 换下一关键词。'
    : '- LinkedIn 补货：找 External Apply；**Greenhouse / Rippling / UltiPro / Hiresome 必须尝试填表**；Workday 按 workday-apply；**每个关键词只翻 page 1–5**，若本页 job id ≥80% 已在 applied_jobs → 换下一关键词（**禁止** start=200+ 深翻）。';

  const workdayRules = args.skipWorkday ? '' : WORKDAY_HARD_RULES;
  const ghRule = GREENHOUSE_HARD_RULES;

  return [
    `【本 run 独立批次】sessionId=${args.sessionId}；target=${args.target} 个**新** submitted（External Apply）。`,
    args.openAllowlist ? '【**开放 ATS 探索模式** — 除 Workday 外全部尝试】' : '',
    `- 进度只数本 run 新写入 applied_jobs.json 的 submitted_* 条数，从 0 开始，满 ${args.target} 才结束。`,
    `- applied_jobs.json 历史 submitted 仅 dedupe skip，不计入本 run 进度。`,
    `- **必须用 browser 工具 JSON**；禁止 exec openclaw browser CLI；禁止 pkill/gateway restart/config set。`,
    `- **ATS 分级（必须先开 apply tab 再判定）**：`,
    atsRules,
    tierRule,
    `- **禁止** 在 LinkedIn 列表页因「company website / external_apply / senior」直接 append skip；必须 click Apply → snapshot(apply) → 用 apply tab 的 **真实 URL** append。`,
    `- append-applied-job.mjs **拒绝** linkedin.com/jobs/view 上的 skipped_platform/incomplete（聚合站 skipped_aggregator 除外）。`,
    queueBlock,
    linkedInReplenish,
    URL_DEDUPE_RULES,
    ATS_ACCOUNT_CREATION_RULES,
    RESUME_UPLOAD_HARD_RULES,
    CLEARCOMPANY_HARD_RULES,
    EASY_APPLY_HARD_RULES,
    APPEND_INTEGRITY_RULES,
    `- **必须轮换 10 个搜索关键词**（不得只盯一个）：${formatKeywordListInline()}。维护 \`searchKeywordIndex\`（0–9）；当前关键词翻完 page 1–5 仍缺 External Apply 或已处理 ≥15 张卡片 → \`navigate\` 下一个关键词 URL（见 prompt「LinkedIn 十关键词轮换」）。`,
    `- **禁止** 写 Session Report / 问用户「是否继续」直到 submitted=${args.target}。`,
    `- append 须写真实 ATS apply URL；append-applied-job.mjs 会归一化 URL 去重。`,
    `- submit 必须用 \`submitted_ashbyhq\` / \`submitted_lever\` / \`submitted_<platform>\` 等（禁止 bare \`submitted\` 除非 open-allowlist）；${APPEND_INTEGRITY_RULES.split('\n').slice(1).join(' ')}`,
    `- **禁止** \`sessions_spawn\` / 子 agent — wrapper 会自动 auto-continue（**每轮新 sessionId**，browser tab 不变），你只用 browser 继续同一 batch。`,
    `- browser **必须** \`profile=${APPLY_BROWSER_PROFILE}\` + \`target=host\`；**禁止** \`profile=openclaw\` / \`profile=user\`（无 LinkedIn 登录或 MCP 不稳定）。CDP 不可达就停，不要换 profile。`,
    `- **LinkedIn 登录**：pipeline 已用 \`.env\` 自动登录；若 snapshot 仍是 login/checkpoint → \`exec node scripts/ensure-linkedin-login.mjs\` 后 continue；**禁止** exec 搜密码/问用户要密码。`,
    workdayRules,
    ghRule,
    `- **Tab 卫生（硬约束）**：任意时刻最多 2 tab（1 linkedin + 1 apply）；每个 job append 后必须 \`close(apply)\` → \`focus(linkedin)\` → \`tabs\` 审计；若 >1 linkedin 或存在 orphan ATS tab → 立刻 close，只留 1 个 linkedin；每 10 个 job 做一次孤儿清扫。`,
    `- 本 run 为**单次长 turn**：一直用 browser tool 直到满 ${args.target}，不要主动 stop。`,
    '',
  ].filter(Boolean).join('\n');
}

export function buildApplyContinueMessage(args, progress, options = {}) {
  const remaining = Math.max(0, args.target - progress.submitted);
  const afterOverflow = options.contextOverflow === true;
  const afterProactiveRotate = options.proactiveRotate === true;
  const resumeBlock = (options.attempt > 0 || afterOverflow || afterProactiveRotate)
    ? [
      '',
      afterOverflow
        ? '⚠️ **上一 turn context overflow — browser tab 仍在。勿开新 job，先收尾半成品。**'
        : afterProactiveRotate
          ? '⚠️ **主动 rotate（控 context）— 先 tabs 审计；若有 open apply tab 优先收尾，再开新 job。**'
          : '⚠️ **续跑新 session — 先 tabs 审计，再决定下一步。**',
      WORKDAY_RESUME_RULES,
      '',
    ].join('\n')
    : '';

  const platformHint = args.openAllowlist
    ? '- 开放探索：除 Workday skip 外尽量填表；细节 read 对应 platform SKILL.md'
    : '- Greenhouse / Workday / Ashby / Lever：填表前 read `skills/job-applications/<platform>-apply/SKILL.md`';

  return [
    `【续跑同一 batch】sessionId=${args.sessionId}（browser tab 不变，进度接续）`,
    `进度：${progress.submitted}/${args.target} 外链 submitted；还差 ${remaining} — **必须继续**，禁止 wrap up / 问用户。`,
    resumeBlock,
    '续跑硬约束（完整规则见首 turn preamble + compact prompt，勿重复 read 全量 prompt）：',
    `- 只用 **browser** JSON；profile=${APPLY_BROWSER_PROFILE}；target=host`,
    '- 禁止 exec openclaw browser CLI / gateway restart / pkill / sessions_spawn',
    '- **Easy Apply 零容忍**：列表见 Easy Apply → 只 scroll，禁止 click 卡片/弹窗/Submit；URL 禁止 f_AL=true',
    '- skip/submit 仅 `node scripts/append-applied-job.mjs \'<json>\'`',
    '- 开 apply tab 后 exec `node scripts/check-applied-url.mjs \'<url>\' --retry-incomplete`',
    '- resume upload：`element:"#id"`（禁止 inputRef 填 HTML id）；禁止 click Attach',
    platformHint,
    '- Tab 卫生：≤2 tab；append 后 close(apply)→focus(linkedin)；**禁止 close linkedin tab**',
    '- LinkedIn 登录墙：`exec node scripts/ensure-linkedin-login.mjs`',
    `- 满 ${args.target} submitted 才写最终 report。`,
    '',
  ].join('\n');
}

/**
 * Run apply agent loop until submitted >= target or limits hit.
 */
export async function runApplyBatch(args, log = console.error) {
  process.env.SCAN_TARGET = 'external';
  process.env.EXTERNAL_APPLY_ONLY = '1';
  if (args.openAllowlist) process.env.OPEN_ALLOWLIST = '1';
  if (args.skipWorkday) process.env.SKIP_WORKDAY = '1';

  const appliedAtStart = loadAppliedJobs();
  const startedAt = new Date();
  const startedMs = startedAt.getTime();
  const runBaseline = createRunProgressBaseline(startedAt);
  const diffRunJobs = () => diffAppliedJobsSinceBaseline(runBaseline, loadAppliedJobs());
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
  const baseSessionId = args.sessionId;
  let activeSessionId = baseSessionId;

  log(`[apply] sessionId=${baseSessionId} target=${args.target} applied_before=${appliedAtStart.length} run_since=${runBaseline.startedAtIso}`);
  log('[apply] Easy Apply: BANNED (external-only; no f_AL filter; scroll-only on EA cards)');
  log(`[apply] mode=${args.local ? 'embedded (--local)' : `gateway (timeout=${args.agentTimeoutSeconds ?? DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS})`}`);
  log(`[apply] turn limits: maxTurn=${(args.maxTurnMs ?? DEFAULT_MAX_TURN_MS) > 0 ? `${Math.round((args.maxTurnMs ?? DEFAULT_MAX_TURN_MS) / 60_000)}m` : 'none'} turnIdle=${Math.round((args.turnIdleMs ?? DEFAULT_TURN_IDLE_MS) / 1000)}s`);
  log(`[apply] auto-continue: ${args.autoContinue ? `on (cap=${formatContinuationsCap(args.maxContinuations)})` : 'off'}`);
  if (args.autoContinue && !args.message) {
    const rotateSubmits = args.rotateMaxSubmits ?? DEFAULT_ROTATE_MAX_SUBMITS;
    const rotateBrowser = resolveRotateMaxBrowser(args.rotateMaxBrowser, rotateSubmits);
    log(`[apply] proactive rotate: session submits>=${rotateSubmits} OR browser>=${rotateBrowser} (before context overflow)`);
  }
  log(`[apply] live output + heartbeat every ${Math.round((args.heartbeatMs ?? 20_000) / 1000)}s (Ctrl+C stops pipeline)`);

  let earlyStop = false;
  let embeddedFallback = false;
  const heartbeatMs = args.heartbeatMs ?? 20_000;

  let attempt = 0;
  let pendingOverflow = false;
  let pendingProactiveRotate = false;
  while (true) {
    await verifyLinkedInSession(log);
    const submittedAtTurnStart = summarizeJobs(diffRunJobs()).submitted;

    if (attempt > 0) {
      abortGatewayAgentSession(activeSessionId, log);
      activeSessionId = continuationSessionId(baseSessionId, attempt);
      const progress = summarizeJobs(diffRunJobs());
      log(`[apply] auto-continue #${attempt}: new sessionId=${activeSessionId} (${progress.submitted}/${args.target} submitted)`);
      message = buildApplyContinueMessage(
        { ...args, sessionId: activeSessionId },
        progress,
        {
          contextOverflow: pendingOverflow,
          proactiveRotate: pendingProactiveRotate,
          attempt,
        },
      );
      pendingOverflow = false;
      pendingProactiveRotate = false;
    }

    let killAgent = null;
    const rotateSubmits = args.rotateMaxSubmits ?? DEFAULT_ROTATE_MAX_SUBMITS;
    const rotateBrowser = resolveRotateMaxBrowser(args.rotateMaxBrowser, rotateSubmits);
    const rotatePolicy = args.autoContinue && !args.message
      ? {
        maxBrowserCalls: rotateBrowser,
        maxSessionSubmits: rotateSubmits,
        getSessionSubmitted: () => {
          const p = summarizeJobs(diffRunJobs());
          return p.submitted - submittedAtTurnStart;
        },
        onThreshold: (reason) => {
          log(`[apply] proactive rotate threshold — ${reason}`);
          abortGatewayAgentSession(activeSessionId, log);
          killAgent?.(reason);
        },
      }
      : null;

    const stopMonitor = startSessionProgressMonitor({
      sessionId: activeSessionId,
      phase: 'apply',
      log,
      intervalMs: heartbeatMs,
      rotatePolicy,
      getMetrics: () => {
        const p = summarizeJobs(diffRunJobs());
        const fileLen = loadAppliedJobs().length;
        if (fileLen < runBaseline.snapshotLength) {
          return `submitted=${p.submitted}/${args.target} skipped=${p.skipped} file=${fileLen}<snap${runBaseline.snapshotLength}`;
        }
        return `submitted=${p.submitted}/${args.target} skipped=${p.skipped}`;
      },
    });

    try {
      lastResult = await runOpenClawAgent({
        sessionId: activeSessionId,
        message,
        local: args.local ?? false,
        verbose: args.verbose !== false,
        log,
        turnIdleMs: args.turnIdleMs ?? DEFAULT_TURN_IDLE_MS,
        maxTurnMs: args.maxTurnMs ?? DEFAULT_MAX_TURN_MS,
        agentTimeoutSeconds: args.agentTimeoutSeconds ?? DEFAULT_GATEWAY_AGENT_TIMEOUT_SECONDS,
        onRegisterKill: (fn) => {
          killAgent = fn;
        },
      });
    } finally {
      stopMonitor();
    }

    const stdout = lastResult.stdout ?? '';
    const stderr = lastResult.stderr ?? '';
    const turnOutput = `${stdout}\n${stderr}`;
    combinedOutput += `${turnOutput}\n`;
    const turnContextOverflow = detectContextOverflow(turnOutput);

    const turnEmbeddedFallback = lastResult.embeddedFallback
      || detectEmbeddedFallback(turnOutput);
    if (turnEmbeddedFallback) {
      embeddedFallback = true;
      const progress = summarizeJobs(diffRunJobs());
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

    const progress = summarizeJobs(diffRunJobs());
    if (progress.submitted >= args.target) break;

    earlyStop = detectEarlyApplyStop(combinedOutput, progress.submitted, args.target);
    if (earlyStop) {
      log(`[apply] agent stopped early at ${progress.submitted}/${args.target} — auto-continue will retry`);
    }

    if (detectIncomplete(combinedOutput) && !turnContextOverflow) {
      log('[apply] incomplete turn — stop apply auto-continue');
      break;
    }
    if (turnContextOverflow) {
      log('[apply] context overflow — aborting session and rotating to fresh sessionId on next continue');
      pendingOverflow = true;
    }
    if (lastResult.killedForProactiveRotate) {
      log(`[apply] proactive rotate — rotating to fresh sessionId on next continue (${lastResult.proactiveRotateReason || 'threshold'})`);
      pendingProactiveRotate = true;
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
  const newEntries = diffRunJobs();
  const jobs = summarizeJobs(newEntries);
  const durationMs = Date.now() - startedMs;
  const incompleteTurn = detectIncomplete(combinedOutput);

  const record = {
    phase: 'apply',
    sessionId: baseSessionId,
    continuationSessionIds: continuations > 0
      ? Array.from({ length: continuations }, (_, i) => continuationSessionId(baseSessionId, i + 1))
      : [],
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
