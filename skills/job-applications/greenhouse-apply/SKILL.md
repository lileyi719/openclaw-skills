# Greenhouse Apply — Browser 填表

**路径：** `skills/job-applications/greenhouse-apply/`（read 本目录，**不是** npm 内 `openclaw/skills/`）

**触发：** apply tab URL 含 `greenhouse.io`、`job-boards.*.greenhouse.io`、`/embed/job_app`，或任意 URL 含 `gh_jid=` / `gh_src=`（含 `careers.withwaymo.com` 等自托管 GH）。

**必读：** [`MASTER_apply.md`](MASTER_apply.md) + [`../applicant-profile.json`](../applicant-profile.json)

## 流程摘要

1. `snapshot(apply, interactive=true)` → 若有 **Create Account / Sign In** → 用统一凭据 `unojose234@gmail.com` / **`Waibao1234567Go!`**（fill 或 type）；2 轮失败才 skip
2. 若有 **Apply** 按钮（职位描述页）先 click **Apply**（不是 MyGreenhouse）
3. 用 `fill` + `fields:[{ref,value}]` 填 First/Last/Email/Phone/LinkedIn 等
4. **Phone country**：React Select — click combobox → type `United States` → click **United States +1** option（禁止对整个 listbox snapshot）
5. **Resume**（见 MASTER §5）：
   - evaluate 找 `input[type=file]` 的 **id**
   - `upload` + `/tmp/openclaw/uploads/resume.pdf` + **`element: "#<id>"`**（如 `"#resume"`、Waymo 的 `"#question_*"`）
   - **`inputRef` 仅用于 snapshot ref（`e120`）** — **禁止** `inputRef: "resume"` 或 `inputRef: "question_*"`（会 timeout）
   - **禁止 click Attach**；失败走 unhide Round B 或 **Enter manually**
   - upload timeout **禁止** `openclaw gateway restart`
6. Sponsorship / Yes-No → **click** radio/button **No**
7. click **Submit application** → snapshot 验 **Thank you for applying**
8. append `submitted_greenhouse` + 真实 GH URL

## 禁止

- 见 GH URL 就 `skipped_platform`（**必须**完整填表 2 轮失败才 skip）
- click **Quick Apply with MyGreenhouse** / **Autofill with MyGreenhouse**
- 因页面有 MyGreenhouse 按钮就 skip（标准表单在下方，照常填）
- click **Attach** 按钮上传（用 `upload` + **`element` CSS 选择器**）
- 把 HTML id 填进 **`inputRef`**（必须用 **`element: "#id"`**）
- upload 失败时 **`openclaw gateway restart`**
- 用错误简历路径（必须 `/tmp/openclaw/uploads/resume.pdf`）

## Skip 门槛

- Resume upload **3 轮**（含 unhide + Enter manually）仍失败 → `skipped_incomplete`（reason: `greenhouse resume upload failed`）
- **2 轮**完整填表 + Submit 仍失败 → `skipped_incomplete`（reason 写缺哪字段）
- Create Account / Sign In **2 轮**仍失败 → `skipped_incomplete`（非 auth_wall）
- SMS/email **验证码**无法自动完成 → `skipped_verification`
- reCAPTCHA 无法过 → `skipped_captcha`
- 仅 **MyGreenhouse OAuth** 且无 Email+Password 表单 → `skipped_auth_wall`
