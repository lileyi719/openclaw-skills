k# SKILL: FILL BASIC INFORMATION FROM RESUME

## 🎯 GOAL
Dynamically extract the applicant's personal details from their resume and accurately fill out the "My Information" / "Basic Details" section using React-safe physical interactions.

## 🚨 CRITICAL: REACT-SAFE FIELD FILLING (MANDATORY)
Workday uses complex React components. Standard `.fill()` or JS `evaluate` injections **fail silently** — the input appears filled visually but React state does NOT register the value, resulting in empty submissions.

**ABSOLUTE RULES FOR ALL WORKDAY TEXT FIELDS:**
1. **CHAINED EXECUTION (NEW):** Do NOT stop to report progress field-by-field. Fill ALL visible fields (Name, Address, Phone, State) in a single turn.
2. **BAN JS INJECTIONS:** NEVER use `browser.evaluate` to set `.value` or dispatch events.
3. **BAN SNAPSHOT REFS FOR INPUTS:** NEVER use temporary `ref="eXX"` to click or type into text fields.
4. **USE DYNAMIC SEMANTIC LOCATORS:** Scan the DOM for reliable identifiers (e.g., `aria-label`, `name`, or surrounding labels). Examples: `selector="[aria-label*='First Name']"`, `selector="label:has-text('City') + input"`.
5. **THE HUMAN-TYPING PROTOCOL:** For EVERY text input, execute this exact sequence:
   - **Click:** `browser.act: target="host", kind="click", selector="<dynamic_selector>"`
   - **Clear:** `browser.act: target="host", kind="press", key="Meta+a"` then `key="Backspace"` (⚠️ **WARNING:** NEVER include a `selector` inside `kind="press"`, it will cause a tool error).
   - **Type:** `browser.act: target="host", kind="type", selector="<dynamic_selector>", text="<value>", slowly=true`

## 🗂️ DATA EXTRACTION RULES
Before filling the form, read the applicant's resume (e.g., from `~/Documents/resume.txt`).
- **Name**: Parse First Name and Last Name.
- **Address**: Extract Address Line 1, City, State/Province, Postal/Zip Code, and Country.
- **Phone**: Identify country code and core phone number.
- **Rule**: NEVER invent data. If a mandatory field is missing, use "N/A" unless it blocks progress.

## 🛑 KNOWN UI TRAPS & WORKAROUNDS

### Trap 1: Country & State Interlocking Dropdowns (THE CALIFORNIA/IDAHO FIX)
The "State" field remains disabled/hidden until "Country" is selected.
⚠️ **CRITICAL BUFFER BUG:** Workday dropdowns have a rapid keystroke buffer. Using `slowly=true` causes the buffer to timeout between letters (e.g., typing "C-a-l-i" slowly resets the search to "I", resulting in "Idaho").

**HOW TO HANDLE (FAST TYPE + PHYSICAL CLICK):**
1. Dropdowns are usually `<button aria-haspopup="listbox">`.
2. Find the dropdown dynamically (e.g., `selector="[aria-label*='Country']"`).
3. Click the dropdown button.
4. **TYPE FAST:** Type the value with ZERO delay: `browser.act: target="host", kind="type", selector="<dynamic_selector>", text="United States", slowly=false` (⚠️ **MUST BE slowly=false**).
5. **WAIT 2 SECONDS.** ❌ **DO NOT PRESS ENTER.**
6. ✅ **PHYSICAL CLICK:** Click the dynamically rendered option by text: `browser.act: target="host", kind="click", element="text=United States"`.
7. **WAIT 2 SECONDS** for React to unlock the State field.
8. Repeat the exact same process for the "State" dropdown (e.g., California): Click -> **Type FAST (`slowly=false`)** -> WAIT 2 SECONDS -> **Physical Click `element="text=California"`**.
9. **VERIFY:** If the field displays "Idaho" or remains empty, REPEAT this protocol immediately.

### Trap 2: Masked Phone & Postal Code (CRITICAL)
Workday applies strict formatting masks to Phone and Zip codes.
**HOW TO HANDLE:**
1. Follow the HUMAN-TYPING PROTOCOL strictly (Click -> Clear -> Type slowly).
2. Type NUMBERS ONLY (strip dashes/spaces).
3. **THE TAB LOCK:** After typing a masked field, you MUST press `Tab` to lock the React validation state:
   `browser.act: target="host", kind="press", key="Tab"` (⚠️ No selector in press).
4. **VERIFY:** Check if any extra quotes or double-entry occurred.

### Trap 3: "How did you hear about us?" (Dynamic Fallback)
1. Locate the source dropdown dynamically.
2. Default primary source to "Job Board", "Social Media", or "LinkedIn".
3. If a secondary specific source appears, set it to "LinkedIn".

## 🛠️ EXECUTION WORKFLOW
1. Read the applicant's resume.
2. Use `browser.evaluate` to scan the page and dynamically identify the correct semantic selectors for Name, Address, and Phone fields.
3. **Fill Name**: Execute the Human-Typing Protocol for First and Last Name.
4. **Fill Location**:
   - Fill "Country" dropdown FIRST (See Trap 1 - use Physical Click, NO Enter).
   - Wait for React to re-render.
   - Fill Address Line 1 and City (Human-Typing Protocol).
   - Fill "State" dropdown (See Trap 1 - use Physical Click, NO Enter).
   - Fill "Postal Code" (Human-Typing Protocol + Tab Lock, See Trap 2).
5. **Fill Contact**:
   - Select "Phone Device Type" dropdown (Mobile).
   - Select "Country Phone Code" dropdown.
   - Fill "Phone Number" (Human-Typing Protocol + Tab Lock).
6. **Save & Continue**:
   - Locate the button dynamically (e.g., `element="text=Save and Continue"`).
   - Click it.
7. **IMMEDIATE CONTINUITY**: After clicking, run `sleep 3` **AND IMMEDIATELY** follow it with `browser.snapshot`. Do NOT stop to wait for user input.

## 🚨 ANTI-BUG RULES (APPLIES TO ALL ACTIONS)
- **Rule A (CHAINED ACTIONS):** Fill each field entirely, but perform all actions in a single turn. Do NOT pause for updates.
- **Rule B (PHYSICAL RADIOS):** If asked "Previously worked at Workday?", physically click the radio label (e.g., `selector="label:has-text('No')"`). NEVER use JS `.click()`.
- **Rule C (NO eXX REFS):** Never use snapshot refs (`e5`, `e12`) for clicking or typing into inputs. Always use dynamic semantic locators (`[aria-label='City']`).
- **Rule D (NO SELECTOR IN PRESS):** To avoid tool errors, NEVER include a `selector` in `kind="press"` calls.
