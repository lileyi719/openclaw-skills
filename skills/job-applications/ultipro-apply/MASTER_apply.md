# UltiPro / UKG — MASTER Apply

**Skill 路径（本 workspace）：** `skills/job-applications/ultipro-apply/` — **不是** npm 包内 `openclaw/skills/`。

**OpenClaw 工具：** 仅 `browser` JSON（`profile=linkedin-jobs`，apply tab 的 `targetId`）。

## §1 识别（全部是 UltiPro/UKG，必须填表）

| URL 模式 | 示例 |
|----------|------|
| `recruiting.ultipro.com` | 各租户 JobBoard |
| `recruiting2.ultipro.com` | Husch Blackwell 等 |
| Path 常含 | `/JobBoard/.../OpportunityDetail` → Apply → 多步 wizard |

**禁止** 见 ultipro 就 `skipped_platform`。Tier2 **默认尝试**。

## §1.5 Create Account / Register / Sign In（常见第一步）

UltiPro 外链常先 **Create Account** 或 **Sign In** 才能进申请表。

| 字段 | 固定值 |
|------|--------|
| Email | `unojose234@gmail.com` |
| Password | **`Waibao1234567Go!`** |
| Verify Password | **同上** |

- 用 **`fill`+`fields`** 或 `type`（UltiPro **允许 fill**）。
- “Email already registered” → **Sign In**，同一密码。
- **禁止** grep `.env` 的 `LINKEDIN_PASSWORD`。
- Create Account + Sign In **各 2 轮**失败 → `skipped_incomplete`（reason: `ultipro create account failed`）。
- SMS/email OTP → `skipped_verification`。

### Create Account 后

- 可能 redirect **Sign In** → 再填 Email + Password → click Sign In
- 进入 **Opportunity** → click **Apply** / **Submit Application**

## §2 页面类型

### A. Job Board → Opportunity Detail → Apply

1. 职位详情页 click **Apply** / **Apply Now**
2. 若未登录 → Create Account / Sign In（§1.5）
3. 多页 wizard：**Personal Information → Experience → Questions → Review → Submit**

### B. 长表单特征

- 大量 textbox、dropdown、**radio group**、date picker
- **EEO / Voluntary Self-Identification**（race/gender/veteran/disability）— 按 snapshot 选 **Prefer not to answer** 或 **No**（若允许）
- Address 分 Street / City / State / ZIP

## §3 填表协议（`fill` + click radio/dropdown）

**凭据**（`applicant-profile.json`）：

| 字段 | 值 |
|------|-----|
| First Name | Jose（或 Yiqun — 与 resume 一致） |
| Last Name | Uno（或 Xu） |
| Email | unojose234@gmail.com |
| Phone | (929) 461-4214 |
| Address | 2550 Van Ness Ave |
| City | San Francisco |
| State | California |
| ZIP | 94109 |
| Country | United States |
| LinkedIn | https://www.linkedin.com/in/yiqun-xu |
| Date available | 05/20/2026 |

```json
{"action":"act","profile":"linkedin-jobs","targetId":"<apply>","request":{"kind":"fill","fields":[
  {"ref":"<first>","value":"Jose"},
  {"ref":"<last>","value":"Uno"},
  {"ref":"<email>","value":"unojose234@gmail.com"}
]}}
```

**Radio / Yes-No：** **click** `radio "No"` 或 `button "No"` ref — **禁止** type `"No"` 进 textbox。

**Dropdown / Select：** click combobox → snapshot → click **option** / **menuitem** ref（禁止 click listbox 容器）。

**Date：** type `05/20/2026` 或分字段 Month/Day/Year（snapshot 决定）。

每页 **Next** / **Continue** → snapshot 下一页 → 重复直到 Review。

## §4 Trap — 多页 Continue 无反应

- snapshot 查 `[role=alert]` / 红色 validation 文案
- 补填带 * 字段 → 再 click Continue
- 2 轮仍卡同一页 → `skipped_incomplete`（reason: `ultipro validation stuck on page N`）

## §5 Trap — Resume Upload

UltiPro 常见 **Attach** / **Browse** 按钮 — **禁止 click**（Finder）。

1. evaluate 列 `input[type=file]` 的 id/name
2. upload：
```json
{
  "action": "upload",
  "profile": "linkedin-jobs",
  "targetId": "<apply>",
  "paths": ["/tmp/openclaw/uploads/resume.pdf"],
  "element": "input[type=file]"
}
```
或 `"element": "#<id>"` 若 evaluate 有 id。

3. 验 `files[0].name` 含 `resume`
4. 3 轮失败 → `skipped_incomplete`（reason: `ultipro resume upload failed`）

## §6 Trap — Workday 混淆

若 URL 是 **myworkdayjobs.com** 不是 ultipro → read `workday-apply/MASTER_apply.md`（Workday **禁止 fill**）。UltiPro 域名才用本 skill。

## §7 Submit

1. **Review** 页 snapshot 确认必填完成
2. click **Submit** / **Submit Application** / **Finish**
3. 成功：Confirmation / Thank you / Application Submitted
4. append：

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_ultipro","platform":"ultipro","company":"...","url":"https://recruiting2.ultipro.com/.../OpportunityDetail?..."}'
```

`url` 写 **Opportunity 或 apply 真实 URL**，禁止 linkedin.com/jobs/view。

## §8 失败与 Skip

| 情况 | status | reason 示例 |
|------|--------|-------------|
| Create Account 2 轮失败 | `skipped_incomplete` | `ultipro create account failed` |
| Sign In 2 轮失败 | `skipped_incomplete` | `ultipro sign in failed` |
| Resume 3 轮失败 | `skipped_incomplete` | `ultipro resume upload failed` |
| Wizard 2 轮 validation | `skipped_incomplete` | `ultipro missing required field` |
| SMS/email OTP | `skipped_verification` | `ultipro verification` |
| reCAPTCHA | `skipped_captcha` | `ultipro recaptcha` |

## §9 已验证案例

| 公司 | 结果 | 备注 |
|------|------|------|
| **Husch Blackwell** | ✅ submitted | Create Account + 长表单 + fill/radio；`recruiting2.ultipro.com` |
| **Milliman** | ❌ incomplete | Sign-in / 表单复杂度（session 记录） |
