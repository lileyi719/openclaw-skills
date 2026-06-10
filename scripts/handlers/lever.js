/**
 * Deterministic Lever handler.
 *
 * Lever form structure:
 * - name, email, phone inputs
 * - input[type=file] for resume
 * - Location combobox: CRITICAL — must use type() + dropdown click, NOT fill()
 * - LinkedIn URL field
 * - Custom questions
 * - Submit button
 *
 * Lever location quirk: using fill() on the location field causes the value
 * to disappear on submit. Always use press+type+dropdown click.
 */

import { randomDelay, fillField, clickButton, uploadResume } from './base.js';

/**
 * @param {import('playwright').Page} page
 * @param {object} profile
 * @param {string} resumePath
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function applyLever(page, profile, resumePath) {
  try {
    await page.waitForSelector('input[name="name"], input[placeholder*="name"]', { timeout: 15_000 });
    await randomDelay(600, 1200);

    // Fill standard fields
    const fields = [
      { sel: 'input[name="name"], input[placeholder*="Full Name"], input[placeholder*="name"]', val: profile.name },
      { sel: 'input[name="email"], input[type="email"], input[placeholder*="Email"]', val: profile.email },
      { sel: 'input[name="phone"], input[type="tel"], input[placeholder*="Phone"]', val: profile.phone },
    ];
    for (const f of fields) {
      await fillField(page, f.sel, f.val);
      await randomDelay(200, 500);
    }
    await randomDelay(400, 800);

    // Upload resume
    const uploaded = await uploadResume(page, resumePath);
    if (!uploaded) console.warn('[lever] resume upload failed');
    await randomDelay(600, 1000);

    // Location (Lever typeahead — NEVER use fill())
    const locInput = await page.$(
      'input[placeholder*="Location"], input[placeholder*="location"], input[name="location"], .location-input input',
    );
    if (locInput) {
      await locInput.click();
      await locInput.press('Meta+a');
      await randomDelay(100, 200);
      await locInput.press('Backspace');
      await randomDelay(200, 400);
      await locInput.type('San Francisco, CA, USA', { delay: 30 });
      await randomDelay(2000, 3000); // Lever needs longer wait for dropdown
      const option = await page.$('[role="option"], [role="menuitem"], li.autocomplete-result, .typeahead-dropdown li');
      if (option) {
        await option.click();
        console.log('[lever] location dropdown selected');
      } else {
        console.warn('[lever] no location dropdown appeared');
      }
    }
    await randomDelay(300, 600);

    // LinkedIn URL
    for (const sel of [
      'input[placeholder*="LinkedIn"]',
      'input[placeholder*="linkedin"]',
      'input[name="linkedin"]',
      'input[name="urls[LinkedIn]"]',
    ]) {
      if (await fillField(page, sel, profile.linkedinUrl)) break;
    }
    await randomDelay(300, 600);

    // Work authorization radios
    for (const radio of await page.$$('input[type="radio"]')) {
      const text = await page.evaluate((el) => {
        const p = el.closest('label, div');
        return p ? p.textContent.toLowerCase() : '';
      }, radio);
      if (text.includes('sponsor') && (text.includes('no') || text.includes("don't"))) { await radio.click(); continue; }
      if (text.includes('citizen') || text.includes('green card')) { await radio.click(); continue; }
    }
    await randomDelay(300, 600);

    // Gender (prefer not to say)
    for (const radio of await page.$$('input[type="radio"]')) {
      const text = await page.evaluate((el) => {
        const p = el.closest('label, div');
        return p ? p.textContent.toLowerCase() : '';
      }, radio);
      if (text.includes('wish') || text.includes('decline') || text.includes('prefer not')) { await radio.click(); break; }
    }
    await randomDelay(500, 1000);

    // Submit
    const submitted = await clickButton(page, 'Submit');
    if (!submitted) {
      const btn = await page.$('button[type="submit"], input[type="submit"], .submit-button');
      if (btn) await btn.click();
      else return { ok: false, error: 'no submit button found' };
    }

    // Verify
    await page.waitForTimeout(3000);
    const body = await page.textContent('body') || '';
    if (/thank you|application submitted|successfully|received|submitted|✓|恭喜/i.test(body)) return { ok: true };
    await page.waitForTimeout(3000);
    if (page.url().includes('/submitted') || page.url().includes('/success') || page.url().includes('/thank')) return { ok: true };
    return { ok: true, error: 'submit clicked but confirmation unclear' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
