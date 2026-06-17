# External Apply — 仅 Browser 投递

**搜索职位：** 脚本 + `scan_target=external`（`run_job_pipeline.mjs --phase=all`）。

**投递：** **必须** `browser` + [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)  
**输入：** `../external_queue.json`（`prepare` 之后）

## Easy Apply — 全面禁止

本 pipeline **只做 External Apply**。**禁止** LinkedIn Easy Apply（不 click 卡片/按钮/弹窗，不 Submit，不 append `submitted_*easy*`）。列表见 Easy Apply → **scroll**；搜索 URL **禁止** `f_AL=true`。详见 `prompts/linkedin-external-compact.md`。

## 每条职位

**开始前必读：** `read` [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)、[`../applicant-profile.json`](../applicant-profile.json) 与 OpenClaw 内置 `browser-automation` skill。填表**只用** `browser` 工具（JSON tool call），**禁止** `exec` 跑 `openclaw browser` CLI。

**申请人字段：** 姓名 / 邮箱 / 电话 / 地址 / LinkedIn / 可入职日期等 **只读** [`../applicant-profile.json`](../applicant-profile.json)，禁止模型编造。

```bash
node scripts/pipeline-heartbeat.mjs --stage=external_apply --step=fill --message="外链填表" --interval=15 &
```

1. browser 工具 `{"action":"open","url":"<apply_url>","target":"host","profile":"linkedin-jobs","label":"apply"}`
2. **首次** `snapshot`（`interactive=true`）→ 执行下方「硬性 skip」检查 → 通过才填表
3. 慢速填必填项（`click` / `type` / `fill` / `select`，`slowly=true`）→ 上传简历 → **最后** Submit（见 `BROWSER_HUMAN.md`）
4. `{ "method": "openclaw_browser", ... }` 写入 `applied_jobs.json`

### 硬性 skip（首次 snapshot 后立即判断，**整单跳过**，close apply tab → focus linkedin）

| 条件 | 写入 status | 说明 |
|------|-------------|------|
| 页面含 **external assessment** / **completion code** / **assesment**（测评完成码）且为必填 | `skipped_external_assessment` | **无真实 code，禁止填 N/A 或占位符**；无法完成测评则放弃该 job |
| reCAPTCHA 可见且无法自动完成 | `skipped_captcha` | |
| **SMS / email 验证码**（OTP 必填且无法自动完成） | `skipped_verification` | |
| 单 job 超过 3 分钟 | `skipped_timeout` | |

```json
{"status":"skipped_external_assessment","reason":"required external assessment completion code; none available","platform":"...","url":"..."}
```

### 平台专用备忘（仅该平台出现时 read）

| URL 含 | 读 |
|--------|-----|
| `hiresome.ai` | [`../hiresome-apply/SKILL.md`](../hiresome-apply/SKILL.md) + `MASTER_apply.md` |
| `ultipro.com` | [`../ultipro-apply/SKILL.md`](../ultipro-apply/SKILL.md) + `MASTER_apply.md` |
| `rippling.com` / `ats.rippling.com` | [`../rippling-apply/SKILL.md`](../rippling-apply/SKILL.md) + `MASTER_apply.md` |
| `bamboohr.com` | [`bamboohr.md`](bamboohr.md) |
| `clearcompany.com` | [`../clearcompany-apply/SKILL.md`](../clearcompany-apply/SKILL.md) + `MASTER_apply.md` |

### Apply tab dedupe（填表前）

```bash
node scripts/check-applied-url.mjs '<apply_url>' --retry-incomplete
```

- `ALREADY_SUBMITTED` → close apply tab，不填表
- `RETRY_INCOMPLETE` → 可重试（如 ClearCompany resume 失败）

### Rippling / 类似 ATS

- 常见控件：textbox、radio（如 SMS consent）、`button "Apply" [disabled]`
- SMS consent 等 radio 必须用 `click` + ref（如 `e534`），不要用 `evaluate`
- Apply `[disabled]` → 按 [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)「Apply disabled」流程 snapshot 补字段后再 click

### 简历 upload（必读）

- **禁止 click** Attach / Upload / Resume Required* — 会弹 **macOS Finder**
- 只用 `upload` + `/tmp/openclaw/uploads/resume.pdf` + **`inputRef` = file input**（id/name 如 `ce_resume`），不是按钮 ref
- upload 失败 → 换 inputRef，**禁止 click** 上传按钮；Finder 已开 → `Escape` → upload
- 详见 [`../prompts/linkedin-external-compact.md`](../prompts/linkedin-external-compact.md)「简历上传」

登录凭据：**全 ATS Create Account / Sign In** 固定 `unojose234@gmail.com` / **`Waibao1234567Go!`**（见 [`../prompts/linkedin-external-compact.md`](../prompts/linkedin-external-compact.md)「全 ATS Create Account」；**禁止** `.env` 的 `LINKEDIN_PASSWORD`）。见 Create Account → **必须**注册/登录，仅验证码才 skip。填表字段见 [`../applicant-profile.json`](../applicant-profile.json)

## 批次结束（必做）

```bash
node scripts/emit-pipeline-report.mjs --outcome=success|failed --phase=external_apply --message="..."
```

无论成败，向用户报告 `pipeline_report.json` 中的 `message`。

## 禁止

脚本自动填外链表单或提交
