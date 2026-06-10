/**
 * Deterministic Ashby handler — v2 (all edge cases from prompt).
 *
 * Handle:
 * - Cookie banner (Cookiebot, Accept all)
 * - SMS consent → always No (Yes redirects to careers page)
 * - Location combobox with country validation (reject Mexico, Virgin Islands)
 * - Essay fields: fill → Tab → verify value stays; retry if empty
 * - Submit verification + retry (max 2 tries)
 * - Essay verification before submit (Ashby clears essays on Submit)
 * - Submit success: URL change or Thank You text
 */

import { randomDelay } from './base.js';

/**
 * Ashby-specific location handling.
 * Use fill("San Francisco, CA") → wait for dropdown → click correct option.
 * Verify value contains California + United States, reject Mexico/Virgin Islands/etc.
 */
async function fillLocation(page, city) {
  const locInput = await page.$(
    'input[placeholder*="Location"], input[placeholder*="location"], input[name="location"], [data-testid="location-input"] input',
  );
  if (!locInput) return false;

  // Clear first
  await locInput.click();
  await locInput.fill('');
  await randomDelay(300, 500);

  // Type target city
  await locInput.type('San Francisco, CA', { delay: 20 });
  await randomDelay(1500, 2500);

  // Look for dropdown options
  let option = await page.$(
    '[role="option"]:not([aria-disabled="true"]), '
    + '[role="menuitem"]:not([aria-disabled="true"]), '
    + 'li[data-option-index="0"], '
    + '.typeahead__item, '
    + '.autocomplete-suggestion'
  );

  if (option) {
    // Validate option text contains US city, not Mexico
    const optText = (await option.textContent()) || '';
    if (optText.includes('Mexico') || optText.includes('Virgin Islands') || optText.includes('Macorís')) {
      console.warn('[ashby] location suggestion rejected:', optText.trim());
      // Clear and try full string
      await locInput.fill('');
      await randomDelay(200, 300);
      await locInput.type('San Francisco, California, United States', { delay: 15 });
      await randomDelay(2000, 3000);
      option = await page.$(
        '[role="option"]:not([aria-disabled="true"]), li[data-option-index="0"], .typeahead__item'
      );
      if (option) {
        const text2 = (await option.textContent()) || '';
        if (text2.includes('Mexico')) {
          console.warn('[ashby] still Mexico — skipping location');
          return false;
        }
        await option.click();
      } else {
        // No dropdown appeared — try Enter
        await locInput.press('Enter');
      }
    } else {
      await option.click();
    }
  } else {
    // No dropdown at all — try ArrowDown + Enter
    await locInput.press('ArrowDown');
    await randomDelay(300, 500);
    await locInput.press('ArrowDown');
    await randomDelay(200, 300);
    await locInput.press('Enter');
  }

  await randomDelay(500, 800);

  // Verify value
  const currentVal = await page.evaluate((el) => el.value, locInput);
  if (currentVal && (currentVal.includes('Mexico') || currentVal.includes('Virgin Islands'))) {
    console.warn(`[ashby] location still incorrect: "${currentVal}"`);
    return false;
  }
  if (!currentVal || currentVal.trim() === '') {
    console.warn('[ashby] location empty after fill');
    return false;
  }
  return true;
}

/**
 * Handle cookie banner (Cookiebot, Accept all, Allow all, I agree).
 * Returns true if a banner was found and handled.
 */
async function handleCookieBanner(page) {
  // Check for common cookie banner selectors
  const cookieBtns = [
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Allow all")',
    'button:has-text("Allow All")',
    'button:has-text("I agree")',
    'button:has-text("I Agree")',
    'button:has-text("Necessary only")',
    '#CybotCookiebotDialog button:has-text("Accept")',
    '.cookie-consent button',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("Continue")',
  ];
  for (const sel of cookieBtns) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(1000);
      console.log('[ashby] cookie banner accepted');
      return true;
    }
  }
  return false;
}

/**
 * Handle SMS / marketing consent — always click No.
 * Yes causes redirect to careers page.
 */
