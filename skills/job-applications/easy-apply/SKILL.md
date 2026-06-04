# Easy Apply — 仅 Browser 投递

**搜索职位：** 用脚本（`run_job_pipeline.mjs --phase=scan`），不要用本 skill 扫描。

**投递简历：** **必须** OpenClaw `browser` + [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)

## 每条职位

```bash
node scripts/pipeline-heartbeat.mjs --stage=easy_apply --step=apply --message="Easy Apply" --interval=15 &
```

1. `browser.open url="<url>" target="host"`
2. 点击 Easy Apply → 弹窗内慢速填表 → Submit
3. `applied_jobs.json` 追加 `{ "method": "openclaw_browser", "status": "submitted_easy_apply" }`

## 批次结束（必做）

```bash
node scripts/emit-pipeline-report.mjs --outcome=success --phase=easy_apply --message="投递完成 N 条"
# 或失败：
node scripts/emit-pipeline-report.mjs --outcome=failed --phase=easy_apply --error="原因" --message="..."
```

将 `pipeline_report.json` 的 `message` 汇报给用户。

## 禁止

Playwright / EasyApplyBot / 脚本点击「提交」
