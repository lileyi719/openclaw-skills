# UltiPro / UKG Apply — Browser 填表

**路径：** `skills/job-applications/ultipro-apply/`

**触发：** apply tab URL 含 `recruiting.ultipro.com` 或 `recruiting2.ultipro.com`。

**必读：** [`MASTER_apply.md`](MASTER_apply.md) + [`../applicant-profile.json`](../applicant-profile.json)

## 流程摘要

1. `snapshot(apply)` → skip 检查
2. **Create Account / Sign In**（常见）→ 统一凭据 **`Waibao1234567Go!`**
3. 多页 wizard：`fill` 填 text → **click** radio/dropdown option → **Next**
4. Resume：`upload` + **`element`**（禁止 click Attach）
5. Review → **Submit**
6. append `submitted_ultipro`

## 禁止

- 零尝试 `skipped_platform`
- Workday 打字协议用于 UltiPro（UltiPro **用 fill**）
- `LINKEDIN_PASSWORD` 填 UltiPro 注册
- click 上传按钮
