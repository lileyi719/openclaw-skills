#### Greenhouse 填表 Template（job-boards.greenhouse.io — 固定 copy-paste）

**仅当 apply tab URL 含 `greenhouse.io` / `gh_jid` 时使用本 template。** 含 `job-boards.eu.greenhouse.io` — DOM 与 `.io` 相同。禁止混用 Ashby placeholder。

**字段值（与 `applicant-profile.json` 一致，禁止编造）：**

| 字段 | 值 |
|------|-----|
| first_name | Yiqun |
| last_name | Xu |
| email | unojose234@gmail.com |
| phone | (929) 461-4214 |
| linkedin | https://www.linkedin.com/in/汉三-胡-780493361 |
| address | 123 Main St, San Francisco, CA 94105 |
| country | United States |
| workAuthorization | Yes / US Citizen |

**DOM（实测稳定）：** `#first_name` `#last_name` `#email` `#phone` `#job_application_linkedin_profile` `#resume`  
**变体：** 自定义问题为 `question_<数字>`（每 job 不同）；LinkedIn/City/Country 可能不是标准 id。

**🚨 禁止编造 contact info：** 只用上表值。禁止 `+calendly@gmail.com`、假 phone `555-123-4567`、编造 LinkedIn URL。

---

## 填表 Method 选择（每个 GH job 开填前 snapshot 一次）

| Method | 适用 | 核心策略 |
|--------|------|----------|
| **Method 1 — Evaluate Batch** | 标准 GH：Name/Email/Resume + 少量 text；无 react-select Location；无 iti 国家码；combobox ≤1 | Step A **一次 evaluate** 填核心 text → upload → 少量 click → Submit |
| **Method 2 — Interactive Sequential** | **复杂 GH**：react-select Location、`candidate-location-error`、iti Phone 国家码、**≥2 个** `[role=combobox]`、Chime/Sony 类多 EEO | **逐字段** click/fill/click option → **每步 snapshot**；combobox **禁止 evaluate 写 value** |

**默认 Method 1。** 满足以下**任一** → **立刻切 Method 2**（同一 job 内切换，禁止换 job）：

1. snapshot 见 `react-select` / `candidate-location` / `iti` / `iti-0__` / `Clear selections`
2. snapshot 见 **≥2** 个空 combobox（Work Auth / Sponsorship / State / Country / EEO）
3. Method 1 已 Submit **1 次**仍报 `This field is required` / `Please enter your location` / combobox 相关 error
4. Step A evaluate 的 `phone:false` 且 snapshot 见 iti 国家码按钮（不是普通 `#phone` textbox）

**Method 2 硬约束：** combobox / Location / Phone 国家码 / EEO → **一次只填 1 个字段** → snapshot 验 → 再下一个。禁止批量 evaluate 填 combobox。

---

### 🚨 禁止非法 close(apply)（wrapper 4s 监控 — 违反会 abort turn）

**唯一合法 close：** 已 append `submitted_*`（confirmation 页）**或** 同一表单 **8 轮 Submit** 仍失败 / 单 job **>15 分钟** 且 append `skipped_*`。

近完成（≤3 缺项）→ **禁止** close / skip /「too complex」换 job。Submit 报错 → fix → 再 Submit（8 轮内）。

---

### 共用前置（Method 1 & 2）

0. **若只有 `button "Apply"`、尚无表单** → click Apply → snapshot → 再填（Sony 类）
1. Cookie → Accept
2. **Method 选择**（见上表）→ 记录当前 Method
3. **Hard gate：** Name + Email 有 `value=` 后才 upload / combobox / Submit

**Success 路径（两 Method 相同）：** Submit mini-checklist → Submit → 报错 **8 轮** fix → `submitted_greenhouse` → append → `close(apply)`

---

## Method 1 — Evaluate Batch（标准 GH）

**顺序 0→9：**

