# SKILL: FILL EEO, VOLUNTARY DISCLOSURES & SUBMIT

## 🎯 GOAL
Complete the Equal Employment Opportunity (EEO), Veteran, and Disability disclosure forms, provide any required e-signatures, and click the final "Submit" button.

## 🚨 CRITICAL: REACT-SAFE PHYSICAL INTERACTIONS (MANDATORY)
1. **BAN JS INJECTIONS:** NEVER use `browser.evaluate` to click radios, checkboxes, or buttons.
2. **BAN eXX REFS:** NEVER use temporary snapshot refs (`e12`) to interact.
3. **USE DYNAMIC SEMANTIC LOCATORS:** Target elements via visible text, `aria-label`, or CSS selectors.

## 🛑 KNOWN UI TRAPS & WORKAROUNDS

### Trap 1: Radio Buttons & Checkboxes (CRITICAL)
Workday hides the actual `<input type="radio">` or `<input type="checkbox">` and styles the `<label>` instead.
**HOW TO HANDLE:**
- ❌ **NEVER** use `browser.evaluate` to dispatch click events on the input.
- ✅ **ALWAYS** use Playwright to physically click the visible text or label:
  - `browser.act: target="host", kind="click", element="text=Decline to identify"`
  - `browser.act: target="host", kind="click", selector="label:has-text('Male')"`
  - `browser.act: target="host", kind="click", selector="label:has-text('Yes, I have a disability')"`
  - `browser.act: target="host", kind="click", selector="input[type='checkbox'] + label"` (for terms agreements)

### Trap 2: EEO Dropdowns
Sometimes Gender or Race are `<button aria-haspopup="listbox">` dropdowns instead of radios.
**HOW TO HANDLE:**
1. Click the dropdown button dynamically (e.g., `selector="[aria-label*='Gender']"`).
2. **WAIT 2 SECONDS** for the listbox to render.
3. Click the target option: `browser.act: target="host", kind="click", element="text=Decline to identify"`

### Trap 3: E-Signature & Date
Disability forms often require typing your legal name and today's date.
**HOW TO HANDLE:**
1. **Signature:** Use the Human-Typing Protocol (Click -> Clear -> Type slowly) for the Name field.
2. **Date:** Use the Tab-to-Lock method. Type the date slowly and **press Tab** immediately after to lock the React state.

## 🗂️ DATA EXTRACTION & DEFAULT RULES
Read the applicant's resume or profile data. 
- **CRITICAL SAFEGUARD:** If the applicant's Gender, Race, Veteran, or Disability status is NOT explicitly provided in their data, you MUST select **"Decline to identify" / "I don't wish to answer" / "Prefer not to say"**. NEVER hallucinate or guess protected demographic data.

## 🛠️ EXECUTION WORKFLOW
1. **Identify the Page:** Scan the DOM headers (`<h3>`) to determine if you are on Gender/Race, Veteran, Disability, or the final Review page.
2. **Handle Disclosures (Iterative):**
   - For each section, locate the target answer (Radio or Dropdown) and use strict physical clicks (Trap 1 & 2).
   - If an E-Signature is required, type the applicant's full legal name slowly and lock the date with Tab (Trap 3).
   - Click "Save and Continue" / "Next".
   - **WAIT 3 SECONDS**, take a snapshot, and repeat until you reach the "Review" page.
3. **Final Review Page:**
   - Scan the page for any red error messages using `browser.evaluate`. If errors exist, you must navigate back and fix them.
   - If no errors, locate the final Submit button (often at the very bottom).
   - `browser.act: target="host", kind="click", element="text=Submit"`
4. **Verification:**
   - Wait 4-5 seconds.
   - Take a final `browser.snapshot`.
   - Verify the presence of a success message (e.g., "Congratulations", "Application Submitted", "Thank You").
   - Mark the application process as complete.
