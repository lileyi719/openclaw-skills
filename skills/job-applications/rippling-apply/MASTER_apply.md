# Rippling ATS — MASTER Apply

**Skill 路径（本 workspace）：** `skills/job-applications/rippling-apply/` — **不是** npm 包内 `openclaw/skills/`。

**OpenClaw 工具：** 仅 `browser` JSON（`profile=linkedin-jobs`，apply tab 的 `targetId`）。

## §1 识别（Rippling hosted jobs，必须填表）

| URL 模式 | 示例 |
|----------|------|
| `ats.rippling.com/<company>/jobs/<uuid>` | ZEDEDA |
| `*.rippling.com` job apply 路径 | 公司 slug + job id |

**禁止** 见 rippling 就 skip。Tier2 **默认尝试**。

## §1.5 Create Account / Sign In

部分 Rippling 职位需先注册；多数 **单页申请表** 直接填字段。

| 字段 | 固定值 |
|------|--------|
| Email | `unojose234@gmail.com` |
| Password | **`Waibao1234567Go!`** |

- **`fill`+`fields`** 或 `type`。
- Create Account + Sign In **各 2 轮**失败 → `skipped_incomplete`（reason: `rippling create account failed`）。

## §2 页面类型

### A. 标准 Rippling 申请表（ZEDEDA 类）

常见控件：

- textbox：First name, Last name, Email, Phone, LinkedIn
- **radio group**：SMS consent、work authorization、sponsorship
- **button `Apply` [disabled]** 直到必填完成
- 可选 resume upload

## §3 填表协议

**凭据**（`applicant-profile.json`）：

| 字段 | 值 |
|------|-----|
| First Name | Jose / Yiqun |
| Last Name | Uno / Xu |
| Email | unojose234@gmail.com |
| Phone | (929) 461-4214 |
| LinkedIn | https://www.linkedin.com/in/yiqun-xu |

```json
{"action":"act","profile":"linkedin-jobs","targetId":"<apply>","request":{"kind":"fill","fields":[
  {"ref":"<first>","value":"Jose"},
  {"ref":"<last>","value":"Uno"},
  {"ref":"<email>","value":"unojose234@gmail.com"}
]}}
```

**错值追加陷阱（Rippling 常见）：** Email/Phone 若已有脏 value → 先 **Meta+a → Backspace** 或 `fill value:""` → 再填。

每批 fill 后 `snapshot` 验 `value=`。

## §4 Trap — SMS Consent / Radio（关键）

Rippling 常要求 **SMS consent** 或类似 **radio**。

**错误：** `type "Yes"` / `evaluate` click / 不点 radio 就点 Apply。

**正确：**

1. `snapshot(interactive=true)` 找 **`radio "..."`** 或 **`button "I agree"`** ref
2. **click 具体 radio ref**（session 成功例：consent radio ref 如 `e534`）
3. snapshot 验 radio **checked** / Apply 按钮 **enabled**

Sponsorship / work auth → 优先 **click No**（若 JD 为 US Citizen 不需 sponsorship）。

## §5 Trap — Apply [disabled]

1. snapshot 见 `button "Apply" [disabled]` → **不要** 反复 click
2. 扫描所有带 * 的 empty textbox / 未选 radio
3. 补填 → snapshot 直到 Apply **无 disabled** 或文案变 **Submit**
4. click **Apply** / **Submit application**
5. 2 轮仍 disabled → `skipped_incomplete`（reason: `rippling apply still disabled` + 缺哪项）

## §6 Trap — Resume Upload

若表单有 resume（非 always required）：

```json
{
  "action": "upload",
  "profile": "linkedin-jobs",
  "targetId": "<apply>",
  "paths": ["/tmp/openclaw/uploads/resume.pdf"],
  "element": "input[type=file]"
}
```

evaluate 取 `#id` 若有。**禁止 click** Browse/Attach。3 轮失败 → `skipped_incomplete`（reason: `rippling resume upload failed`）。

## §7 Submit

1. 所有必填 + radio 完成，Apply **enabled**
2. click **Apply** / **Submit**
3. 成功：Thank you / Application received / URL 变化
4. append：

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_rippling","platform":"rippling","company":"...","url":"https://ats.rippling.com/.../jobs/..."}'
```

## §8 失败与 Skip

| 情况 | status | reason 示例 |
|------|--------|-------------|
| Apply disabled 2 轮 | `skipped_incomplete` | `rippling missing required field` |
| Radio/consent 未选中 | `skipped_incomplete` | `rippling sms consent not checked` |
| Resume 3 轮失败 | `skipped_incomplete` | `rippling resume upload failed` |
| Create Account 2 轮 | `skipped_incomplete` | `rippling create account failed` |
| SMS OTP | `skipped_verification` | `rippling verification` |
| reCAPTCHA | `skipped_captcha` | `rippling recaptcha` |

**禁止** `evaluate` 程序化 click radio（用 snapshot ref click）。

## §9 已验证案例

| 公司 | 结果 | 备注 |
|------|------|------|
| **ZEDEDA** | ✅ submitted | fill + **click SMS consent radio ref** + Apply；`ats.rippling.com/zededa/jobs/...` |
