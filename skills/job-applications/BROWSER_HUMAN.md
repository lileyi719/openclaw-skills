# Browser 拟人化操作规范（仅用于「申请 / 投递」）

**适用范围：** Phase 2–4 — Easy Apply、外链 ATS、Workday **填表与提交**。  
**不适用于：** Phase 1 职位搜索（请用脚本 `run_job_pipeline.mjs --phase=scan`）。

## 硬规则

- 投递 **必须** OpenClaw `browser` 工具（Agent tool call），`target="host"`
- **LinkedIn 批量投递：必须** `profile="linkedin-jobs"`（托管 CDP，专用 Chrome + LinkedIn 登录态）
- **禁止** `profile="openclaw"`（空橙浏览器）或 `profile="user"`（日常 Chrome MCP，长跑易 cutoff）
- 运行前：`openclaw browser --browser-profile linkedin-jobs status` 确认 **running**
- **禁止** Playwright / Selenium / EasyApplyBot 提交申请
- **禁止** 用 `exec` / shell 执行 `openclaw browser ...` 任何子命令（会导致与 session 脱节）
- **禁止** `evaluate` 填表或点击；只读 DOM 时若必须用 `evaluate`，`request.fn` 必填
- 填表 / 点击 / 选 radio：**只用** `action="act"` + `request.kind` 为 `click` | `type` | `fill` | `select`
- **Ref 规则（最高优先级）：** click/type/fill/select **只能**用 snapshot 里 `[ref=8_34]` 这类 ref；**禁止**用按钮文字、aria label、uid。ref 失效 → 立即 re-snapshot
- 每次 `act` 前必须对同一 `targetId` 先 `action="snapshot"`；ref 失效则重新 snapshot
- 下拉 / 日期控件：点开控件后 **必须** re-snapshot，再 click 菜单项 ref
- 多步 browser 流程第一步：`read` OpenClaw 内置 skill `browser-automation`（tab 管理、stale ref 恢复）
- 可见浏览器
- 未调用 `browser.open` + `browser.act` 不得写入 `submitted`

## linkedin-jobs profile 启动（托管 CDP）

详见 [`LINKEDIN_JOBS_BROWSER.md`](LINKEDIN_JOBS_BROWSER.md)。

```bash
# 改 openclaw.json 后先重启 Gateway
openclaw browser --browser-profile linkedin-jobs start
openclaw browser --browser-profile linkedin-jobs status   # transport: cdp, running: true
openclaw browser --browser-profile linkedin-jobs tabs       # preflight 必须通过
```

首次使用：在 **蓝色 accent** 窗口登录 LinkedIn（`unojose234@gmail.com`）。

**识别错误浏览器：**

- 橙色 `#FF4500` / `profile "openclaw"` → 未登录，**禁止**用于投递
- 绿色 `chrome-mcp` / `profile "user"` → 日常 Chrome MCP，batch **不用**

## Tab 管理（LinkedIn + 外链 ATS）

- LinkedIn 主 tab：`label="linkedin"`，操作一律 `targetId="linkedin"`
- 外链 Apply tab：`label="apply"`，填表一律 `targetId="apply"`
- **硬上限**：任意时刻最多 **2** 个可操作 tab（1 linkedin + 1 apply）；填表结束后 apply 必须关
- 完成一条申请：`close` apply tab → `focus` linkedin → **`tabs` 审计** → 若有 orphan ATS / 多余 linkedin tab 立刻 `close` → 只留 1 个 linkedin → 滚动下一个 job
- 每 **10** 个 job：额外孤儿 tab 清扫（`tabs` → close 所有非 linkedin.com）
- **忽略** tracking / recaptcha iframe tab，勿 snapshot 或 click
- 多 tab 时先 `{"action":"tabs","profile":"linkedin-jobs"}`

## Browser 工具调用方式（给 Agent 的 JSON 示例）

```json
{ "action": "open", "url": "https://www.linkedin.com/jobs/search/...", "target": "host", "profile": "linkedin-jobs", "label": "linkedin" }
```

```json
{ "action": "open", "url": "https://...", "target": "host", "profile": "linkedin-jobs", "label": "apply" }
```

## 步数控制（防 incomplete turn）

- 单 job 目标：≤ **12** 次 browser tool call；接近 10 步仍未 Submit → 写 `skipped_incomplete`，close apply tab
- 一次 snapshot 后可连续 type 多个 textbox，不必每字段都 snapshot
- dropdown：最多 3 步（click 开菜单 → snapshot → click menuitem ref）

