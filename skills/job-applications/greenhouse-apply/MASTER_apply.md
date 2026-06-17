# Greenhouse — MASTER Apply

**Skill 路径（本 workspace）：** `skills/job-applications/greenhouse-apply/` — **不是** npm 包内 `openclaw/skills/`。

## §1 识别（全部是 Greenhouse，必须填表）

| URL 模式 | 示例 |
|----------|------|
| `job-boards.greenhouse.io` | CrashPlan, Two Six embed |
| `job-boards.eu.greenhouse.io` | Unframe |
| `boards.greenhouse.io` | 旧版 board |
| `*.greenhouse.io/jobs/` | 直链 |
| 自托管 + `gh_jid=` | Waymo `careers.withwaymo.com/...?gh_jid=` |

**禁止** 仅因「Greenhouse」就 skip。历史 `skipped_platform reason:Greenhouse` 是旧规则，本 run **作废**。

## §1.5 Create Account / Sign In（任意 GH 门户）

若 apply tab 出现 **Create Account / Register / Sign In**（非仅 MyGreenhouse OAuth）：

| 字段 | 固定值（与 Workday/UltiPro/Rippling **同一套**） |
|------|--------------------------------------------------|
| Email | `unojose234@gmail.com` |
| Password | **`Waibao1234567Go!`**（Verify Password 同一串） |

- **必须**填写并提交；**禁止** `skipped_auth_wall` 零尝试 skip。
- Email/Password 用 **`fill`+`fields`** 或 `type`；已有账号 → pivot Sign In，同一密码。
- **仅** SMS/email **验证码**无法自动完成 → `skipped_verification`。
- 2 轮 Create Account + Sign In 失败 → `skipped_incomplete`（reason: `greenhouse create account failed`）。

## §2 页面类型

### A. 职位描述页（有 **Apply** 按钮）

- snapshot 见 **Apply** + **Quick Apply with MyGreenhouse**
- **只 click 普通 Apply**（`btn--pill`，文案 **Apply**）
- **禁止** click MyGreenhouse

### B. 直接申请表（常见）

字段通常：First Name*, Last Name*, Email*, Phone (country + number), Resume*, LinkedIn, Sponsorship Yes/No, 自定义问题。

## §3 填表协议（与 Ashby/Lever 相同 — 可用 `fill`）

**凭据**（见 `applicant-profile.json` / compact prompt 表格）：

| 字段 | 值 |
|------|-----|
| First Name | Jose |
| Last Name | Uno |
| Email | unojose234@gmail.com |
| Phone | (929) 461-4214 |
| LinkedIn | https://www.linkedin.com/in/汉三-胡-780493361 |
| Address/City/State | 123 Main St, San Francisco, California |

```json
{"action":"act","profile":"linkedin-jobs","targetId":"<apply>","request":{"kind":"fill","fields":[
  {"ref":"<first_name>","value":"Jose"},
  {"ref":"<last_name>","value":"Uno"},
  {"ref":"<email>","value":"unojose234@gmail.com"}
]}}
```

每批 fill 后 `snapshot` 验 `value=`。

## §4 Trap — Phone Country（React Select）

**错误做法：** 对整个 page snapshot → context 爆炸；或 fill country textbox。

**正确做法：**

1. click **Phone** 区 country combobox ref
2. `type` `United States`（slowly）或 click option **United States +1**
3. click phone number textbox → fill `(929) 461-4214`
4. Tab → snapshot 验

## §5 Trap — Resume Upload

**macOS Finder 陷阱：** click Attach / Upload / **Resume Required*** → 原生文件框，Agent 无法自动关闭。

### OpenClaw upload 参数（必读）

| 参数 | 何时用 | 示例 |
|------|--------|------|
| **`element`** | HTML `#id`、CSS 选择器 | `"#resume"`、`"input[type=file]"` |
| **`inputRef`** | **仅** snapshot ref（`e120` 等 `e`+数字） | `"e120"` |
| **禁止** | 把 HTML id 填进 `inputRef` | ~~`inputRef: "resume"`~~ → 解析成 `aria-ref=resume`，**挂起 20s timeout** |

upload 20s timeout **不是** Gateway 坏了。**禁止** `openclaw gateway restart`；只换 `element` 选择器重试。

### 两种 GH 表单

| 类型 | 示例 | file input | `element` |
|------|------|------------|-----------|
| 标准 job-boards | Unframe `job-boards.eu.greenhouse.io` | `id="resume"` | `"#resume"` |
| 自托管 Grnhse | Waymo `careers.withwaymo.com?gh_jid=` | 动态 `id="question_*"` | evaluate 取 id → `"#question_7_0_4_0_0"` |

