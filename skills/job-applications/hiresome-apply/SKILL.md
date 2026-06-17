# Hiresome Apply — Browser 填表

**路径：** `skills/job-applications/hiresome-apply/`（read 本目录，**不是** npm 内 `openclaw/skills/`）

**触发：** apply tab URL 含 `hiresome.ai`（常见 `*.hiresome.ai/apply_form/...`）。

**必读：** [`MASTER_apply.md`](MASTER_apply.md) + [`../applicant-profile.json`](../applicant-profile.json) + [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)

## 流程摘要

1. `snapshot(apply, interactive=true)` → 硬性 skip 检查（captcha/OTP/assessment）
2. 若有 **Create Account / Sign In** → `unojose234@gmail.com` / **`Waibao1234567Go!`**（fill 或 type）
3. `fill`+`fields` 填 Name/Email/Phone/LinkedIn 等（**可用 fill**，非 Workday）
4. **Resume**：`upload` + **`element:"input[name=apply-v3-resume-file]"`** — **禁止 click** Upload 按钮
5. Sponsorship → **click No**（禁止 type `"No"`）
6. Submit → 验 **application has been received** / Thank you
7. append `submitted_hiresome` + 真实 hiresome apply URL

## 禁止

- 见 hiresome URL 就 `skipped_platform`
- click 上传按钮（Finder 陷阱）
- HTML name/id 填进 **`inputRef`**（用 **`element`**）
- upload 失败时 `openclaw gateway restart`
- India/₹ 表单强行 submit（2 轮失败 → skip）
