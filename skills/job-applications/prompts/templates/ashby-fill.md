#### Ashby 填表 Template（jobs.ashbyhq.com — 固定 copy-paste）

**仅当 apply tab URL 含 `ashbyhq.com` / `?ashby_jid=` 时使用本 template。** 禁止混用 Greenhouse id。

**字段值（与 `applicant-profile.json` 一致，禁止编造）：**

| 字段 | 值 |
|------|-----|
| name | Yiqun Xu |
| email | unojose234@gmail.com |
| phone | (929) 461-4214（optional） |
| linkedin | https://www.linkedin.com/in/汉三-胡-780493361 |
| location | San Francisco, California, United States |
| salary | 200000（或 Open / Negotiable） |
| sql_default | Yes, I have experience writing SQL queries for data analysis. |

**DOM（system 字段稳定）：** `#_systemfield_name` `#_systemfield_email`（可选 `#_systemfield_phone`）  
**变体：** LinkedIn = UUID `input[type=url]`；Resume = `#_systemfield_resume` 或匿名 `input[type=file]`；essay = UUID textarea。

---

### 🚨 禁止非法 close(apply)（wrapper 4s 监控 — 违反会 abort turn）

**唯一合法 close：** 已 append `submitted_*` **或** 8 轮 Submit 仍失败 / 单 job **>15 分钟** 且 append `skipped_*`。

近完成 → **禁止** close /「too complex」换 job。

Submit 报 `Please enter your location` / `candidate-location-error` / `This field is required` 后 **0～7 轮内 close** → wrapper **abort turn**（`close_after_submit_errors`）。

---

### 填表顺序（硬约束 — 线性 0→13）

0. **若在 Overview tab** → click **Application** 或 **Apply for this Job** → snapshot 见 Name*/Email*（Turquoise 类）
1. Cookie → Accept
2. **Step A — React 优先 `fill`** Name* / Email* → Tab → snapshot
3. **Step A' — evaluate 补强** `_systemfield_*` + UUID 字段发现（**禁止** evaluate 填 Location combobox）
4. **Step B — upload resume**（fallback 链）→ snapshot 验文件名
5. **Step B' — post-upload 重填**（Autofill 常清空 Location / Work Authorization → **必须**重跑 Step C + C2）
6. **Step C0 — combobox 清单** snapshot 枚举 **全部** `[role="combobox"]`（禁止只 `querySelector` 第一个）
7. **Step C — Location combobox**（browser click → type → **click option**）
8. **Step C2 — Work Authorization / Sponsorship**（与 Location **分开**填）
9. **Step D — 自定义 UUID 字段**（LinkedIn / SQL / salary / location radio+Other）
10. **Step E — Essay / required textarea**（`fields:[{ref,value}]`）
11. **Step F — SMS No + EEO Decline**
12. **Submit mini-checklist** → Submit → 失败走 **Missing Location 8 轮**
13. **Success** → append → **然后才** close

**Hard gate：** Name 或 Email 空 → **禁止** upload / location / EEO / Submit。

---

### Step 0 — Overview → Application（Turquoise 类）

snapshot 若见 **Overview** 选中、无 Name*/Submit → click **Application** tab 或 **Apply for this Job** → 再 snapshot。

---

### Step A — React 优先 fill

1. snapshot 找 Name* / Email* ref
2. `fill`+`fields` → `Yiqun Xu` / `unojose234@gmail.com` → **Tab** → snapshot 验 `value=`
3. 仍空 → click → Meta+a → fill → Tab

---

### Step A' — evaluate 补强 + UUID 发现

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "evaluate",
    "fn": "(()=>{const set=(id,val)=>{const el=document.getElementById(id);if(!el)return false;const nat=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;if(el._valueTracker)el._valueTracker.setValue(el.value);nat.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));return el.value===val;};const li=document.querySelector('input[type=url],input[placeholder*=\"linkedin\" i],input[placeholder*=\"example.com\" i]');const liOk=li&&li.id?set(li.id,'https://www.linkedin.com/in/汉三-胡-780493361'):false;const ph=document.getElementById('_systemfield_phone');const phOk=ph?set('_systemfield_phone','(929) 461-4214'):'skip';const custom=[];for(const el of document.querySelectorAll('input[id][type=text],textarea[id]')){const t=((el.labels?.[0]?.innerText||'')+(el.placeholder||'')).toLowerCase();if(/sql|query|database/.test(t)&&!el.value)custom.push({id:el.id,kind:'sql'});if(/salary|compensation/.test(t)&&!el.value)custom.push({id:el.id,kind:'salary'});}return{name:set('_systemfield_name','Yiqun Xu'),email:set('_systemfield_email','unojose234@gmail.com'),phone:phOk,linkedin:liOk,linkedinId:li?li.id:null,custom};})()"
  }
}
```

**验 return：** `name`/`email` false → 回 Step A；`phone` skip/false 可忽略。

**禁止：** 用 evaluate / `nativeInputValueSetter` 填 **Location combobox** 或 **Work Authorization** — React 不认，Submit 仍报 location required（Onyx Bio / Quindar log 已验证）。

---

### Step B — upload resume（双 file input + Autofill 陷阱）

**2 个** `input[type=file]` → index 0 常为 **Autofill** → **禁止** upload / **禁止** click Autofill 按钮；用 `#_systemfield_resume` 或 **第二个**。

