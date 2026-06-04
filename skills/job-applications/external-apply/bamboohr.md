# BambooHR — External Apply 填表备忘

**平台识别：** apply URL 含 `bamboohr.com`（如 `*.bamboohr.com/careers/`）。

**通用规则仍适用：** [`../BROWSER_HUMAN.md`](../BROWSER_HUMAN.md)、[`SKILL.md`](SKILL.md)、[`../applicant-profile.json`](../applicant-profile.json)。

## 首次 snapshot 后

1. 若出现 **external assessment / completion code**（必填测评码）→ **整单 skip**（见 [`SKILL.md`](SKILL.md)「硬性 skip」），勿填表。
2. 若出现 **reCAPTCHA** 且无法自动完成 → skip（`skipped_captcha`）。

## 填表顺序（仅无 external assessment 时）

字段值 **只读** `applicant-profile.json`，禁止模型编造。

1. First / Last / Email / Phone（常已预填，缺则补）
2. Address → City → **State 下拉**：`click` State 按钮 ref → `snapshot` → `click` menuitem ref（如 `12_7`，**禁止** uid `"California"`）
3. ZIP
4. Resume（已有 `resume.pdf` 则跳过）
5. **Date Available**：优先点 `"Pick a date"` ref → `snapshot` → 选 Month / Year / Day ref；禁止手打四位年份。默认值用 `applicant-profile.json` 的 `dateAvailable`
6. LinkedIn URL → `applicant-profile.json` 的 `linkedinUrl`
7. **Submit 前** `snapshot`，确认无 `Please fill in this field` / `Please make a selection`
8. 最后 `click` Submit 的 ref（如 `8_34`）

## 已知坑（PhoneBurner 等）

- `Element uid "Submit Application" not found` → 必须用 snapshot ref，勿用按钮文字
- State 菜单展开后 ref 前缀会变（如 `12_7`），开菜单后必须 re-snapshot
- 过早点 Submit 只会触发表单校验，不会提交成功
