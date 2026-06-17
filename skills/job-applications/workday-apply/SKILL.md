# Workday Apply — LinkedIn External Loop 分支

**触发：** 在 [`../prompts/linkedin-external-loop.md`](../prompts/linkedin-external-loop.md) 主循环中，Apply 外链 URL 含 `myworkdayjobs.com` 时走本 skill。

**投递：** **必须** OpenClaw `browser` + 下列文件（按顺序 read）：

1. [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)
2. [`../applicant-profile.json`](../applicant-profile.json)
3. OpenClaw 内置 `browser-automation`
4. [`SOUL.md`](SOUL.md)
5. [`MASTER_apply.md`](MASTER_apply.md)

## 每条 Workday 职位

```bash
node scripts/pipeline-heartbeat.mjs --stage=workday_apply --step=form --message="Workday 填表" --interval=15 &
```

1. Apply tab 已在 `linkedin-external-loop` 中打开（`label="apply"`, `profile="linkedin-jobs"`）
2. **凭据**：**全 ATS** Create Account / Sign In 固定 **`Waibao1234567Go!`**（见 MASTER_apply.md §2.5；禁止用 LINKEDIN_PASSWORD）
3. 按 **MASTER_apply.md** §2.5 + STEP 1 PHASE 2–3：**禁止 fill**；每字段 click→clear→**type slowly:true**→Tab→验 value
4. STEP 2–5 继续拟人填表 → Submit
3. 成功写入 `applied_jobs.json`：

```json
{"method":"openclaw_browser","status":"submitted_workday","platform":"workday","url":"<apply_url>","ts":"<ISO8601>"}
```

4. skip / Captcha / 超时 → 同 external-apply 规则写入 `skipped_*` status
5. `close` apply tab → `focus` linkedin → 继续主循环下一个 job

凭据（Create Account / Verify / **Sign In** 同一套）：Email `unojose234@gmail.com`；Password **`Waibao1234567Go!`**（见 [`MASTER_apply.md`](MASTER_apply.md) §2.5 / PHASE 3）。Create Account 后 redirect Sign In 仍用此密码；**禁止** `LINKEDIN_PASSWORD`。

## 禁止

- **`kind:"fill"` 于任何 Workday 字段**（用 MASTER_apply §2.5 人类打字协议）
- **`evaluate` 写值 / 程序化 submit**（`.click()`、`requestSubmit`、`nativeInputValueSetter`）
- 用 `LINKEDIN_PASSWORD` 或 grep `.env` 填 Workday Create Account / Sign In；编造凭据
- 脚本自动提交 Workday 表单
- 使用已废弃账号（yiqunxu35@gmail.com 等）
