# Job Applications Pipeline

**日志：** 仅 `ts`（系统当前时间+时区）。

## 分工

| 阶段 | 工具 |
|------|------|
| **Phase 1 搜索** | 脚本 `write-scan-config` + `scan_linkedin_jobs.mjs` |
| **Phase 2 拆分队列** | 脚本 `prepare`（含在 `--phase=all`） |
| **Phase 3–4 投递（全自动）** | 脚本 `apply_jobs.mjs`（Playwright + 持久化 Chromium，与扫描同配置） |
| **投递（人工/对话）** | 可选 OpenClaw `browser` + `easy-apply` / `external-apply` / `workday-apply` |

**一条命令跑完全流程：**

```bash
node scripts/write-scan-config.mjs --target=easy_apply --keywords="Software Engineer" --limit=5
export PIPELINE_NON_INTERACTIVE=1 LINKEDIN_EMAIL=unojose234@gmail.com LINKEDIN_PASSWORD=${LINKEDIN_PASSWORD}
node scripts/run_job_pipeline.mjs --phase=all
```

扫描结束后会**自动**投递，不再停在「请用 browser」。

---

## OpenClaw 启动指令

```
node scripts/write-scan-config.mjs --target=external ...
node scripts/run_job_pipeline.mjs --phase=all
```

可选：用 `easy-apply` / `external-apply` / `workday-apply` SKILL + OpenClaw `browser` 做逐步拟人投递。

---

## Phase 0 — 准备

```bash
node scripts/update-pipeline-status.mjs --stage=pipeline --step=init --message="Pipeline ready"
```

---

## Phase 1 — 搜索职位（脚本）

```bash
node scripts/write-scan-config.mjs --target=external --keywords="Software Engineer" --location="United States" --limit=15 --pages=3
export PIPELINE_NON_INTERACTIVE=1 LINKEDIN_EMAIL=unojose234@gmail.com LINKEDIN_PASSWORD=${LINKEDIN_PASSWORD}
node scripts/run_job_pipeline.mjs --phase=all
```

- 读 [`scan_config.json`](scan_config.json)：`scan_target` = `easy_apply` | `external` | `all`
- **external**：只写 `external_apply_jobs.json`，`easy_apply_jobs.json` = `[]`
- 实现：[`scripts/scan_linkedin_jobs.mjs`](../../scripts/scan_linkedin_jobs.mjs)
- 说明：[`linkedin-classifier/SKILL.md`](linkedin-classifier/SKILL.md)

可选：用 browser 扫描（skill 方式 B），结果文件相同。

`--phase=all` = 扫描 + `prepare` + **自动投递**（`apply_jobs.mjs`）。

---

## Phase 2–4 — 投递（默认全自动）

| 阶段 | Skill | 输入 |
|------|--------|------|
| Easy Apply | `easy-apply/SKILL.md` | `easy_apply_jobs.json` |
| External | `external-apply/SKILL.md` | `external_queue.json` |
| Workday | `workday-apply/SKILL.md` | `workday_queue.json` |

```bash
node scripts/pipeline-heartbeat.mjs --stage=external_apply --step=fill --message="填表" --interval=15 &
# browser.open → browser.act（拟人）
node scripts/update-pipeline-status.mjs --stage=external_apply --step=done --message="已提交" --status=done
```

仅投递：`node scripts/run_job_pipeline.mjs --phase=apply`

---

## 最终结果报告（成功或失败必出）

每次阶段结束会出现 **`[PIPELINE_FINAL]`** 一行 JSON，并写入 `pipeline_report.json`。

```bash
cat skills/job-applications/pipeline_report.json
node scripts/emit-pipeline-report.mjs --outcome=success --phase=external_apply --message="投递完成 3/5"
node scripts/emit-pipeline-report.mjs --outcome=failed --phase=external_apply --error="Captcha" --message="投递失败"
```

**OpenClaw 必须**把 `pipeline_report.json` 里的 `message` 原文汇报给用户（无论成功失败）。

## 进度

```bash
tail -f skills/job-applications/pipeline.log
cat skills/job-applications/run_status.json
```

---

## 账户凭据（LinkedIn + Workday / ATS，唯一有效）

| Email | Password |
|-------|----------|
| unojose234@gmail.com | ${LINKEDIN_PASSWORD} |

环境变量（`skills/job-applications/.env`）：

```bash
export LINKEDIN_EMAIL=unojose234@gmail.com
export LINKEDIN_PASSWORD=${LINKEDIN_PASSWORD}
export WORKDAY_EMAIL=unojose234@gmail.com
export WORKDAY_PASSWORD=${LINKEDIN_PASSWORD}
```

已废弃、**禁止再使用**：yiqunxu35@gmail.com、lileyi719@gmail.com 及一切旧密码。
