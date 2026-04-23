# SKILL: FILL EDUCATION FROM RESUME

## 🎯 GOAL
Dynamically extract education history from the applicant's resume and fill out the "Education" section using React-safe physical interactions. Handle async comboboxes (searchable dropdowns) safely.

## 🚨 CRITICAL: REACT-SAFE FIELD FILLING (MANDATORY)
1. **BAN JS INJECTIONS:** NEVER use `browser.evaluate` to set `.value`.
2. **USE DYNAMIC SEMANTIC LOCATORS:** Target elements via `aria-label` or surrounding text (e.g., `selector="[aria-label*='School']"`).
3. **THE HUMAN-TYPING PROTOCOL:** For standard text inputs (like GPA): Click -> Clear (Meta+a, Backspace) -> Type slowly.

## 🛑 KNOWN UI TRAPS & WORKAROUNDS

### Trap 1: Async Comboboxes (School, Degree, Field of Study) - CRITICAL
These are NOT standard text inputs or simple `<select>` tags. They are dynamic React comboboxes with a rapid keystroke buffer.
**HOW TO HANDLE (The Search & Select Protocol):**
1. **Click & Clear:** Click the input field (e.g., `selector="[aria-label*='School']"`). Clear it using `Meta+a` then `Backspace` (⚠️ NO selector in `press` call).
2. **Type Keyword (FAST TYPE):** Use `kind="type", slowly=false` to type the name of the school/degree. (⚠️ **MUST BE slowly=false** to avoid Workday's keystroke buffer timeout between letters).
3. **WAIT FOR NETWORK:** You MUST wait 2 to 3 seconds for the dropdown options to render. ❌ **DO NOT PRESS ENTER.**
4. **Click Option:** Take a snapshot if needed to find the exact option, then ✅ **PHYSICALLY CLICK** it:
   `browser.act: target="host", kind="click", selector="[role='option']:has-text('<Your_Match>')"`
5. **Fallback:** If the exact school/major is not found after waiting, click the checkbox for `label:has-text('If you cannot find school')` or select the closest "Other" equivalent.

### Trap 2: Masked Date Inputs (Tab-to-Lock)
Workday uses React spinbuttons for Month/Year dates.
**HOW TO HANDLE:**
1. Click the date field.
2. Clear the existing value (Select All + Backspace).
3. Type the numerical value slowly (e.g., `2024` for Year).   
4. **CRITICALLY:** Press `Tab` immediately after typing to lock the React state:
   `browser.act: target="host", kind="press", key="Tab"` (⚠️ **WARNING:** NEVER include `selector="<dynamic_selector>"` inside `kind="press"`, it will cause a tool error).

### Trap 3: Repeating Blocks & Dynamic IDs
Similar to Experience, clicking "Add Education" generates new random IDs.
**HOW TO HANDLE:**
- ❌ **NEVER** guess or increment ID numbers mathematically.
- ✅ **ALWAYS** use Playwright `.nth()` or `.last()` locators to target the newest block, OR take a quick snapshot AFTER clicking "Add" to discover the new dynamic labels.

## 🗂️ DATA EXTRACTION RULES
Read the applicant's resume (`~/Documents/resume.txt`). Extract for each degree:
- School / University Name
- Degree Type (e.g., Bachelor's, Master's)
- Field of Study / Major
- Overall GPA (If explicitly listed; otherwise skip)
- Start Date & End Date / Graduation Date (Month/Year or Year)

## 🛠️ EXECUTION WORKFLOW
1. Read the applicant's resume. Identify the top 2 most relevant or highest degrees.
2. **First Education Block:** The first block is usually open.
   - Use the Search & Select Protocol (Trap 1) for "School/University", "Degree", and "Field of Study".
   - Use the Human-Typing Protocol for "GPA" (if applicable).
   - Use the Tab-to-Lock method (Trap 2) for Start and End Dates.
3. **Additional Degrees:** - Dynamically locate and click the "Add" / "Add Another" button.
   - **WAIT 2 SECONDS** for the new React block to render.
   - Rescan the DOM or use `.last()` locators to find the newly generated inputs (See Trap 3).
   - Repeat the fill process.
4. **Save & Continue:** - Locate the button dynamically (e.g., `element="text=Save and Continue"` or `element="text=Next"`).
   - Click it.
5. Wait 3 seconds, take a snapshot to verify transition to the next section (e.g., "Voluntary Disclosures" or "EEO").
