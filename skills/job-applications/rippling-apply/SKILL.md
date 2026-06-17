# Rippling Apply — Browser 填表

**路径：** `skills/job-applications/rippling-apply/`

**触发：** apply tab URL 含 `ats.rippling.com` 或 Rippling job apply 路径。

**必读：** [`MASTER_apply.md`](MASTER_apply.md) + [`../applicant-profile.json`](../applicant-profile.json)

## 流程摘要

1. `snapshot(apply, interactive=true)`
2. `fill` Name/Email/Phone/LinkedIn
3. **SMS consent / radio** → **click ref**（禁止 type/evaluate）
4. Apply `[disabled]` → 补必填 → 再 click Apply
5. 可选 resume：`upload` + `element`（禁止 click Browse）
6. append `submitted_rippling`

## 禁止

- 不点 radio 就 Submit
- `evaluate` click radio
- click 上传按钮
- 零尝试 skip Rippling
