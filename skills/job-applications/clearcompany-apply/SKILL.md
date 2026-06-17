# ClearCompany Apply — Browser 填表

**触发：** apply tab URL 含 `clearcompany.com/careers` 或 `*.clearcompany.com/.../apply`

**必读：** [`MASTER_apply.md`](MASTER_apply.md) + [`../applicant-profile.json`](../applicant-profile.json)

## 流程摘要

1. `snapshot(apply, interactive=true)` → 若有 **START YOUR APPLICATION** → click 开始
2. Page 1：fill First Name / Last Name / Email / Mobile Phone（统一凭据 email）
3. 若有 SMS/texting consent radio → 选 **No** 或最保守选项
4. click **Continue** → snapshot 验进入下一页（若仍卡 Page 1 → 用 ref click Continue，最多 2 轮）
5. **Resume（关键）** — 见 MASTER §2；**禁止 click** 「+ Upload」/「Choose File」
6. 填完必填 → Submit / Continue 至确认页
7. append `submitted_clearcompany`（open-allowlist run）或 `submitted` + platform clearcompany

## 禁止

- click 「+ Upload」/「Choose File」/「Browse」（jQuery widget 会弹 Finder 或 timeout）
- evaluate 注入 File / jQuery fileupload XHR payload
- upload 失败后 click 上传按钮重试
- 因 upload timeout 立刻 skip（须走完 MASTER §2 的 3 步 unhide 协议）

## Skip 门槛

- Resume upload **3 轮**（含 unhide evaluate + CDP upload）仍失败 → `skipped_incomplete` reason `clearcompany resume upload failed`
- Continue/Submit **2 轮**仍卡同一页 → `skipped_incomplete`
