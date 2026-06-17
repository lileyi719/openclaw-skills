# LinkedIn 投递专用浏览器（`linkedin-jobs` profile）

批量 External Apply 使用 **OpenClaw 托管 CDP** profile `linkedin-jobs`，不再 attach 日常 Chrome（`user` / Chrome MCP）。

## 账号（首次登录用）

| 字段 | 值 |
|------|-----|
| Email | `unojose234@gmail.com` |
| Password | 见 `skills/job-applications/.env` 中 `LINKEDIN_PASSWORD` |

登录态保存在 `linkedin-jobs` 专用 userDataDir，与日常 Chrome **隔离**。

## 与 `user` / `openclaw` 的区别

| Profile | 用途 | 识别 |
|---------|------|------|
| **linkedin-jobs** | 批量投递（pipeline 默认） | 蓝色 accent `#0066CC`，CDP 托管 |
| `user` | 日常浏览（MCP attach） | 绿色，需 `chrome://inspect` 开关 |
| `openclaw` | 空隔离浏览器 | 橙色 `#FF4500`，**无** LinkedIn 登录 |

## 一次性 Setup

### 1. 确认配置（已写入 `~/.openclaw/openclaw.json`）

```json
"browser": {
  "defaultProfile": "linkedin-jobs",
  "profiles": {
    "linkedin-jobs": {
      "cdpPort": 18802,
      "color": "#0066CC",
      "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    }
  }
}
```

**改完 config 后必须重启 Gateway**（否则 profile 不生效）。

### 2. 启动专用 Chrome

```bash
openclaw browser --browser-profile linkedin-jobs start
openclaw browser --browser-profile linkedin-jobs status
```

成功时应看到：

- `profile: linkedin-jobs`
- `transport: cdp`（不是 `chrome-mcp`）
- `running: true`

### 3. 登录（全自动 — 无需人工）

Pipeline 启动时会读取 `skills/job-applications/.env` 并自动登录：

```bash
# .env 必填
LINKEDIN_EMAIL=unojose234@gmail.com
LINKEDIN_PASSWORD=...

# 手动预检（可选）
node scripts/ensure-linkedin-login.mjs
```

Agent 运行中若 session 过期，同样 exec 上述脚本；**禁止**向用户索要密码。

首次 2FA / CAPTCHA checkpoint 仍可能需要人工在 linkedin-jobs 窗口点一次（之后 cookie 会保留）。

### 4. Preflight（每次跑 batch 前）

```bash
openclaw browser --browser-profile linkedin-jobs tabs
```

必须返回 tab 列表（非 timeout / ProfileUnavailable）。

### 5. 跑 pipeline

```bash
cd ~/.openclaw/workspace
node scripts/run-external-apply.mjs
# 续跑：node scripts/run-external-apply.mjs --session-id=linkedin-ext-XXXX
```

Pipeline 会自动 `linkedin-jobs start` + tabs preflight。

## 推荐跑法（Tier1 队列 + URL 校验）

详见 [`ATS_TIERS.md`](ATS_TIERS.md)。`append-applied-job.mjs` 会拒绝「未开 apply tab、URL 仍是 linkedin view」的 skip。

```bash
# 续跑 14/100 同一 session（先扫队列再投）
node scripts/run-external-apply.mjs \
  --session-id=linkedin-ext-20260531-1521 \
  --preflight-scan --from-queue --target=100

# 仅 Tier1（默认）；若要 Rippling 等 Tier2：
#   --include-secondary
```

## 长跑维护

- 每 **25–30 个 submit** 或 **~1 小时**：停 pipeline → `openclaw browser --browser-profile linkedin-jobs stop` → `start` → `tabs` 再跑
- Cookie 过期：重复「首次登录 LinkedIn」
- **不要** 在跑 batch 时手动开日常 Chrome 并混用 `profile=user`

## 故障排查

| 症状 | 处理 |
|------|------|
| `browser not running` | `openclaw browser --browser-profile linkedin-jobs start` |
| `ProfileUnavailable` / tabs 超时 | 重启 Gateway → `stop` → `start` → `tabs` |
| Agent 用了橙色浏览器 | prompt 违规；必须 `profile=linkedin-jobs` |
| 登录态丢失 | `node scripts/ensure-linkedin-login.mjs`（读 `.env` 自动登录） |

## 简历文件

跑前确认：

```bash
ls -la /tmp/openclaw/uploads/resume.pdf
```
