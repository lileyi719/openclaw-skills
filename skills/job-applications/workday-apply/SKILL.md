# Workday Apply — 仅 Browser 投递

**搜索：** 脚本（`external` 扫描后进 `workday_queue.json`）。

**投递：** **必须** `browser` + `workday-apply/BATCH_apply.md` + [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)

## 每条职位

```bash
node scripts/pipeline-heartbeat.mjs --stage=workday_apply --step=form --message="Workday" --interval=15 &
```

`browser.open` → 按 MASTER 拟人填表 → Submit → `method: openclaw_browser`

凭据：unojose234@gmail.com / ${LINKEDIN_PASSWORD}（与 LinkedIn 相同；见 `../.env` 或 [`../prompts/linkedin-external-loop.md`](../prompts/linkedin-external-loop.md)）

## 批次结束（必做）

```bash
node scripts/emit-pipeline-report.mjs --outcome=success --phase=workday_apply --message="..."
```

向用户报告 `pipeline_report.json` 的 `message`（成功或失败）。

## 禁止

脚本提交 Workday 表单