1. **Step A — 核心字段 evaluate**（下方 JSON）→ **必读 return**；`phone`/`linkedin` false 可忽略（若无非 iti 变体）
2. **Step A' — snapshot 验** Name + Email 必须有 `value=` → 空则单字段 `fill`+`fields` 回退
3. **Step B — upload resume** → snapshot 验 `resume.pdf`
4. **Step C — 中间 text**（`question_*` discovery evaluate **只读** → 对 text 字段 evaluate 或 fill）
5. **Step D — Location / Phone / Country** — 仅当控件是**普通 textbox** 或 **1 个**简单 combobox；见 Step D 专节
6. **Step E — 第一个空 textarea**
7. **Step F — EEO** — radio/combobox 少时 evaluate Decline；多则 **切 Method 2**
8. **Submit mini-checklist** → Submit
9. Submit 报 combobox/location 错 → **切 Method 2** 从缺项继续（禁止 close）

**evaluate 通用 set 逻辑：** nativeInputValueSetter + `_valueTracker` + input/change/blur。

---

### Method 1 — Step A 核心字段 evaluate

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "evaluate",
    "fn": "(()=>{const set=(id,val)=>{const el=document.getElementById(id);if(!el)return false;const nat=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;if(el._valueTracker)el._valueTracker.setValue(el.value);nat.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));return el.value.length>0;};return{first:set('first_name','Yiqun'),last:set('last_name','Xu'),email:set('email','unojose234@gmail.com'),phone:set('phone','(929) 461-4214'),linkedin:set('job_application_linkedin_profile','https://www.linkedin.com/in/汉三-胡-780493361')};})()"
  }
}
```

**验 return：** `first`/`last`/`email` 任一 `false` → `fill`+snapshot → **禁止** upload。

**LinkedIn fallback（`linkedin:false`）：** evaluate 找 `input[id^=question_]` 且 label/placeholder 含 `linkedin`；或 snapshot 找 LinkedIn textbox → `fill`。

**`question_*` 发现：**

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "evaluate",
    "fn": "(()=>{const out=[];for(const el of document.querySelectorAll('input[id^=question_],textarea[id^=question_]')){const ph=(el.placeholder||'').toLowerCase();const lb=(el.labels?.[0]?.innerText||'').toLowerCase();const key=ph+' '+lb;if(/city|location|address|linkedin|url|website/.test(key)&&!el.value)out.push({id:el.id,hint:ph||lb});}return out.slice(0,8);})()"
  }
}
```

City → `San Francisco`；Address → `123 Main St, San Francisco, CA 94105`；LinkedIn → profile URL。

---

### Method 1 — Step B upload resume

```json
{
  "action": "upload",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "paths": ["/tmp/openclaw/uploads/resume.pdf"],
  "element": "#resume"
}
```

**Fallback：** 无 `#resume` / 只显示 Attach → click **Attach** 或 **Upload File** → 再 upload `#resume`；若只有 cover letter file input 先出现 → click Attach 触发 resume input。

**禁止：** `selector`、裸 upload、Attach 按钮当 upload target。

**验 success：** snapshot 见 `resume.pdf` 或 Remove；仍 Attach → 重试。

---

### Method 1 — Step C 中间字段（自上而下）

1. 空 `question_*` text（发现列表）
2. **Visa / Sponsorship combobox**（Unframe 类）→ click → 选 **No** / **I do not need sponsorship**
3. **Skills checkbox**（Unframe 类 Node.js / PostgreSQL 等）→ **click checkbox**，不是 combobox
4. **Work Authorization** → **Yes** / US Citizen / Authorized to work in the US
5. **Relocation / hybrid location**（Sony Madison 类）→ 选合理项（如 Yes willing to relocate）或第一个非空 option
6. Education combobox — 有则选
7. 每个 combobox：click → option → snapshot 验非空；失败 **≥3 次** → **切 Method 2**

---

## Method 2 — Interactive Sequential（复杂 GH — react-select / iti / 多 combobox）

**触发：** 见上文「Method 选择」。Chime（7+ combobox）、含 react-select Location 的 GH、含 iti 国家码的 GH 等均用本 Method — **不限任何公司**。

**硬约束：**

- **逐字段循环：** 填 1 个 → snapshot 验 `value=` / 选中态 → 再填下一个
- **combobox / Location / iti / EEO：** **禁止** evaluate / `nativeInputValueSetter` 写 value
- **textbox：** `fill`+`fields:[{ref,value}]` **单字段** → Tab → snapshot（禁止一次 fill 4+ 字段）
- **自上而下：** 中间 Work Auth / Sponsorship / State **先于** 底部 EEO
- **contact info：** 只用顶部表格值 — **禁止编造**

