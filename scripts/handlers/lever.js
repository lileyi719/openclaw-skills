/**
 * Deterministic Lever handler — v2 (all edge cases from prompt).
 *
 * Key differences from Ashby:
 * - Location: NEVER use fill(). Press Meta+a → Backspace → type → dropdown.
 *   Using fill() on Lever location causes React to discard the value on submit.
 * - If location has no ✱ indicator, skip it entirely.
 * - Essay field: type() not fill() for Lever.
 * - Submit resume retry (Cority pattern): if resume cleared after submit, re-upload.
 * - Cookie banner, EEO radios, sponsorship same as Ashby pattern.
 */

import { randomDelay } from './base.js';

/**
 * Handle Lever location autocomplete.
 * CRITICAL: NEVER use fill(). Use press Meta+a → Backspace → type → dropdown.
 */
async function fillLocation(page, city) {
  const locInput = await page.$(
    'input[placeholder*="Location"], input[placeholder*="location"], input[name="location"], '
    + '.location-input input, [data-testid="location-input"] input'
  );
  if (!locInput) return false;

  // Check if location is required (✱ indicator)
  const hasRequired = await page.evaluate((el) => {
    const p = el.closest('div, fieldset, label');
    if (!p) return false;
    return p.textContent.includes('✱');
  }, locInput);

  if (!hasRequired) {
    console.log('[lever] location is optional (no ✱) — skipping');
    return false; // Not an error, just skip
  }

  // Clear: Meta+a → Backspace (NOT fill)
  await locInput.click();
  await randomDelay(100, 200);
  await locInput.press('Meta+a');
  await randomDelay(100, 200);
  await locInput.press('Backspace');
  await randomDelay(300, 500);

  // Type the full location string
  await locInput.type('San Francisco, CA, USA', { delay: 25 });
  await randomDelay(2500, 3500); // Lever dropdown can be slow

  // Look for dropdown option
  let option = await page.$(
    '[role="option"]:not([aria-disabled="true"]), '
    + '[role="menuitem"]:not([aria-disabled="true"]), '
    + 'li.autocomplete-result, '
    + '.typeahead-dropdown li, '
    + '.dropdown-option'
  );

  if (option) {
    await option.click();
    console.log('[lever] location dropdown selected');
  } else {
    // Try ArrowDown + Enter
    await locInput.press('ArrowDown');
    await randomDelay(300, 500);
    await locInput.press('Enter');
    console.log('[lever] location selected via ArrowDown+Enter');
  }

  await randomDelay(500, 800);

  // Verify value stuck
  const currentVal = await page.evaluate((el) => el.value, locInput);
  if (!currentVal || currentVal.trim() === '') {
    console.warn('[lever] location empty after type+dropdown');
    // Retry once
    await locInput.click();
    await locInput.press('Meta+a');
    await locInput.press('Backspace');
    await randomDelay(200, 300);
    await locInput.type('San Francisco, CA, USA', { delay: 25 });
    await randomDelay(2500, 3500);
    option = await page.$('[role="option"], li.autocomplete-result, .typeahead-dropdown li');
    if (option) {
      await option.click();
    } else {
      await locInput.press('ArrowDown');
      await locInput.press('Enter');
    }
    await randomDelay(500, 800);
    const retryVal = await page.evaluate((el) => el.value, locInput);
    if (!retryVal || retryVal.trim() === '') {
      console.warn('[lever] location still empty after retry');
      return false;
    }
  }

  return true;
}

/**
 * Handle cookie banner.
 */
async function handleCookieBanner(page) {
  const sel = [
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Allow all")',
    'button:has-text("I agree")',
    '#CybotCookiebotDialog button:has-text("Accept")',
    '.cookie-consent button',
    'button:has-text("Got it")',
  ];
  for (const s of sel) {
    const btn = await page.$(s);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(1000);
      console.log('[lever] cookie banner accepted');
      return true;
    }
  }
  return false;
}

/**
 * Fill standard fields (name, email, phone, linkedin, current company, portfolio).
 */
