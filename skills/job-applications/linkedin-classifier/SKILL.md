# LinkedIn Job Classifier

## 方式 A — 脚本搜索（推荐）

搜索职位 **用脚本**，不用 browser。

```bash
node scripts/write-scan-config.mjs --target=external --keywords="Software Engineer" --location="United States" --limit=15 --pages=3
export PIPELINE_NON_INTERACTIVE=1
export LINKEDIN_EMAIL=unojose234@gmail.com LINKEDIN_PASSWORD=${LINKEDIN_PASSWORD}
node scripts/run_job_pipeline.mjs --phase=all
```

| 用户指令 | `--target` | 写入 | 另一文件 |
|----------|------------|------|----------|
| EXTERNAL JOBS | `external` | `external_apply_jobs.json` | `easy_apply_jobs.json` → `[]` |
| EASY APPLY | `easy_apply` | `easy_apply_jobs.json` | `external_apply_jobs.json` → `[]` |
| 都要 | `all` | 两个都写 | — |

脚本会按 `scan_config` 翻页、跳过错误类型、写 JSON。详见 [`../../scripts/scan_linkedin_jobs.mjs`](../../scripts/scan_linkedin_jobs.mjs)。

---

## 方式 B — Browser 搜索（可选）

仅当脚本不可用（验证码、登录失败）时用 browser，步骤见下文「Browser 扫描步骤」。

---

## 指令解析（两种方式通用）

执行前先 `write-scan-config.mjs` 或维护 [`../scan_config.json`](../scan_config.json)。

---

## Browser 扫描步骤（方式 B）

```bash
node scripts/pipeline-heartbeat.mjs --stage=scan --step=linkedin --message="扫描" --interval=15 &
```

1. `browser.open url="<search_url>" target="host"`
2. **external**：关 Easy Apply 筛选；**easy_apply**：开启 Easy Apply
3. 改关键词/地点 → Enter
4. 遍历卡片：external 跳过带 Easy Apply 的卡片；点开外链取 URL
5. 点 **Next** 翻页
6. 按 `scan_target` 写 JSON（规则同方式 A）
7. `node scripts/run_job_pipeline.mjs --phase=prepare`

---

## 投递（与扫描无关）

扫描完成后，**申请职位必须用 browser**，见：

- [`../easy-apply/SKILL.md`](../easy-apply/SKILL.md)
- [`../external-apply/SKILL.md`](../external-apply/SKILL.md)
- [`../workday-apply/SKILL.md`](../workday-apply/SKILL.md)

**禁止**用脚本投递。