### Method 2 — Step M0 枚举空字段（只读）

```json
{
  "action": "act",
  "target": "host",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "evaluate",
    "fn": "(()=>{const out=[];const add=(kind,label,extra='')=>out.push({kind,label:label.slice(0,80),...extra});for(const el of document.querySelectorAll('[role=\"combobox\"]')){const label=(el.labels?.[0]?.innerText||el.getAttribute('aria-label')||'').trim();const val=(el.value||el.textContent||'').trim();if(!val||/select|choose|start typing/i.test(val))add('combobox',label);}for(const el of document.querySelectorAll('input[id^=question_],textarea[id^=question_]')){if(!el.value)add('text',(el.labels?.[0]?.innerText||el.placeholder||el.id));}if(document.querySelector('.candidate-location-error,.react-select--error'))add('location','Location (react-select)',{error:true});if(document.querySelector('.iti'))add('phone_country','Phone country (iti)',{});return out.slice(0,20);})()"
  }
}
```

按返回清单**从上到下**逐项处理；每项处理完 **snapshot** 再下一项。

### Method 2 — 字段类型填法（逐项）

| kind / label 含 | 填法 | 目标值 |
|-----------------|------|--------|
| **Location** / react-select / city | **D2** — click → type → **click option** | San Francisco, CA, United States |
| **Phone country** / iti | **D1** — 先 US (+1) → 再 fill `#phone` | United States (+1) → `(929) 461-4214` |
| **Country** | type `United States` → click option | United States |
| **State** / Province | type `California` → click option | California |
| **Sponsorship** / visa | click combobox → click **No** / do not need sponsorship | No |
| **Work Authorization** / eligible | click → **Yes** / Authorized / US Citizen | Yes |
| **Where are you located**（大洲） | **D3** — click **Americas** | Americas |
| **Gender / Race / Veteran / Disability** | click → **Decline** / Prefer not to answer | Decline |
| text / LinkedIn / Address / Zip | 单字段 `fill`+`fields` → Tab → snapshot | 见顶部表格 |
| textarea / cover letter | 单字段 fill → snapshot | 短 cover 或 address |

**单字段 fill 示例（Method 2 — 每次只填 1 个 ref）：**

```json
{
  "action": "act",
  "targetId": "apply",
  "profile": "linkedin-jobs",
  "request": {
    "kind": "fill",
    "fields": [{"ref": "e12", "value": "unojose234@gmail.com"}]
  }
}
```

→ Tab → snapshot 验 email `value=` → 再填 phone / LinkedIn / 下一 combobox。

### Method 2 — 循环直到清单清空

1. M0 枚举 → 取第一个空项
2. 按上表填 **1 项** → snapshot
3. 若 Submit 前清单仍非空 → 回到 1
4. **Submit mini-checklist** → Submit
5. 报错 → 读 error 字段 → 只重填报错项（仍 Method 2 单字段）→ Submit — **8 轮**

**禁止：** Method 2 中途改回 Method 1 evaluate 批量填 combobox；禁止因「too complex」skip（须 8 轮）。

---

### Step D — Phone 国家码 / Location / Where located（Method 1 简单情况 + Method 2 必用 — 禁止混用）

| 字段 | 控件类型 | 正确答案 | 填法 |
|------|----------|----------|------|
| **Phone 国家码** | iti 搜索下拉 | **United States (+1)** | 见下方专节 — **先于** `#phone` 填号码 |
| **Location (City)*** | 城市 autocomplete | San Francisco, CA, United States | type → **click option** |
| **Country combobox** | 国家下拉 | United States | type → **click option** |
| **Where are you located?** | **大洲** combobox | **Americas** | **click Americas** — **不是** San Francisco |

**共同规则（所有 combobox）：** `type` 只是过滤列表 → **必须 click listbox 里的 option** → snapshot 验 combobox 已显示选中值。只打字不点 option = **未填**。

---

#### D1 — Phone 国家码（iti — HeyGen / Peregrine 类，Submit 常卡在这里）

DOM：`#country` 按钮 / flag · 搜索框 `iti-0__search-input` · 列表项 `United States` (+1)

**顺序（硬约束）：先国家码，后号码**