async function fillStandardFields(page, profile) {
  const fields = [
    {
      selectors: ['input[name="name"]', 'input[placeholder*="Full Name"]', 'input[placeholder*="name"]'],
      value: profile.name,
    },
    {
      selectors: ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="Email"]'],
      value: profile.email,
    },
    {
      selectors: ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="Phone"]'],
      value: profile.phone,
    },
    {
      selectors: ['input[placeholder*="LinkedIn"]', 'input[placeholder*="linkedin"]', 'input[name="linkedin"]', 'input[name="urls[LinkedIn]"]'],
      value: profile.linkedinUrl,
    },
  ];

  for (const field of fields) {
    for (const sel of field.selectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await el.fill('');
        await el.fill(field.value);
        await randomDelay(200, 400);
        break;
      }
    }
  }

  // Current company (optional)
  const companyInput = await page.$('input[placeholder*="Current Company"], input[placeholder*="current company"], input[name="currentCompany"]');
  if (companyInput) {
    const ph = (await companyInput.getAttribute('placeholder')) || '';
    if (!ph.toLowerCase().includes('optional')) {
      await companyInput.fill('');
      await randomDelay(100, 200);
    }
  }

  // Portfolio / website (skip if already have LinkedIn)
  const portfolioInput = await page.$('input[placeholder*="Portfolio"], input[placeholder*="Website"], input[placeholder*="website"]');
  if (portfolioInput) {
    // Leave empty unless required
    const required = await page.evaluate((el) => {
      const p = el.closest('div, fieldset, label');
      return p ? p.textContent.includes('✱') : false;
    }, portfolioInput);
    if (required) {
      await portfolioInput.fill('https://github.com/yiqunx');
      await randomDelay(200, 300);
    }
  }
}

/**
 * Handle work authorization / EEO radios.
 * Same as Ashby pattern.
 */
async function handleRadios(page) {
  const allRadios = await page.$$('input[type="radio"]');
  if (allRadios.length === 0) return;

  const groups = {};
  for (const radio of allRadios) {
    const name = await radio.getAttribute('name');
    if (!name) continue;
    if (!groups[name]) groups[name] = [];
    groups[name].push(radio);
  }

  for (const [name, radios] of Object.entries(groups)) {
    if (radios.length < 2) continue;

    const qText = await page.evaluate((el) => {
      const fieldset = el.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        return legend ? legend.textContent.toLowerCase() : '';
      }
      const div = el.closest('div.application-field, div[role="group"]');
      if (div) {
        const label = div.querySelector('label, span, strong');
        return label ? label.textContent.toLowerCase() : '';
      }
      return '';
    }, radios[0]);

    let targetValue = null;

    if (qText.includes('sponsor') || qText.includes('visa') || qText.includes('work authorization')) {
      for (const radio of radios) {
        const value = await radio.getAttribute('value');
        const label = await page.evaluate((el) => {
          const p = el.closest('label');
          return p ? p.textContent.toLowerCase() : '';
        }, radio);
        if (label.includes('no') && label.includes('sponsor')) { targetValue = value; break; }
        if (label.includes('don\'t need') || label.includes('do not need')) { targetValue = value; break; }
        if (label.includes('authorized') && (label.includes('yes') || label.includes('am'))) { targetValue = value; break; }
      }
    } else if (qText.includes('gender') || qText.includes('race') || qText.includes('veteran') || qText.includes('disability') || qText.includes('ethnicity')) {
      for (const radio of radios) {
        const value = await radio.getAttribute('value');
        const label = await page.evaluate((el) => {
          const p = el.closest('label');
          return p ? p.textContent.toLowerCase() : '';
        }, radio);
        if (label.includes('decline') || label.includes('prefer not') || label.includes('choose not') || label.includes('wish')) { targetValue = value; break; }
      }
    }

    if (targetValue) {
      for (const radio of radios) {
        const v = await radio.getAttribute('value');
        if (v === targetValue) {
          await radio.click();
          await randomDelay(200, 400);
          break;
        }
      }
    }
  }
}

/**
 * Handle Lever custom combobox (Select...) — click → snapshot → click option.
 */