按序：`#_systemfield_resume` → `input#_systemfield_resume` → `:last-of-type` → `:nth-of-type(2)`

```json
{
  "action": "upload",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "paths": ["/tmp/openclaw/uploads/resume.pdf"],
  "element": "#_systemfield_resume"
}
```

验 success：见 `resume.pdf` 或 Remove。

**Upload 失败 8 轮（OpenAI / Baseten / Ataraxis log 高频 — 比 location 更常见）：**

1. 确认文件存在：`/tmp/openclaw/uploads/resume.pdf`（pipeline 启动时会 sync）
2. **禁止** click Autofill 按钮 / 第一个 file input
3. `#_systemfield_resume` upload → snapshot
4. 仍 Attach → click **Upload** / **Attach** 按钮 → 再 upload 同一 element
5. `scrollIntoView` resume 区 → upload `:nth-of-type(2)`
6. 等 1s → snapshot 验文件名
7. 仍失败 → evaluate 只读：`document.querySelectorAll('input[type=file]').length`（应有 2，用 index 1）
8. 满 8 轮 → `skipped_incomplete` reason `ashby_resume_upload_failed` → 才 close

**禁止：** upload 失败后直接 Submit / close /「too complex」。

**🚨 Autofill 副作用（log 高频）：** 误触 Autofill 或 upload 后 Ashby autofill 跑完 → **Location combobox 变空**、**Work Authorization 被清** → **禁止**直接 Submit；必须执行 **Step B'**。

---

### Step B' — post-upload 重填（Autofill 后必做）

1. snapshot 查 Location combobox 是否仍显示 `San Francisco, California, United States`（或选中态，非 placeholder `Start typing`）
2. 查 Work Authorization / visa sponsorship 是否仍选 **No**
3. 任一为空 → **重跑 Step C0 → C → C2**（不要只重填 Location 就 Submit）

---

### Step C0 — combobox 清单（禁止只填第一个）

snapshot 或 evaluate **只读枚举**（不写 value）：

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "evaluate",
    "fn": "(()=>{const out=[];for(const el of document.querySelectorAll('[role=\"combobox\"]')){const label=(el.labels?.[0]?.innerText||el.getAttribute('aria-label')||el.placeholder||'').trim().slice(0,80);const val=(el.value||el.textContent||'').trim().slice(0,60);out.push({label,val,empty:!val});}return out;})()"
  }
}
```

**逐个处理清单里每一个空 combobox**，按 label 匹配下表 — **禁止** `querySelector('[role=combobox]')` 只填第一个就 Submit。

| label 含 | 类型 | 正确答案 | 填法 |
|----------|------|----------|------|
| Location / Start typing / city | **城市** autocomplete | San Francisco, California, United States | Step C1 |
| Work Authorization / authorized to work | **授权** dropdown/button | **Yes** / Authorized / US Citizen | Step C2 |
| visa / sponsorship / require sponsorship | **签证** | **No** | Step C2 |
| Where are you located（大洲） | **大洲** combobox | **Americas** | type `Americas` → click option |
| Country | 国家 | United States | type → click option |

**共同规则：** `type` 只是过滤 → **必须 click listbox option** → snapshot 验 combobox **已显示选中值**。只打字 / evaluate 注入 = **未填**（wrapper 报 `Location (City) — 须 click 下拉 option`）。

---

### Step C1 — Location combobox（主 Location — browser 交互，禁止 evaluate）

**标准流程（Onyx Bio 成功路径）：**

1. snapshot 找 Location / `Start typing` combobox 的 **ref**
2. **click** combobox → 打开 listbox
3. **type** `San Francisco, California, United States`（或 `San Francisco, CA`）
4. **click** listbox option（含 **California** + **United States**；**禁止** Mexico / 其他国家）
5. snapshot 验：combobox 显示完整选中值；**无** `Please enter your location` / `candidate-location-error`

**失败 ≥3 次换策略：**

- click combobox → type `San Francisco, CA` → ArrowDown → Enter → snapshot
- scrollIntoView combobox → 重复 click → type → click option ref
- 仍失败 → 纳入 **Missing Location 8 轮**，**禁止** close / skip

**禁止：**

- evaluate / `nativeInputValueSetter` / `dispatchEvent(input)` 填 Location
- 只 type 不 click option
- 把 Work Authorization 当成 Location 跳过

---

### Step C2 — Work Authorization / Sponsorship（与 Location 分开 — Onyx Bio 类）

Ashby 常见：**Work Authorization Status** 是 `<button>` 包 dropdown/radio，**不是** Location combobox。

1. snapshot 找 label 含 `Work Authorization` / `authorized to work` / `visa sponsorship` 的控件
2. **click** 该 button / combobox 打开选项
3. **Work Authorization** → click **Yes** / Authorized to work in the US
4. **Visa sponsorship** → click **No** / I do not require sponsorship
5. snapshot 验：button 文本已变（非空 placeholder）；**不是**只点了 button 没选 option

**失败：** snapshot 找 `No` / `Yes` option 的 ref → `click`；禁止 evaluate 改 hidden input。

**顺序：** 先 C1 Location，再 C2 Work Authorization（Autofill 后两者都可能被清）。

---

### Step D — 自定义 UUID / FutureFit 类

| 类型 | 填法 |
|------|------|
| LinkedIn UUID | evaluate 或 fill profile URL |
| SQL / 技术题 text | `Yes, I have experience writing SQL queries for data analysis.` |
| Salary | `200000` 或 `Open` |
| Location **radio + Other** textbox | click **Other** → fill `San Francisco, California, United States`（**与** Step C1 combobox **是不同字段**，两个都要填） |
| Preferred First Name / Pronouns | **optional**，可跳过 |

---

### Step E — Essay（必须用 `fields` 数组）

**短 essay：** snapshot 找 textarea ref →

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "fill",
    "fields": [
      {
        "ref": "eREF",
        "value": "I am excited about this role and believe my experience in software engineering is a strong fit."
      }
    ]
  }
}
```

