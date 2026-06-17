#!/usr/bin/env node
/**
 * Ensure linkedin-jobs profile is logged into LinkedIn using skills/job-applications/.env
 *
 *   node scripts/ensure-linkedin-login.mjs
 */
import { loadJobEnv } from './lib/load-job-env.mjs';
import { ensureLinkedInLoggedIn } from './lib/linkedin-auto-login.mjs';

loadJobEnv();

const result = await ensureLinkedInLoggedIn({ log: console.error });
if (result.ok) {
  console.error(`[ensure-linkedin-login] OK (${result.reason})`);
  process.exit(0);
}
console.error(`[ensure-linkedin-login] FAILED (${result.reason})${result.url ? ` url=${result.url}` : ''}${result.error ? ` err=${result.error}` : ''}`);
process.exit(1);
