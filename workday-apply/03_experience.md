# SKILL: FILL WORK EXPERIENCE FROM RESUME

## 🎯 GOAL
Dynamically extract employment history from the applicant's resume (`./resume.txt`) and fill out the "My Experience" / "Employment History" section. Handle repeating form blocks safely using dynamic locators.

## 🚨 CRITICAL: REACT-SAFE FIELD FILLING (MANDATORY)
1. **CHAINED EXECUTION (NEW):** Do NOT stop to report progress for each job block. Fill ALL visible fields and multiple experience blocks in a single turn.
2. **BAN JS INJECTIONS:** NEVER use `browser.evaluate` to set `.value` on inputs.
3. **USE DYNAMIC SEMANTIC LOCATORS:** Scan the DOM for `aria-label` or surrounding labels.
4. **THE HUMAN-TYPING PROTOCOL:** For EVERY standard text input (Job Title, Company, Location), execute:
   - **Click:** `browser.act: target="host", kind="click", selector="<dynamic_selector>"`
   - **Clear:** `browser.act: target="host", kind="press", key="Meta+a"` then `key="Backspace"` (⚠️ **WARNING:** NO `selector` inside `kind="press"`)
   - **Type:** `browser.act: target="host", kind="type", selector="<dynamic_selector>", text="<value>", slowly=true`

## 🛑 KNOWN UI TRAPS & WORKAROUNDS

### Trap 1: Repeating Blocks & Dynamic IDs (CRITICAL)
When you click "Add Another", Workday generates random IDs (e.g., `workExperience-117`).
- ❌ **NEVER** guess or increment ID numbers mathematically.
- ✅ **ALWAYS** use Playwright `.nth()` or `.last()` locators.
  - *Example:* `selector="[aria-label='Job Title']:near(:text('Experience 2'))"` or rely on the newest block at the bottom.
- ✅ Alternatively, take a quick `browser.snapshot` AFTER clicking "Add Another" to discover the exact new dynamic labels.

### Trap 2: Masked Date Fields (Tab-to-Lock)
Workday date fields (Month/Year) reject standard inputs.
**HOW TO HANDLE:**
1. Click the date field (e.g., `selector="[aria-label*='From Month']"`).
2. Clear the existing value (Select All + Backspace).
3. Type the numerical value slowly (e.g., `05` for May).
4. **CRITICALLY:** Press `Tab` immediately after typing to lock the React state:
   `browser.act: target="host", kind="press", key="Tab"` (⚠️ **WARNING:** NO `selector` inside `kind="press"`)
5. Repeat for Year.

### Trap 3: Long Textareas (Role Description Timeouts)
Role Description fields are `<textarea>`. Using `slowly=true` on text > 100 characters causes Playwright 8-second timeouts.
**HOW TO HANDLE:**
- For textareas ONLY, use `slowly=false`:
  `browser.act: target="host", kind="type", selector="[aria-label*='Role Description']", text="<Resume_Details>", slowly=false`

### Trap 4: Company Dropdown (THE KEYSTROKE BUFFER FIX)
Some Workday instances use an autocomplete dropdown for "Company". Using `slowly=true` causes the search to break between letters.
1. Click the Company input field.
2. **TYPE FAST:** `browser.act: target="host", kind="type", selector="<dynamic_selector>", text="<Exact_Company_Name>", slowly=false` (⚠️ **MUST BE slowly=false**)
3. **WAIT 2 SECONDS.** ❌ **DO NOT PRESS ENTER.**
4. ✅ **PHYSICAL CLICK:** Click the specific text match: `browser.act: target="host", kind="click", element="text=<Exact_Company_Name>"`

## 🗂️ DATA EXTRACTION RULES
Read the applicant's resume (`workday-apply/resume.txt`). Extract:
- Job Title
- Company Name
- Location (City/State)
- Start Date (Month/Year) & End Date (Month/Year, or check "I currently work here")
- Role Description (Bullet points)

## 🛠️ EXECUTION WORKFLOW
1. **Read Resume**: Identify the top 3 most relevant or recent roles to add.
2. **First Role Block**: The first block is usually open by default.
   - Use the Human-Typing Protocol (Click -> Clear -> Type).
   - Use the Tab-to-Lock method for Dates.
   - For current job: `browser.act: target="host", kind="click", selector="label:has-text('I currently work here')"`
   - Fill Role Description using `slowly=false`.
3. **Additional Roles**:
   - Dynamically click "Add" / "Add Another".
   - **WAIT 2 SECONDS** for the new React block to render.
   - Rescan the DOM or use `.last()` locators (See Trap 1).
   - Repeat the fill process for up to 3 roles.
4. **Save & Continue**:
   - Click `element="text=Save and Continue"` or `element="text=Next"`.
5. **IMMEDIATE CONTINUITY**: After clicking, run `sleep 3` **AND IMMEDIATELY** follow with `browser.snapshot`. Do NOT stop.

## 🚨 ANTI-BUG RULES
- **Rule A (CHAINED ACTIONS):** Fill all roles and blocks in ONE turn.
- **Rule B (PHYSICAL RADIOS):** Click labels only: `selector="label:has-text('Yes')"`
- **Rule C (NO SELECTOR IN PRESS):** To avoid tool errors, NEVER include a `selector` in `kind="press"` calls.