**长 essay / Why AI / Why us（Turquoise 类）：** 2–3 句含公司名，`fields:[{ref,value}]` — **禁止** bare fill 无 fields。

---

### Step F — SMS / EEO

- SMS / marketing → **No**
- Gender / Ethnicity / Veteran → **radio Decline** 或 Prefer not to answer（Turquoise 用 radio，不是 combobox）

（Sponsorship / Work Authorization 已在 **Step C2** 处理。）

---

### Missing Name — 8 轮重试

1. fill Name/Email → Tab → snapshot
2. Step A' evaluate
3. click Name → Meta+a → fill → Tab
4. snapshot → Submit
5. fill LinkedIn → Tab → Submit
6. 等 1s → Submit
7. 重跑 Step B upload → **Step B' post-upload 重填**
8. Step C0 → C1 Location → C2 Work Auth → Submit

---

### Missing Location — 8 轮重试（Submit 报 location / required 时）

Submit 后 snapshot 仍见 `Please enter your location` / `*-error` / Location 空 → **禁止 close**，按序轮换：

1. Step C0 重新枚举 **全部** combobox → 记下仍空的 label
2. Step C1：click Location ref → type → **click option** → snapshot
3. Step C2：Work Authorization / Sponsorship 重选
4. Step D：Location radio **Other** + textbox（若有）
5. Step B'：若刚 upload/autofill → 重填 C1+C2
6. scrollIntoView 缺项 → click option ref（不用 evaluate）
7. type `San Francisco, CA` → ArrowDown → Enter
8. 仍失败 → append `skipped_incomplete` reason 含 **哪些 location 字段仍空** → 才 close

**禁止：** 0～1 轮就「too complex / move on」close（wrapper `forbidden_close_too_complex`）。

---

### Submit 成功 + append

**成功标志：**

- 正文 `Success` / `Your application was successfully submitted`
- 表单字段消失，只剩公司链接

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_ashbyhq","platform":"ashbyhq","company":"COMPANY","url":"https://jobs.ashbyhq.com/SLUG/UUID/application"}'
```

用 **无 utm** 的 application URL。duplicate → 不计入 run，继续下一 job。append 成功 → **然后** close。

---

### Submit mini-checklist（逐项 snapshot 验 — 不是「看起来填了」）

- [ ] Name* + Email* 有 value
- [ ] Resume 已上传（`resume.pdf` / Remove）
- [ ] **Location combobox** 显示选中城市（非 `Start typing` placeholder）
- [ ] **Location radio + Other** 已填（若有该题）
- [ ] **Work Authorization** 已选 Yes/Authorized（若有）
- [ ] **Visa sponsorship** 已选 No（若有）
- [ ] Step C0 清单里 **无空 combobox**
- [ ] SQL / salary / essay required 非空
- [ ] 无 `Please enter your location` / `candidate-location-error`

→ **最多 8 轮**（Missing Location）→ `submitted_ashbyhq`

**近完成：** 禁止 skip / close；**15 分钟**内 8 轮。

---

### Timeout 恢复（Turquoise 类）

browser tool timeout 后：**禁止 close**。`tabs` → focus apply tab → snapshot → 从缺项（**Step C0 枚举** → Location / Work Auth / essay / EEO）继续 → Submit。