## 出错恢复（incomplete turn / couldn't generate response）

1. **不要**从头 `open` URL 重跑整表
2. 对当前 tab `snapshot` 看页面状态
3. 从缺失字段继续，勿重复已提交的操作

## 长步骤心跳

```bash
node scripts/pipeline-heartbeat.mjs --stage=external_apply --step=fill --message="填表" --interval=15 &
```

## 标准填表（先清空再填 — linkedin-jobs / CDP）

**禁止**在错误 `value=` 后继续 `type`（Lever/Rippling 会追加成乱码）。纠正任意字段：

```
click 字段 ref → fill fields:[{ref,value:""}] → snapshot 确认空
→ fill/type 正确整段值 → Tab → snapshot 验 value=
```

**Lever location ✱：** 禁止 `fill`；`click` → `Meta+a` → `Backspace` → `type` `San Francisco, CA, USA` → snapshot → click dropdown option。

## 简历 upload（禁止 Finder 弹窗）

**macOS：** click Attach / Upload / Choose file / **Resume Required*** / 任何上传按钮 → **Finder 弹出**，只能 `Escape` 恢复。

**唯一正确：** `upload` + `paths:["/tmp/openclaw/uploads/resume.pdf"]` + `inputRef` = **`<input type=file>`**（ref / id / name），**禁止**先 click 上传按钮。

| Trap | 处理 |
|------|------|
| snapshot 只有上传按钮 | `inputRef` 用 id/name（`ce_resume`、`apply-v3-resume-file`），**不要 click** 按钮 |
| upload 后按钮仍写 Required | 用 evaluate **只读** 验 `input.files[0].name` |
| upload 失败 | 换 inputRef 重试；**禁止 click** 上传控件 |
| Finder 已开 | `Escape` → `upload`；禁止再 click Attach |

**禁止：** evaluate 注入 File；click 隐藏 file input。

## 全 ATS Create Account / Sign In（Workday · UltiPro · Rippling · GH · …）

**见 Create Account / Register / Sign up / Sign In → 必须尝试，禁止零尝试 skip。**

| 字段 | 固定值 |
|------|--------|
| Email | `unojose234@gmail.com` |
| Password | **`Waibao1234567Go!`**（Verify/Confirm 同一串；含 `!`） |

- **全站统一**：Workday、UltiPro/UKG、Rippling、Greenhouse 自托管、ICIMS 等 **同一 Email + Password**。
- **禁止** grep `.env` 或 `LINKEDIN_PASSWORD` 填 ATS 注册/登录。
- Create Account 成功 → redirect Sign In → **仍用同一密码**。
- 非 Workday：Email/Password 用 **`fill`+`fields`** 或 `type`。
- **仅验证码**（SMS OTP / email verification code）无法自动完成 → `skipped_verification`；**不要**因「要建账号」就 skip。
- OAuth 独占（仅 Google/LinkedIn/**MyGreenhouse**，无 Email+Password 表单）→ `skipped_auth_wall`。
- Create Account + Sign In **各 2 轮**失败 → `skipped_incomplete`。

## Workday（myworkdayjobs.com）— 与 Ashby/Lever 不同

**全站禁止 `fill`**（含 Create Account / Sign In / 所有 textbox）。React state 不写入时 snapshot 仍有 `value=`，但 Submit 无反应。

**每个字段（6 步，提交前 snapshot 验 value）：**

```
click 字段 ref → press Meta+a → press Backspace
→ type ref, slowly:true → press Tab → snapshot 验 value=
```

**凭据（写死 — 与全 ATS 统一）：** Email `unojose234@gmail.com`；Password **`Waibao1234567Go!`**（Workday 专用人类打字；其他 ATS 可用 fill）。

**禁止：** `fill`；evaluate 写值 / `.click()` / `requestSubmit`；未验证 value 就点 Create Account。

**Skip 门槛：** Create Account + Sign In 各 **2 轮**完整物理协议失败后才 `skipped_incomplete`。

详见 `workday-apply/MASTER_apply.md` §2.5、PHASE 2–3。

## 投递记录

```json
{ "method": "openclaw_browser", "status": "submitted_..." }
```

## 进度

```bash
node scripts/update-pipeline-status.mjs --stage=external_apply --step=submit --message="..."
```