1. click 国家码按钮（flag / `+1` / `#country`）→ 打开下拉
2. click 搜索框 → type `United States`（过滤列表）
3. **click** 列表中 **「United States」** 那一行 option（含 +1）
4. snapshot 验：按钮显示 `United States` 或 `+1`；下拉已关闭
5. **然后** 才 fill `#phone` → `(929) 461-4214`

**禁止：**
- 只在搜索框打字不点 option
- evaluate 改 hidden `<select>`（React 不认）
- 先填 phone 再选国家码
- 把国家码当成 Location (City)

**失败 3 次：** snapshot 找 `United States` option 的 ref → `click`；仍失败 → type `United States` → ArrowDown → Enter → 再 snapshot 验

---

#### D2 — Location (City)*（城市 autocomplete）

1. click combobox → type `San Francisco, CA` 或 `San Francisco, California, United States`
2. **click** 含 San Francisco 的 **option**（只 type = 仍报 `Please enter your location`）
3. snapshot 无 `candidate-location-error`

---

#### D3 — Where are you located?（大洲 combobox — 表单最后一题常见）

label 含 `Where are you located` / `where are you located` — **不是** Location (City)。

选项为 **Americas · Asia · Europe · Africa**（或类似大洲），**不是** 城市名。

**正确答案：`Americas`**（San Francisco 在北美 → Americas）

1. click 该 combobox
2. **click** listbox option **`Americas`**（若需搜索：type `Americas` → **click option**）
3. snapshot 验 combobox 显示 `Americas` — **禁止** 留空或显示自由文本 `San Francisco`

**禁止：** 对这道题 type `San Francisco` / `United States` / `San Francisco, CA`

---

#### D4 — Country combobox（Northbeam 类）

type `United States` → **click option** → 验无 `Clear selections` 报错

**禁止** Location/Country/Phone/Where located 仍报错时 Submit / close /「too complex」。纳入 **8 轮**。

---

### Step E — Cover letter / Address textarea

第一个空 `textarea`：短 cover 或 `123 Main St, San Francisco, CA 94105`。

---

### Step F — EEO（Sony / Chime 类 — Submit 前全部填完；≥3 个 combobox 时用 Method 2 逐个点）

**禁止**只填 Gender 就 Submit 然后 close。第一次 Submit 前逐个处理：

```
Gender Identity / pronouns / Sexual Orientation / Hispanic/Latinx /
Race/Ethnicity / Veteran / Disability → Decline / Prefer not to answer / I don't wish to answer
```

每个 combobox：click → click option → 验无 `*-error`。

Submit 后仍有 error → evaluate 扫 `*-error` → fix → Submit — **最多 8 轮**，单 job **15 分钟**。

---

### Submit 成功 + append

**成功标志（任一）：**

- URL 变为 `.../confirmation`（Unframe / Northbeam 类 — **append 优先用此 URL**）
- 正文含 `Thank you for applying` / `We've received your application`
- 表单消失 + 确认文案

```bash
node scripts/append-applied-job.mjs '{"status":"submitted_greenhouse","platform":"greenhouse","company":"COMPANY","url":"https://job-boards.greenhouse.io/SLUG/jobs/ID/confirmation"}'
```

base URL duplicate 时试 **`/confirmation`** 路径。append 成功 → **然后** `close(apply)`。

---

### Submit mini-checklist（Submit 前必过 — Method 1 & 2）

- [ ] Name + Email 有 value（**表格邮箱**，非编造 alias）
- [ ] Resume 已上传（非 Attach）
- [ ] Phone = `(929) 461-4214`；若 iti → 国家码 **United States (+1)** 已 **click option** 选中
- [ ] Location (City) 无 `candidate-location-error`（react-select 须显示选中城市，非 placeholder）
- [ ] Sponsorship **No** + Work Auth **Yes**（若有）
- [ ] **Where are you located?** = **Americas**（若存在 — 不是 San Francisco）
- [ ] Country / State combobox 已 **click option**（若有）
- [ ] **全部 EEO combobox 已 Decline**（Method 2 逐个填完）
- [ ] Skills checkbox 已 tick（若有）
- [ ] 中间 `question_*` required 无空

→ Submit → **最多 8 轮** fix → `submitted_greenhouse`

**近完成（≤3 缺项）：** 禁止 skip / close；**15 分钟**内 8 轮 fix+Submit。Method 1 报错 combobox → **切 Method 2** 继续，勿 close。