Hidden / `visually-hidden` 的 input **不需要 click Attach**；Playwright `setInputFiles` 可直接写 hidden input，前提是 **`element` 选择器正确**。

### 协议（按序，最多 3 轮；全程 **禁止 click Attach**）

**Round A — evaluate + `element` upload**

1. evaluate 列 file inputs：
```javascript
() => Array.from(document.querySelectorAll('input[type=file]')).map((el, i) => ({
  i, id: el.id, name: el.name, accept: el.accept,
  w: el.offsetWidth, h: el.offsetHeight
}))
```
2. 取 resume 对应 input 的 **id**（标准 GH 多为 `resume`；Waymo 为 `question_*`）
3. **直接 upload**（不 click 任何上传按钮）：
```json
{"action":"upload","profile":"linkedin-jobs","targetId":"<apply>","paths":["/tmp/openclaw/uploads/resume.pdf"],"element":"#resume"}
```
Waymo 示例：
```json
{"action":"upload","profile":"linkedin-jobs","targetId":"<apply>","paths":["/tmp/openclaw/uploads/resume.pdf"],"element":"#question_7_0_4_0_0"}
```
若无 id，用 `"element":"input[type=file]"` 或 `"element":"input[type=file]:first-of-type"`。
4. 只读 evaluate 验：`document.querySelector('input[type=file]').files[0]?.name` → 含 `resume`

**Round B — unhide CSS 再 upload（仍禁止 click 按钮）**

1. evaluate（仅改 CSS）：
```javascript
() => {
  const el = document.querySelector('input[type=file]') || document.getElementById('resume');
  if (!el) return 'no input';
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  return el.id ? '#' + el.id : 'input[type=file]';
}
```
2. 立刻 `upload` + 上一步返回的 **`element`**（如 `"#resume"`）
3. evaluate 触发 change（不注入 File）：
```javascript
() => {
  const el = document.querySelector('input[type=file]');
  if (!el?.files?.length) return 'empty';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.files[0].name;
}
```

**Round C — Enter manually（简历非必填或 Round A/B 仍空）**

- click **Enter manually** / **Paste resume** → `type` 粘贴简历文本（不走 file input）
- 仍失败 → `skipped_incomplete` reason `greenhouse resume upload failed`

### 其他禁止

- **禁止** click **Attach** / **Choose file**（会弹 macOS 原生对话框）
- **禁止** evaluate 注入 File/DataTransfer
- 路径 **必须** 在 `/tmp/openclaw/uploads/`
- upload 后按钮仍显示 Required **可忽略**（以 `files[0].name` 为准）

## §6 Sponsorship / Yes-No

- **click** **No** button/radio（禁止 type `"No"`）
- 常见 label：*Will you now or in the future require sponsorship?*

## §7 Submit

1. snapshot 确认必填 * 已填、resume 已 attach（或 Enter manually 已填）
2. click **Submit application**（`type=submit`，class `btn--pill`）
3. 成功：页面含 **Thank you for applying** / **Application submitted**
4. append：

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_greenhouse","platform":"greenhouse","company":"...","url":"https://job-boards..."}'
```

## §8 失败与 Skip

| 情况 | status | reason 示例 |
|------|--------|-------------|
| 3 轮 upload + Enter manually 仍无 resume | `skipped_incomplete` | `greenhouse resume upload failed` |
| 2 轮填表+Submit 仍缺字段 | `skipped_incomplete` | `greenhouse missing required field` |
| Create Account / Sign In 2 轮仍失败 | `skipped_incomplete` | `greenhouse create account failed` |
| SMS / email 验证码必填 | `skipped_verification` | `greenhouse email verification code` |
| reCAPTCHA 阻断 | `skipped_captcha` | `greenhouse recaptcha` |
| 仅 MyGreenhouse OAuth、无 Email+Password 表单 | `skipped_auth_wall` | `greenhouse mygreenhouse only` |
| TS/SCI 等硬性资质（JD 明确） | `skipped_incomplete` | `clearance requirement` |

**禁止** `skipped_platform` + reason `Greenhouse`（脚本会 reject primary GH skip）。

## §9 已验证案例（2026-06-09 探索 run）

| 公司 | 结果 | 根因 / 备注 |
|------|------|-------------|
| **Unframe** | ✅ submitted | fill + upload（须用 `element:#resume`，非 `inputRef:resume`） |
| **Waymo** | ❌ upload 卡死 | 误用 `inputRef: question_*` → 20s timeout；应 `element:#question_*` |
| **CrashPlan** | ❌ 误 skip | 旧规则零尝试 skip，**非**表单难 |
| **Two Six** | ❌ 误 skip | 同上；另有 TS/SCI 资质 |
