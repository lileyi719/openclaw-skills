/**
 * Handler dispatcher.
 * Detects ATS type from URL and routes to the correct handler.
 *
 * Usage:
 *   import { dispatch } from './handlers/index.js';
 *   const result = await dispatch(page, url, profile, resumePath);
 */

import { detectATS } from './base.js';
import { applyAshby } from './ashby.js';
import { applyLever } from './lever.js';

/**
 * @param {import('playwright').Page} page
 * @param {string} applyUrl
 * @param {object} profile
 * @param {string} resumePath
 * @returns {Promise<{ok: boolean, ats: string, error?: string}>}
 */
export async function dispatch(page, applyUrl, profile, resumePath) {
  const ats = detectATS(applyUrl);
  console.log(`[dispatch] detected ATS: ${ats}`);

  switch (ats) {
    case 'ashby':
      return { ...(await applyAshby(page, profile, resumePath)), ats };
    case 'lever':
      return { ...(await applyLever(page, profile, resumePath)), ats };
    default:
      return { ok: false, error: `${ats} handler not yet implemented`, ats };
  }
}

export { detectATS } from './base.js';