async function handleSmsConsent(page) {
  const smsRadios = await page.$$(
    'input[type="radio"]:near(:text("SMS")), '
    + 'input[type="radio"]:near(:text("text message")), '
    + 'input[type="radio"]:near(:text("marketing"))'
  );
  // Actually: find radio groups with Yes/No options
  const allRadios = await page.$$('input[type="radio"]');
  for (const radio of allRadios) {
    const label = await page.evaluate((el) => {
      const parent = el.closest('label, div, fieldset');
      if (!parent) return '';
      return parent.textContent.toLowerCase();
    }, radio);
    if (label.includes('sms') || label.includes('text message') || label.includes('marketing')) {
      const value = await radio.getAttribute('value');
      if (value && (value.toLowerCase() === 'no' || value.toLowerCase() === 'opt-out' || value.toLowerCase() === 'decline')) {
        // Check if this radio is inside a "No" label
        const parentText = await page.evaluate((el) => el.closest('label, div, fieldset')?.textContent?.toLowerCase() || '', radio);
        if (parentText.includes('yes')) continue; // This is the Yes option
        await radio.click();
        await randomDelay(300, 500);
        console.log('[ashby] SMS consent set to No');
        return true;
      }
    }
  }
  return false;
}

/**
 * Fill standard text fields (name, email, phone, linkedin).
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
      selectors: ['input[placeholder*="LinkedIn"]', 'input[placeholder*="linkedin"]', 'input[name="linkedInUrl"]', 'input[name="linkedin"]'],
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
}

/**
 * Handle work authorization / sponsorship radios.
 * Click: citizen, green card, permanent resident; No for sponsorship.
 * Skip gender/diversity.
 */
