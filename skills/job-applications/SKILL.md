# Job Applications (OpenClaw)

## 分工

| 阶段 | 工具 |
|------|------|
| **搜索 / 扫描** | 脚本 `scan_linkedin_jobs.mjs` |
| **全自动（扫描→投递）** | `run_job_pipeline.mjs --phase=all`（含 `apply_jobs.mjs`，Playwright 真实浏览器） |
| **人工逐步投递（可选）** | OpenClaw `browser` + 各 apply SKILL |

## 一条命令全流程（推荐）

```bash
cd ~/.openclaw/workspace
node scripts/run-external-apply.mjs
```

人类只需：**linkedin-jobs 专用 Chrome 已登录 LinkedIn**（见 [`LINKEDIN_JOBS_BROWSER.md`](LINKEDIN_JOBS_BROWSER.md)）。脚本自动：

1. `openclaw browser --browser-profile linkedin-jobs start`
2. ATS 预扫描 Agent（队列不足时）→ `external_queue.json`
3. 投递 Agent 直到本 run **100 个新 submitted**（默认；可用 `--target=N` 调整，自动续跑）；LinkedIn 上 **轮换 10 个搜索关键词**（见 `prompts/linkedin-external-compact.md`）

**Lever 提示：** 历史 7 个 `submitted_lever` 多为 **无 location 必填** 或简单 radio/combobox；带 `Current location ✱` 的 Lever 须 **type+dropdown**，禁止 `fill` location。

日志：`skills/job-applications/pipeline_runs.json`、`session_runs.json`

### 可选参数

```bash
node scripts/run-external-apply.mjs
# 或指定数量：node scripts/run-external-apply.mjs --target=100
node scripts/run-external-apply.mjs --skip-prescan      # 跳过预扫描
node scripts/run-external-apply.mjs --force-prescan     # 强制先扫描
```

---

## 一条命令全流程（Playwright 扫描 + 脚本投递 — 旧路径）

```bash
node scripts/write-scan-config.mjs --target=easy_apply --keywords="Software Engineer" --limit=5
export PIPELINE_NON_INTERACTIVE=1 LINKEDIN_EMAIL=unojose234@gmail.com LINKEDIN_PASSWORD=${LINKEDIN_PASSWORD}
node scripts/run_job_pipeline.mjs --phase=all
```

读 `scan_config.json`：`easy_apply` | `external` | `all`。结束时只有**一条** `[PIPELINE_FINAL]`。

## 可选：OpenClaw browser 投递

需要可见、逐步拟人时，扫描后改用：

- [`easy-apply/SKILL.md`](easy-apply/SKILL.md)
- [`external-apply/SKILL.md`](external-apply/SKILL.md)
- [`workday-apply/SKILL.md`](workday-apply/SKILL.md)

Browser 投递前 **必须先 read** [`BROWSER_HUMAN.md`](BROWSER_HUMAN.md)、[`applicant-profile.json`](applicant-profile.json)（硬规则 + 填表字段）与内置 `browser-automation` skill。**禁止** `exec` 调用 `openclaw browser` CLI。

**配置：** `~/.openclaw/openclaw.json` 需 `tools.alsoAllow: ["browser"]`（`coding` profile 默认不含 browser 工具）。

**记录：** 用 `node scripts/append-applied-job.mjs '<json>'` append skip/submit，禁止 sed/write/edit 手改 JSON。禁止 `sessions_spawn`；browser 必须 `profile=linkedin-jobs`。

### LinkedIn 串行 External Apply（标准任务，任意 session）

**跑任务前（人工，一次性）：**

- 见 [`LINKEDIN_JOBS_BROWSER.md`](LINKEDIN_JOBS_BROWSER.md)：启动 `linkedin-jobs` + 登录 **unojose234@gmail.com**

**一条命令（全自动）：**

```bash
cd ~/.openclaw/workspace
node scripts/run-external-apply.mjs
```

低层 apply-only（不含预扫描）：`node scripts/run-external-apply-session.mjs`

```bash
openclaw browser --browser-profile linkedin-jobs start   # 可选；pipeline 会自动 start
```

- **Session 日志：** [`session_runs.json`](session_runs.json)（**每 run 独立**：本 run 新 submitted / target / 耗时）

- **推荐（少 tool/read，目标 10 单）：** [`prompts/linkedin-external-compact.md`](prompts/linkedin-external-compact.md)
- 完整版（会 read 多个 skill）：[`prompts/linkedin-external-loop.md`](prompts/linkedin-external-loop.md)

## 最终结果（必报）

脚本结束会输出 `[PIPELINE_FINAL]` 并写 `pipeline_report.json`。  
browser 投递批次结束后执行：

```bash
node scripts/emit-pipeline-report.mjs --outcome=success --phase=external_apply --message="..."
```

**成功或失败都要**把 `message` 告诉用户。

## 日志

`pipeline.log` / `run_status.json` — 仅 `ts` 为系统本地时间。

## 编排

[`ORCHESTRATOR.md`](ORCHESTRATOR.md)
