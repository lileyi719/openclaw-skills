# SKILL: FIND APPLY BUTTON & BYPASS AUTHENTICATION

## 🎯 GOAL
Step 1: Locate and click the initial "Apply" button on the job description page. 
Step 2: Bypass the authentication wall (Create Account, Verify, Login) to reach the actual application form.

## 🛑 STRICT CREDENTIAL RULES
- **EMAIL**: `yiqunxu35@gmail.com`
- **PASSWORD**: `OpenClaw!2026!Leyi`
- **NEVER** invent or guess credentials.

## 🧠 EXECUTION STRATEGY: DYNAMIC SEMANTIC LOCATORS
**⛔ CRITICAL: Do NOT use `browser.snapshot` on login/register forms if you can avoid it. Use `browser.evaluate` ONLY to read the DOM and discover element IDs/Aria-labels, NEVER to set values or trigger clicks.**

**🚫 RULE: NO CREDENTIAL REUSE**
For EVERY new job application, you MUST NEVER assume an existing account or try to sign in directly. ALWAYS click "Create Account" first.

## 🛠️ PHASE 1: APPLY + MODAL + AUTH ROUTING
**This is the EXACT 3-step sequence for ANY Workday application start. Use explicit Playwright semantic locators.**

1. **Handle the Modal**: After clicking Apply, a modal appears.
   `browser.act: target="host", kind="click", element="text=Apply Manually"`
2. **Authentication Routing**: If asked how to sign in.
   `browser.act: target="host", kind="click", element="text=Sign in with email"`
3. **Force Account Creation**: DO NOT fill credentials yet. Click Create Account.
   `browser.act: target="host", kind="click", element="text=Create Account"`

*FALLBACK*: Only use Sign In (PHASE 3) if system says "Email already exists" or no Create Account button exists.

## 🛠️ PHASE 2: FILL REGISTRATION FORM (REACT-SAFE)
**ABSOLUTELY NO JS `evaluate` FOR FILLING.** You must use physical clicks and slow typing. Find selectors dynamically by inspecting the DOM structure (e.g., `input[type='email']`, `[aria-label*='Email']`, `[data-automation-id='email']`).

**Execution Steps for Email, Password, and Confirm Password:**
For EACH field, execute this strict 3-step sequence:
1. **Click**: `browser.act: target="host", kind="click", selector="<dynamic_selector>"`
2. **Clear**: `browser.act: target="host", kind="press", selector="<dynamic_selector>", key="Meta+a"` then `browser.act: target="host", kind="press", selector="<dynamic_selector>", key="Backspace"`
3. **Type**: `browser.act: target="host", kind="type", selector="<dynamic_selector>", text="<value>", slowly=true`

**For Checkbox & Submit:**
4. **Check Terms**: `browser.act: target="host", kind="click", selector="input[type='checkbox']"` (or find the specific wrapping label)
5. **Submit**: `browser.act: target="host", kind="click", element="text=Create Account"` (or "Register" / "Submit")

## 🛠️ PHASE 3: POST-REGISTRATION LOGIN (CRITICAL EXPECTED REDIRECT)
Workday **always** redirects to the Sign In page after clicking Create Account. This is NORMAL and NOT a failure.
1. Immediately locate the Email and Password fields on the Sign In page.
2. **Use the exact same 3-step physical fill method (Click -> Clear -> Type Slowly)** from Phase 2 to enter `lileyi719@gmail.com` and `OpenClaw!2026!Leyi`.
3. Click "Sign In" / "Submit".
4. Wait 3 seconds and check the heading (`h2` or `h3`).

## 🚪 ROUTING (AFTER LOGIN)
- If heading says "My Information" → **SUCCESS, load `02_basic_info.md`**
- If heading says "Verify" or "Check email" → **STOP: `VERIFICATION_REQUIRED: Please check lileyi719@gmail.com`**
- If heading still shows "Sign In" with an error → credentials may be wrong or account not yet propagated; retry once using the strict physical fill method.
