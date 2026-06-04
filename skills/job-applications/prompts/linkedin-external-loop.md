# LinkedIn 串行循环 — External Apply（标准任务）

**用途：** 每次 browser 投递 External Apply 时，让 Agent read 本文件并执行。与 `--session-id` 无关，任意 session 均可复用。

## 启动前必读（按顺序 read）

1. `skills/job-applications/BROWSER_HUMAN.md`
2. `skills/job-applications/applicant-profile.json`
3. OpenClaw 内置 skill：`browser-automation`
4. `skills/job-applications/external-apply/SKILL.md`
5. Workday 专用：`skills/job-applications/workday-apply/SKILL.md`

## 运行前检查（Agent 第一步）

1. `openclaw browser profiles` — **user** profile 必须为 **running**。若 stopped，执行 attach（见 [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)「user profile 启动」），**禁止**改用 openclaw 隔离浏览器。
2. **禁止** `openclaw browser start`（无 `--browser-profile user`）或任何会启动 `#FF4500` 橙色 openclaw Chrome 的操作。
3. 每个 browser 工具调用仍应显式带 `"profile": "user"`（双保险；`openclaw.json` 已设 `defaultProfile: user`）。
4. 检查 `/tmp/openclaw/uploads/resume.pdf`；不存在则仅用 `skills/job-applications/resume.txt`，不阻塞。
5. browser 工具确认：`{"action":"status","target":"host","profile":"user"}`

## Browser 硬约束

见 `BROWSER_HUMAN.md`。补充：

- LinkedIn 与 ATS 填表均用 **`profile="user"`**、`target="host"`
- LinkedIn 主 tab：`label="linkedin"`，后续操作 **`targetId="linkedin"`**
- Apply 外链 tab：`label="apply"`，填表用 **`targetId="apply"`**
- 忽略 tracking/recaptcha iframe tab（protechts.net、doubleclick、recaptcha 等），勿对其 snapshot/click
- 禁止 `exec` / `openclaw browser` CLI

## 全局常量

| 项 | 值 |
|----|-----|
| 搜索 URL | `https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States` |
| 简历 | `skills/job-applications/resume.txt`（有 pdf 则上传 pdf） |
| **申请人填表字段** | **`skills/job-applications/applicant-profile.json`（写死，禁止编造）** |
| LinkedIn 登录 | 见下方「账户凭据」 |
| 结果文件 | `skills/job-applications/applied_jobs.json` |
| 目标 | 本 run **新提交 10 个** External Apply（从 0 计数；历史仅 dedupe） |
| 单 job 上限 | **3 分钟**，超时 → skipped |
| 模式 | 全程 autonomous，不向用户提问 |

## 硬性 skip（任意 ATS，首次 snapshot 后判断）

见 [`../external-apply/SKILL.md`](../external-apply/SKILL.md)「硬性 skip」。摘要：

- **External assessment / completion code（必填测评码）** → **整单 skip**（`skipped_external_assessment`），close apply tab，**禁止**填 N/A 或占位符
- reCAPTCHA 无法自动完成 → `skipped_captcha`
- 超时 → `skipped_timeout`

## 账户凭据（唯一有效账号；勿使用其他已废弃邮箱/密码）

| 用途 | Email | Password |
|------|-------|----------|
| LinkedIn 登录 | unojose234@gmail.com | ${LINKEDIN_PASSWORD} |
| Workday / ATS 注册登录 | unojose234@gmail.com | ${LINKEDIN_PASSWORD} |

脚本环境变量：`skills/job-applications/.env`（`LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD` / `WORKDAY_*`）

## Phase 0 — 打开 LinkedIn

```json
{
  "action": "open",
  "url": "https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States",
  "target": "host",
  "profile": "user",
  "label": "linkedin"
}
```

`snapshot`（`targetId="linkedin"`, `interactive=true`）确认已登录。

若出现登录墙，用上方 **账户凭据** 登录（`unojose234@gmail.com` / `${LINKEDIN_PASSWORD}`）。勿使用任何其他历史账号。

## Phase 1 — 主循环（直到本 run 新 submitted=10）

### 1.1 筛选 job card

- `snapshot` on `targetId="linkedin"`
- 卡片含 **Easy Apply** → 跳过，滚动下一个
- 无 Easy Apply → External 候选

### 1.2 检测平台

- `click` Apply，记录新 tab URL（`label="apply"`）
- 路由：

| URL 含 | 动作 |
|--------|------|
| `greenhouse.io`, `icims.com` | 立即 skip，close apply，回 linkedin |
| `myworkdayjobs.com` | 按 `workday-apply/SKILL.md` + `BROWSER_HUMAN.md` |
| `ashbyhq`, `jazzhr`, `bamboohr`, `comeet`, `lever.co`, `rippling`, `pinppl` | 按 `external-apply/SKILL.md`（`bamboohr` 另 read `external-apply/bamboohr.md`） |
| `lever.co` + Captcha | skip |
| 其他 | 通用 external 流程 |

### 1.3 填表提交

- open apply tab 后 **先 snapshot**，跑「硬性 skip」；通过才填表
- 只填必填项（`*`）；字段值来自 `applicant-profile.json`；跳过可选字段
- Submit **必须最后**（见 `BROWSER_HUMAN.md`）
- 成功后写入 `applied_jobs.json`：
  `{"method":"openclaw_browser","status":"submitted_...","platform":"...","url":"...","ts":"..."}`
- skip / Captcha / 超时 / external assessment：`{"status":"skipped_...","reason":"..."}`，**不重试**

### 1.4 返回 LinkedIn

- `close` apply tab（保留 linkedin）
- `focus` linkedin → 滚动下一个 job

## 失败与续跑（任意 session 均适用）

- 普通失败 → skipped → close apply → focus linkedin → 下一个
- **incomplete turn**（`Agent couldn't generate a response … tool actions may have already been executed`）：
  - **不要** reopen URL，**不要**新开会话从头跑
  - 对当前 `apply` 或 `linkedin` tab `snapshot`，从页面状态继续
- Captcha → skip（`skipped_captcha`）
- External assessment 必填码 → skip（`skipped_external_assessment`），勿尝试填表

## 完成报告

汇总：成功数、跳过数及 reason、`applied_jobs.json` 路径、失败平台列表。