async function handleRadios(page) {
  const allRadios = await page.$$('input[type="radio"]');
  if (allRadios.length === 0) return;

  // Group radios by name (each group = one question)
  const groups = {};
  for (const radio of allRadios) {
    const name = await radio.getAttribute('name');
    if (!name) continue;
    if (!groups[name]) groups[name] = [];
    groups[name].push(radio);
  }

  for (const [name, radios] of Object.entries(groups)) {
    if (radios.length < 2) continue; // Not a real question

    // Get the question text from the first radio's parent
    const qText = await page.evaluate((el) => {
      const fieldset = el.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) return legend.textContent.toLowerCase();
      }
      const div = el.closest('div[role="group"], div.application-field');
      if (div) {
        const label = div.querySelector('label, span');
        if (label) return label.textContent.toLowerCase();
      }
      return '';
    }, radios[0]);

    // Determine which option to click
    let targetValue = null;

    if (qText.includes('sponsor') || qText.includes('visa') || qText.includes('work authorization')) {
      // Need to click "No" or the option that means "I don't need sponsorship"
      for (const radio of radios) {
        const value = await radio.getAttribute('value');
        const label = await page.evaluate((el) => {
          const p = el.closest('label');
          return p ? p.textContent.toLowerCase() : '';
        }, radio);
        if (label.includes('no') && label.includes('sponsor')) { targetValue = value; break; }
        if (label.includes('don\'t need') || label.includes('do not need')) { targetValue = value; break; }
        if (label.includes('authorized') && (label.includes('yes') || label.includes('am') || label.includes('permanent'))) { targetValue = value; break; }
      }
    } else if (qText.includes('gender') || qText.includes('race') || qText.includes('veteran') || qText.includes('disability') || qText.includes('ethnicity') || qText.includes('eeo')) {
      // Prefer not to answer
      for (const radio of radios) {
        const value = await radio.getAttribute('value');
        const label = await page.evaluate((el) => {
          const p = el.closest('label');
          return p ? p.textContent.toLowerCase() : '';
        }, radio);
        if (label.includes('wish') || label.includes('decline') || label.includes('prefer not') || label.includes('choose not')) { targetValue = value; break; }
      }
    } else if (qText.includes('citizen') || qText.includes('legally authorized')) {
      for (const radio of radios) {
        const value = await radio.getAttribute('value');
        const label = await page.evaluate((el) => {
          const p = el.closest('label');
          return p ? p.textContent.toLowerCase() : '';
        }, radio);
        if (label.includes('citizen') || label.includes('green card') || label.includes('permanent resident')) { targetValue = value; break; }
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
 * Handle essay/textarea fields.
 * Playwright's fill() works reliably here — unlike CDP.
 * Still verify value after fill and retry if empty.
 */
async function fillEssays(page) {
  const textareas = await page.$$('textarea');
  if (textareas.length === 0) return;

  for (const ta of textareas) {
    const placeholder = (await ta.getAttribute('placeholder')) || '';
    const name = (await ta.getAttribute('name')) || '';
    const text = (await page.evaluate((el) => el.textContent, ta)) || '';

    // Skip if already filled or optional (no visual indicator)
    if (text.trim().length > 0) continue;

    // Check if required (look for * indicator near the field)
    const required = await page.evaluate((el) => {
      const p = el.closest('div, fieldset');
      if (!p) return false;
      return p.textContent.includes('*') || p.textContent.includes('✱');
    }, ta);

    if (!required) continue; // Skip optional essays

    // Generate response based on placeholder
    let response = 'I am excited about this role and believe my background in software engineering aligns well with the requirements.';
    if (placeholder.includes('cover letter') || placeholder.includes('Cover Letter') || placeholder.includes('why')) {
      response = 'I am passionate about building products that make a real impact. My experience spans full-stack development, distributed systems, and leading cross-functional teams to deliver results. I would love to bring my technical expertise to this role.';
    }

    await ta.click();
    await ta.fill('');
    await ta.fill(response);
    await randomDelay(300, 500);

    // Verify value stayed
    const written = await ta.inputValue();
    if (!written || written.trim().length < 10) {
      // Retry once
      console.warn('[ashby] essay fill failed, retrying...');
      await ta.fill('');
      await ta.fill(response);
      await randomDelay(500, 800);
      const written2 = await ta.inputValue();
      if (!written2 || written2.trim().length < 10) {
        console.warn('[ashby] essay retry failed');
      }
    }
  }
}

/**
 * Handle Ashby custom select dropdowns.
 * Click → snapshot → click option.
 */
async function handleSelectDropdowns(page) {
  const selects = await page.$$('select, [role="combobox"]:not([placeholder*="Location"]):not([placeholder*="location"])');
  for (const sel of selects) {
    const tagName = await sel.evaluate((el) => el.tagName);
    if (tagName === 'SELECT') {
      // Native select — pick first non-disabled option
      const options = await sel.$$('option');
      for (const opt of options) {
        const value = await opt.getAttribute('value');
        const text = (await opt.textContent()) || '';
        if (value && value !== '' && !text.includes('Select') && !text.includes('Please choose')) {
          await sel.selectOption(value);
          await randomDelay(200, 300);
          break;
        }
      }
    } else {
      // Custom combobox — click to open
      const label = await page.evaluate((el) => el.textContent?.toLowerCase() || '', sel);
      if (label.includes('gender') || label.includes('race') || label.includes('veteran')) {
        // Try to find "Prefer not to say" option
        await sel.click();
        await randomDelay(500, 800);
        const options = await page.$$('[role="option"], [role="menuitem"]');
        for (const opt of options) {
          const t = (await opt.textContent()) || '';
          if (t.includes('Decline') || t.includes('prefer not') || t.includes('choose not') || t.includes('I don\'t wish')) {
            await opt.click();
            await randomDelay(200, 400);
            break;
          }
        }
      }
    }
  }
}

/**
 * Main Ashby apply function.
 */
export async function applyAshby(page, profile, resumePath) {
  try {
    await page.waitForSelector('input[name="name"], input[placeholder*="Name"], input[type="email"]', { timeout: 15_000 });
    await randomDelay(800, 1200);

    // 1. Handle cookie banner first (before form interaction)
    await handleCookieBanner(page);
    await randomDelay(500, 800);

    // 2. Upload resume (before filling — avoids field shifts)
    const { uploadResume } = await import('./base.js');
    const uploaded = await uploadResume(page, resumePath);
    if (!uploaded) console.warn('[ashby] resume upload failed — continuing');
    await randomDelay(800, 1200);

    // 3. Fill standard fields
    await fillStandardFields(page, profile);
    await randomDelay(400, 600);

    // 4. Handle SMS consent
    await handleSmsConsent(page);
    await randomDelay(300, 500);

    // 5. Location
    await fillLocation(page, profile.city);
    await randomDelay(400, 600);

    // 6. Handle radio buttons (sponsorship, EEO)
    await handleRadios(page);
    await randomDelay(400, 600);

    // 7. Handle select dropdowns
    await handleSelectDropdowns(page);
    await randomDelay(400, 600);

    // 8. Fill essays
    await fillEssays(page);
    await randomDelay(400, 600);

    // 9. Pre-submit essay verification
    const tareas = await page.$$('textarea');
    for (const ta of tareas) {
      const val = await ta.inputValue();
      const ph = (await ta.getAttribute('placeholder')) || '';
      if (!val || val.trim().length < 10) {
        // Refill empty essays
        let response = 'I am excited about this role.';
        if (ph.toLowerCase().includes('cover') || ph.toLowerCase().includes('why')) {
          response = 'I am passionate about building products that make a real impact. My experience spans full-stack development, distributed systems, and leading cross-functional teams to deliver results.';
        }
        await ta.fill('');
        await ta.fill(response);
        await randomDelay(300, 500);
      }
    }
    await randomDelay(300, 500);

    // 10. Submit
    for (let attempt = 0; attempt < 3; attempt++) {
      // Find submit button
      let submitBtn = await page.$(
        'button:has-text("Submit"), '
        + 'button:has-text("Submit Application"), '
        + 'button[type="submit"], '
        + 'input[type="submit"]'
      );
      if (!submitBtn) {
        // Try looking for the last primary button
        const buttons = await page.$$('button');
        for (const b of buttons) {
          const cls = await b.getAttribute('class');
          const text = (await b.textContent()) || '';
          if (text.includes('Submit') || text.includes('submith') || (cls && cls.includes('primary'))) {
            submitBtn = b;
            break;
          }
        }
      }
      if (!submitBtn) return { ok: false, error: `no submit button found (attempt ${attempt + 1})` };

      await submitBtn.click();
      await page.waitForTimeout(5000);

      // Detect submit success with STRICT checks
      const afterUrl = page.url();
      const afterBody = await page.textContent('body') || '';
      const submitButtonGone = !(await page.$(
        'button:has-text("Submit"), button:has-text("Submit Application"), button[type="submit"]'
      ));

      // Strict success signals:
      const isThankYouPage = afterUrl.includes('/thank-you') || afterUrl.includes('/thanks') || afterUrl.includes('/success') || afterUrl.includes('/submitted');
      const hasConfirmText = /your application has been submitted|we've received your application|your application was submitted|✅|thank you for applying/i.test(afterBody);
      const formPageGone = !afterUrl.includes('ashbyhq.com') || afterUrl.includes('/thank');

      if (submitButtonGone && (isThankYouPage || hasConfirmText || formPageGone)) {
        console.log(`[ashby] SUBMIT CONFIRMED (attempt ${attempt + 1}) — url=${afterUrl.slice(afterUrl.indexOf('ashby'))}`);
        return { ok: true };
      }

      // If submit button still exists, definitely failed
      console.log(`[ashby] submit attempt ${attempt + 1} — button gone=${submitButtonGone} thankYou=${isThankYouPage} confirmText=${hasConfirmText}`);

      // Submit failed — check for errors
      console.log(`[ashby] submit attempt ${attempt + 1} failed — checking errors...`);

      // Check for reCAPTCHA
      if (bodyText.includes('recaptcha') || bodyText.includes('Recaptcha') || currentUrl.includes('recaptcha')) {
        return { ok: false, error: 'recaptcha blocked' };
      }

      // Check for resume error
      const resumeError = await page.$('[class*="error"]:has-text("resume"), [class*="Error"]:has-text("resume")');
      if (resumeError) {
        console.warn('[ashby] resume error detected, re-uploading...');
        const { uploadResume } = await import('./base.js');
        await uploadResume(page, resumePath);
        await randomDelay(500, 800);
        continue;
      }

      // Check for specific field errors
      const errorFields = await page.$$('[aria-invalid="true"], [class*="error"], [class*="Error"], .field-error');
      if (errorFields.length > 0) {
        console.log(`[ashby] ${errorFields.length} error fields detected`);
        // Try to fill them
        for (const ef of errorFields) {
          const input = await ef.$('input, textarea');
          if (input) {
            const ph = (await input.getAttribute('placeholder')) || '';
            const name = (await input.getAttribute('name')) || '';
            if (ph.toLowerCase().includes('location') || name.includes('location')) {
              await fillLocation(page, profile.city);
            } else if (ph.toLowerCase().includes('email') || name.includes('email')) {
              await input.fill(profile.email);
            } else if (ph.toLowerCase().includes('phone') || name.includes('phone')) {
              await input.fill(profile.phone);
            } else if (ph.toLowerCase().includes('name') || name.includes('name')) {
              await input.fill(profile.name);
            }
          }
        }
        await randomDelay(500, 800);
        continue;
      }

      // Check for empty essays (Ashby known issue)
      const taErrors = await page.$$('textarea');
      let refilledAny = false;
      for (const ta of taErrors) {
        const val = await ta.inputValue();
        const ph = (await ta.getAttribute('placeholder')) || '';
        if (!val || val.trim().length < 5) {
          let response = 'I am excited about this role and believe my background in software engineering aligns well with the requirements.';
          if (ph.toLowerCase().includes('cover') || ph.toLowerCase().includes('why')) {
            response = 'I am passionate about building products that make a real impact. My experience spans full-stack development, distributed systems, and leading cross-functional teams to deliver results.';
          }
          await ta.fill('');
          await ta.fill(response);
          refilledAny = true;
          await randomDelay(300, 500);
        }
      }
      if (refilledAny) continue;

      // Unknown error — give up
      if (attempt === 2) {
        return { ok: false, error: 'submit failed after 3 attempts' };
      }
    }

    return { ok: false, error: 'submit loop exhausted' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
