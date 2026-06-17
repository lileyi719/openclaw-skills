# ClearCompany — MASTER Apply

## §1 识别

| URL 模式 | 示例 |
|----------|------|
| `*.clearcompany.com/careers/jobs/*/apply` | Ad Hoc LLC `adhoc.clearcompany.com` |
| Redirect from corp careers → ClearCompany HRM | 「START YOUR APPLICATION」入口 |

## §2 Resume upload（jQuery File Upload widget）

ClearCompany 使用 **hidden** `<input type=file>`（0×0）+ 可见「+ Upload」按钮。**禁止 click 按钮。**

### 协议（按序，最多 3 轮）

**Round A — 直接 CDP upload**

1. evaluate 找 file inputs：
```javascript
() => Array.from(document.querySelectorAll('input[type=file]')).map((el, i) => ({
  i, id: el.id, name: el.name, accept: el.accept,
  w: el.offsetWidth, h: el.offsetHeight
}))
```
2. 第一个 input 通常是 **Resume**（index 0 或 accept 含 pdf/doc）
3. `upload` + `inputRef` = **id**（若有）或 evaluate 返回的 index 对应 ref
4. 只读 evaluate 验：`document.querySelectorAll('input[type=file]')[0].files[0]?.name` → 含 `resume`

**Round B — unhide 再 upload（仍禁止 click 按钮）**

1. evaluate（仅改 CSS，不 click）：
```javascript
() => {
  const el = document.querySelectorAll('input[type=file]')[0];
  if (!el) return 'no input';
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  return el.id || el.name || 'ok';
}
```
2. 立刻 `upload` + `inputRef` = 上一步 id/name 或 `[0]` index ref
3. evaluate 触发 change（不注入 File）：
```javascript
() => {
  const el = document.querySelectorAll('input[type=file]')[0];
  if (!el?.files?.length) return 'empty';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.files[0].name;
}
```

**Round C — 换 input index**

- 若有 3 个 file input（resume / cover / additional），逐个试 index 0→1→2（仍用 upload，不 click）

**失败判定：** 3 轮后 `files[0]` 仍空 → `skipped_incomplete` reason `clearcompany resume upload failed`

## §3 Page 1 Continue（AJAX SPA）

- fill 后 snapshot 验各字段 value
- click **Continue** ref（不是 Evaluate submit）
- 若 URL 不变且无 error banner → 再 click Continue（第 2 轮）
- 仍卡住 → snapshot 找 validation message → 补填 → 再 Continue

## §4 凭据

| 字段 | 值 |
|------|-----|
| Email | `unojose234@gmail.com` |
| Password | 仅当 portal 要求 Create Account 时用 **`Waibao1234567Go!`** |
| First/Last/Phone | 见 `applicant-profile.json` |

## §5 成功 & append

确认页含 **Thank you** / **application received** / 回到 careers 成功态：

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_clearcompany","platform":"clearcompany","company":"...","url":"https://....clearcompany.com/.../apply"}'
```

OPEN_ALLOWLIST=1 时 append 脚本接受 custom platform。