async function handleSelectComboboxes(page) {
  const combos = await page.$$('[role="combobox"]');
  for (const combo of combos) {
    const label = await page.evaluate((el) => {
      const p = el.closest('div, fieldset');
      if (!p) return '';
      const labelEl = p.querySelector('label');
      return labelEl ? labelEl.textContent.toLowerCase() : el.getAttribute('aria-label')?.toLowerCase() || '';
    }, combo);

    // Open the dropdown
    await combo.click();
    await randomDelay(500, 800);

    // Find options
    const options = await page.$$('[role="option"], [role="menuitem"]');
    let clicked = false;
    for (const opt of options) {
      const t = (await opt.textContent()) || '';
      if (label.includes('gender') || label.includes('race') || label.includes('veteran') || label.includes('disability')) {
        if (t.includes('Decline') || t.includes('Prefer not') || t.includes('choose not') || t.includes('I don\'t wish')) {
          await opt.click();
          clicked = true;
          break;
        }
      }
    }

    if (!clicked && options.length > 0) {
      // Pick first non-empty, non-"Select" option
      for (const opt of options) {
        const t = (await opt.textContent()) || '';
        if (t.trim() && !t.includes('Select') && !t.includes('choose')) {
          await opt.click();
          break;
        }
      }
    }
    await randomDelay(300, 500);
  }
}

/**
 * Handle Lever essay (textarea).
 * Lever essay: use type() not fill().
 * Target ~150-300 chars.
 */
async function fillEssays(page) {
  const textareas = await page.$$('textarea');
  if (textareas.length === 0) return;

  for (const ta of textareas) {
    const value = await ta.inputValue();
    if (value && value.trim().length > 0) continue;

    const placeholder = (await ta.getAttribute('placeholder')) || '';
    const required = await page.evaluate((el) => {
      const p = el.closest('div, fieldset');
      return p ? p.textContent.includes('✱') : false;
    }, ta);

    if (!required && !placeholder.toLowerCase().includes('cover')) continue;

    let response = 'I am excited about this role and believe my background in software engineering aligns well with the requirements. I bring experience in full-stack development, distributed systems, and cross-functional collaboration.';
    if (placeholder.toLowerCase().includes('cover') || placeholder.toLowerCase().includes('why')) {
      response = 'I am passionate about building products that make a real impact. My experience spans full-stack development, distributed systems, and leading cross-functional teams to deliver results at scale. I thrive in environments where I can combine technical depth with product thinking.';
    }

    // Lever essay: type() (not fill())
    await ta.click();
    await randomDelay(100, 200);
    await ta.type(response, { delay: 5 });
    await randomDelay(300, 500);

    // Verify value
    const written = await ta.inputValue();
    if (!written || written.trim().length < 20) {
      console.warn('[lever] essay type failed, retrying with fill...');
      await ta.fill('');
      await ta.fill(response);
      await randomDelay(500, 800);
    }
  }
}

/**
 * Upload resume (Lever-specific selectors).
 */
async function uploadResume(page, resumePath) {
  const { existsSync } = await import('fs');
  if (!existsSync(resumePath)) {
    console.warn(`[lever] resume not found: ${resumePath}`);
    return false;
  }

  let input = await page.$('input[type="file"]');
  if (input) {
    await input.setInputFiles(resumePath);
    await page.waitForTimeout(1000);
    // Verify upload
    const uploaded = await page.$('[class*="resume"]:has-text(".pdf"), .file-upload-name:has-text("resume"), [class*="file"]:has-text("pdf")');
    if (uploaded || await page.$('text=resume.pdf, text=resume.txt')) {
      console.log('[lever] resume uploaded');
      return true;
    }
    console.warn('[lever] resume input filled but no confirmation — continuing');
    return true;
  }

  console.warn('[lever] no file input found');
  return false;
}

/**
 * Main Lever apply function.
 */
