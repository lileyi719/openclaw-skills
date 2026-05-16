# JOB APPLICATION ORCHESTRATOR

## 总览

三步流程：
1. **LinkedIn 搜索 + 分类** → `linkedin-job-classifier/SKILL.md`
2. **判断 apply 类型** → 走对应分支
3. **执行申请** → `external-apply/SKILL.md` 或 `workday-apply/MASTER_apply.md`

```
用户提供搜索条件（关键词、地点、URL）
        │
        ▼
┌───────────────────────────────┐
│   linkedin-job-classifier     │
│   SKILL.md                    │
│                               │
│   输出到 workspace:            │
│   easy_apply_jobs.json        │
│   external_apply_jobs.json    │
└───────────┬───────────────────┘
            │
     ┌──────┴──────┐
     ▼              ▼
easy_apply     external_apply
     │              │
     ▼              ▼
 EasyApplyBot   ┌─────────────────────────────┐
 (通知用户)     │ 检查 external_url 平台类型    │
               │                             │
               │ workday? → workday-apply/   │
               │             MASTER_apply.md  │
               │                             │
               │ ashby/jazzhr/lever/other →  │
               │   external-apply/SKILL.md   │
               └─────────────────────────────┘
```

## 文件引用路径（统一用 workspace 绝对路径）

所有文件路径均相对于 workspace 根目录：

### 核心文件
- **Orchestrator**: `skills/job-applications/ORCHESTRATOR.md`（本文件）
- **Classifier**: `skills/job-applications/linkedin-job-classifier/SKILL.md`
- **External Apply**: `skills/job-applications/external-apply/SKILL.md`
- **Workday Apply**: `skills/job-applications/workday-apply/MASTER_apply.md`
- **Workday Batch**: `skills/job-applications/workday-apply/BATCH_apply.md`
- **Extractor**: `skills/job-applications/extractor.js`
- **Resume**: `skills/job-applications/resume.txt`

### 数据输出（均在 workspace 下）
- `skills/job-applications/easy_apply_jobs.json`
- `skills/job-applications/external_apply_jobs.json`
- `skills/job-applications/batch_progress.json`
- `skills/job-applications/applied_jobs.json`

## 执行步骤

### STEP 1: 搜索 LinkedIn 并分类
按照 `linkedin-job-classifier/SKILL.md` 执行：
1. 打开 LinkedIn 工作搜索页面（需已登录）
2. 扫描工作列表，识别 Easy Apply vs External Apply
3. 将 external apply 工作的 external URL 提取出来
4. 输出两个 JSON 文件：
   - `easy_apply_jobs.json`
   - `external_apply_jobs.json`

### STEP 2: 处理 Easy Apply 工作 — 调用 EasyApplyBot
- 读取 `easy_apply_jobs.json`
- EasyApplyBot 路径：`~/Desktop/EasyApplyBot/`
- 调用方式：
  ```bash
  cd ~/Desktop/EasyApplyBot && python main.py
  ```
- config.yaml 已配置好简历路径、搜索条件、个人信息"以下 X 个工作是 Easy Apply，可以通过 LinkedIn 一键申请"
- 由用户/后续脚本通过 EasyApplyBot 或手动申请

### STEP 3: 处理 External Apply 工作
- 读取 `external_apply_jobs.json`
- 对每个工作的 `external_url`，检查 `platform` 字段：

| platform | 路由到 | 备注 |
|----------|--------|------|
| `workday` | `workday-apply/BATCH_apply.md` | 复杂流程，用 MASTER_apply 分步执行 |
| `ashby` | `external-apply/SKILL.md` | 简单表单 |
| `jazzhr` | `external-apply/SKILL.md` | 简单表单 |
| `bamboohr` | `external-apply/SKILL.md` | 简单表单 |
| `comeet` | `external-apply/SKILL.md` | 简单表单 |
| `lever` | `external-apply/SKILL.md` | 中复杂度（注意 Captcha） |
| `greenhouse` | `external-apply/SKILL.md` | **零成功率 — 跳过** |
| `icims` | 跳过 | **零成功率 — 跳过** |
| `other` | `external-apply/SKILL.md` | 尝试通用填表 |

> **所有文件操作使用 workspace 绝对路径**，不要使用 `~/Documents/` 或 `~/.openclaw/skills/`。

## 指令示例

用户说："帮我在 LinkedIn 上找 Sales Engineer 工作，先分类，再申请"

你的执行流程：
1. 读取并遵循 `linkedin-job-classifier/SKILL.md` 搜索分类
2. 读取输出的两个 JSON 文件
3. 对 Easy Apply 工作：汇总告知用户
4. 对 External Apply 工作：逐个打开 external_url，按平台路由到对应 skill 执行申请
