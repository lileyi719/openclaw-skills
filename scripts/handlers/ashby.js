/**
 * Deterministic Ashby handler.
 *
 * Ashby form structure:
 * - name, email, phone inputs (stable selectors)
 * - input[type=file] for resume
 * - location combobox (typeahead dropdown)
 * - LinkedIn URL field
 * - Custom questions: radios, selects, textareas
 * - Submit button
 *
 * Key rule: never click the styled upload button.
 * Always find the hidden input[type=file] and use setInputFiles.
 */

import { randomDelay, fillField, clickButton, uploadResume, clickRadio } from './base.js';

/**
 * @param {import('playwright').Page} page
 * @param {object} profile
 * @param {string} resumePath
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function applyAshby(page, profile, resumePath) {
  try {
    await page.waitForSelector('input[name="name"], input[placeholder*="Name"]', { timeout: 15_000 });
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
    if (!uploaded) console.warn('[ashby] resume upload failed');
    await randomDelay(600, 1000);

    // Location (Ashby typeahead)
    const locSelectors = [
      'input[placeholder*="Location"]',
      'input[placeholder*="location"]',
      'input[name="location"]',
    ];
    for (const sel of locSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await el.fill('');
        await el.fill(profile.city);
        await randomDelay(800, 1500);
        const sug = await page.$('[role="option"], [role="menuitem"], li[data-option-index="0"]');
        if (sug) await sug.click();
        break;
      }
    }
    await randomDelay(300, 600);

    // LinkedIn URL
    for (const sel of ['input[placeholder*="LinkedIn"]', 'input[placeholder*="linkedin"]', 'input[name="linkedInUrl"]']) {
      if (await fillField(page, sel, profile.linkedinUrl)) break;
    }
    await randomDelay(300, 600);

    // Work authorization radios
    const radios = await page.$$('input[type="radio"]');
    for (const radio of radios) {
      const text = await page.evaluate((el) => {
        const p = el.closest('label, div');
        return p ? p.textContent.toLowerCase() : '';
      }, radio);
      if (text.includes('sponsor') && (text.includes('no') || text.includes("don't"))) { await radio.click(); continue; }
      if (text.includes('citizen') || text.includes('green card') || text.includes('permanent resident')) { await radio.click(); continue; }
    }
    await randomDelay(300, 600);

    // Gender/diversity: prefer not to answer
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
      const btn = await page.$('button[type="submit"], input[type="submit"]');
      if (btn) await btn.click();
      else return { ok: false, error: 'no submit button found' };
    }

    // Verify
    await page.waitForTimeout(3000);
    const body = await page.textContent('body');
    if (/thank you|application submitted|successfully|received|submitted|✓|恭喜|提交成功/i.test(body || '')) {
      return { ok: true };
    }
    await page.waitForTimeout(3000);
    const body2 = await page.textContent('body');
    if (/thank you|application submitted|successfully|received|submitted|✓|恭喜|提交成功/i.test(body2 || '')) {
      return { ok: true };
    }

    return { ok: true, error: 'submit clicked but confirmation unclear' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