export async function applyLever(page, profile, resumePath) {
  try {
    await page.waitForSelector('input[name="name"], input[placeholder*="Name"], input[type="email"]', { timeout: 15_000 });
    await randomDelay(800, 1200);

    // 1. Cookie banner
    await handleCookieBanner(page);
    await randomDelay(500, 800);

    // 2. Upload resume
    await uploadResume(page, resumePath);
    await randomDelay(800, 1200);

    // 3. Fill standard fields (NOT location — that's separate)
    await fillStandardFields(page, profile);
    await randomDelay(400, 600);

    // 4. Location (NEVER fill — use type+dropdown)
    await fillLocation(page, profile.city);
    await randomDelay(400, 600);

    // 5. Radios (sponsorship, EEO)
    await handleRadios(page);
    await randomDelay(400, 600);

    // 6. Select combos
    await handleSelectComboboxes(page);
    await randomDelay(400, 600);

    // 7. Essays
    await fillEssays(page);
    await randomDelay(400, 600);

    // 8. Submit
    for (let attempt = 0; attempt < 3; attempt++) {
      // Find submit button
      let submitBtn = await page.$(
        'button:has-text("Submit"), '
        + 'button:has-text("Submit Application"), '
        + 'button[type="submit"], '
        + 'input[type="submit"], '
        + '.submit-button, '
        + 'button:has-text("Apply")'
      );
      if (!submitBtn) {
        // Last-resort: look for primary button in the form
        const buttons = await page.$$('button');
        for (const b of buttons) {
          const text = (await b.textContent()) || '';
          if (text.includes('Submit') || text.includes('Apply')) {
            submitBtn = b;
            break;
          }
        }
      }
      if (!submitBtn) return { ok: false, error: `no submit button (attempt ${attempt + 1})` };

      const beforeUrl = page.url();
      await submitBtn.click();
      await page.waitForTimeout(3000);

      // Check success
      const afterUrl = page.url();
      const body = await page.textContent('body') || '';

      // Lever success indicators: /thanks, /submitted, "Thank you"
      if (
        afterUrl.includes('/thanks') || afterUrl.includes('/submitted') || afterUrl.includes('/success')
        || /thank you|application submitted|successfully|submitted|✓|恭喜/i.test(body)
      ) {
        console.log(`[lever] submit success (attempt ${attempt + 1})`);
        return { ok: true };
      }

      // Still on form — check what went wrong
      console.log(`[lever] submit attempt ${attempt + 1} failed — checking...`);

      // Cority pattern: resume was cleared
      const noResume = await page.$('text="No file chosen", text="No file selected", text="未选择文件"');
      if (noResume) {
        console.log('[lever] resume cleared after submit — re-uploading');
        await uploadResume(page, resumePath);
        await randomDelay(500, 800);
        continue;
      }

      // Check for captcha
      if (body.includes('recaptcha') || body.includes('Recaptcha') || afterUrl.includes('captcha')) {
        return { ok: false, error: 'recaptcha blocked' };
      }

      // Check for error fields
      const errorFields = await page.$$('[aria-invalid="true"], .field-error, [class*="error"]');
      if (errorFields.length > 0) {
        console.log(`[lever] ${errorFields.length} error fields`);
        for (const ef of errorFields) {
          const input = await ef.$('input, textarea');
          if (input) {
            const ph = (await input.getAttribute('placeholder')) || '';
            if (ph.toLowerCase().includes('location') && !ph.includes('linkedin')) {
              await fillLocation(page, profile.city);
            } else if (ph.toLowerCase().includes('email') || (await input.getAttribute('name') || '').includes('email')) {
              await input.fill(profile.email);
            }
          }
        }
        await randomDelay(500, 800);
        continue;
      }

      // Lever essay might need refill
      const taRefill = await page.$$('textarea');
      let refilled = false;
      for (const ta of taRefill) {
        const val = await ta.inputValue();
        if (!val || val.trim().length < 10) {
          const ph = (await ta.getAttribute('placeholder')) || '';
          let response = 'I am excited about this role and believe my background in software engineering aligns well with the requirements.';
          if (ph.toLowerCase().includes('cover') || ph.toLowerCase().includes('why')) {
            response = 'I am passionate about building products that make a real impact. My experience spans full-stack development, distributed systems, and cross-functional collaboration.';
          }
          await ta.fill('');
          await ta.fill(response);
          refilled = true;
        }
      }
      if (refilled) continue;

      // Unknown error after 3 attempts
      if (attempt === 2) return { ok: false, error: 'submit failed after 3 attempts' };
    }

    return { ok: false, error: 'submit loop exhausted' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
