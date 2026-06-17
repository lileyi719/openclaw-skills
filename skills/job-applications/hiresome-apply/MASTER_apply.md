# Hiresome — MASTER Apply

**Skill 路径（本 workspace）：** `skills/job-applications/hiresome-apply/` — **不是** npm 包内 `openclaw/skills/`。

**OpenClaw 工具：** 仅 `browser` JSON（`profile=linkedin-jobs`，apply tab 的 `targetId`）。**禁止** `exec openclaw browser` CLI。

## §1 识别（全部是 Hiresome，必须填表）

| URL 模式 | 示例 |
|----------|------|
| `*.hiresome.ai/apply_form/` | `yohrconsultancy.hiresome.ai/apply_form/node-js-software-engineer-remote-...` |
| 子域名 varies | 每客户独立 subdomain（`yohrconsultancy`、`companyname` 等） |

**禁止** 见 `hiresome.ai` 就 `skipped_platform`。Tier2 **默认尝试**；2 轮完整填表失败才 `skipped_incomplete`。

## §1.5 Create Account / Sign In

若 apply tab 出现 **Create Account / Register / Sign In / Log in**：

| 字段 | 固定值（与 Workday/UltiPro/Rippling **同一套**） |
|------|--------------------------------------------------|
| Email | `unojose234@gmail.com` |
| Password | **`Waibao1234567Go!`**（Verify / Confirm **同一串**） |

- Email/Password 用 **`fill`+`fields`** 或 `type`（Hiresome **允许 fill**，与 Workday 不同）。
- 已有账号 / “email already exists” → pivot **Sign In**，同一密码。
- **禁止** `skipped_auth_wall` 零尝试 skip。
- SMS/email **验证码**无法自动完成 → `skipped_verification`。
- Create Account + Sign In **各 2 轮**失败 → `skipped_incomplete`（reason: `hiresome create account failed`）。

## §2 页面类型

### A. 单页申请表（常见）

字段通常：Name、Email、Phone、Resume upload、LinkedIn、Yes/No、短 essay。

### B. 印度/离岸定制表单（Trap — 高失败率）

部分 Hiresome 客户表单含：

- **₹ INR** CTC / salary spinbutton
- **Country** 非 US 默认（India +91）
- React **spinbutton** / country picker

**US 申请人 profile** 难以自动填 → 2 轮仍无法得到 US phone/country → `skipped_incomplete`（reason: `hiresome_india_form_resume_phone_country_spinbutton_failed`）。**不要**用占位 salary 强行 submit。

## §3 填表协议（可用 `fill` + `type`）

**凭据**（见 `applicant-profile.json`）：

| 字段 | 值 |
|------|-----|
| First / Full Name | Yiqun (Brian) Xu 或 Jose Uno（按表单 split） |
| Email | unojose234@gmail.com |
| Phone | (929) 461-4214 |
| LinkedIn | https://www.linkedin.com/in/yiqun-xu |
| City / State | San Francisco, California |
| Work authorization | US Citizen（若问） |
| Sponsorship | **No**（click button/radio，禁止 type `"No"`） |

```json
{"action":"act","profile":"linkedin-jobs","targetId":"<apply>","request":{"kind":"fill","fields":[
  {"ref":"<name_ref>","value":"Yiqun Xu"},
  {"ref":"<email_ref>","value":"unojose234@gmail.com"}
]}}
```

每批 fill 后 `snapshot` 验 `value=`。

**错值纠正：** 先 `fill`+`value:""` 或 click → Meta+a → Backspace，再填目标值（见 compact prompt「清空再填」）。

## §4 Trap — Phone / Country

1. 若 snapshot 显示 **+91 India** 或非 US country → click country control → 选 **United States +1**
2. Phone textbox → fill/type `(929) 461-4214`
3. Tab → snapshot 验 country + number
4. 2 轮仍非 US → `skipped_incomplete`（reason: `hiresome phone country failed`）

## §5 Trap — Resume Upload

**macOS Finder 陷阱：** click Upload / Choose file / drag-drop 区域按钮 → 原生文件框。

### 已验证 selector（YO IT Consulting 成功）

```json
{
  "action": "upload",
  "profile": "linkedin-jobs",
  "targetId": "<apply>",
  "paths": ["/tmp/openclaw/uploads/resume.pdf"],
  "element": "input[name=apply-v3-resume-file]"
}
```

| 参数 | 何时用 |
|------|--------|
| **`element`** | CSS 选择器（**首选** `"input[name=apply-v3-resume-file]"`） |
| **`inputRef`** | **仅** snapshot ref（`e120` 等） |
| **禁止** | `inputRef: "apply-v3-resume-file"`（会变成 aria-ref timeout） |

### 协议（最多 3 轮；全程 **禁止 click** 上传按钮）

1. evaluate 列 file inputs：
```javascript
() => Array.from(document.querySelectorAll('input[type=file]')).map(el => ({
  id: el.id, name: el.name, accept: el.accept
}))
```
2. `upload` + **`element`**（优先 `input[name=apply-v3-resume-file]`，否则 `input[type=file]`）
3. 只读 evaluate 验：`document.querySelector('input[type=file]')?.files?.[0]?.name` → 含 `resume`
4. 按钮仍显示 Required **可忽略**（以 files[0] 为准）
5. upload timeout **禁止** `openclaw gateway restart`；只换 `element` 重试

失败 3 轮 → `skipped_incomplete`（reason: `hiresome resume upload failed`）。

## §6 Essay / Textarea

- 短答：`fill`+`fields:[{ref,value}]` → Tab → snapshot 验 value
- 2 轮 value 仍空 → `skipped_incomplete`（reason: `hiresome essay empty`）

## §7 Submit

1. snapshot：必填 * 已填、resume files[0] 有值
2. click **Submit** / **Apply** / **Send application**（可见 enabled ref）
3. 成功：Toast **「Your application has been received!」** / Thank you / 确认页
4. append：

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_hiresome","platform":"hiresome","company":"...","url":"https://....hiresome.ai/apply_form/..."}'
```

## §8 失败与 Skip

| 情况 | status | reason 示例 |
|------|--------|-------------|
| Resume upload 3 轮失败 | `skipped_incomplete` | `hiresome resume upload failed` |
| India CTC / country 2 轮失败 | `skipped_incomplete` | `hiresome_india_form_...` |
| Create Account 2 轮失败 | `skipped_incomplete` | `hiresome create account failed` |
| SMS/email OTP | `skipped_verification` | `hiresome email verification` |
| reCAPTCHA | `skipped_captcha` | `hiresome recaptcha` |
| 单 job >4min | `skipped_timeout` | `hiresome timeout` |

**禁止** `skipped_platform` + reason `hiresome` / `not_primary_tier`（Tier2 必须尝试）。

## §9 已验证案例

| 公司 | 结果 | 备注 |
|------|------|------|
| **YO IT Consulting** | ✅ submitted ×2 | Node.js SE Remote；JS/TS Developer Remote — `element: input[name=apply-v3-resume-file]` |
| **YO IT Consulting** | ❌ incomplete | Python Backend — India phone/country spinbutton |
