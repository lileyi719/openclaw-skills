#!/usr/bin/env node
/**
 * Mine all external submit successes from applied_jobs.json + session jsonl logs.
 *   node scripts/mine-successful-submits.mjs
 *   node scripts/mine-successful-submits.mjs --json
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { classifyExternalUrl } from './lib/ats-url-filter.mjs';
import {
  normalizeJobUrl,
  isLinkedInEasyApplySubmitted,
  isExternalSubmittedStatus,
} from './lib/agent-session-record.mjs';

const APPLIED = resolve('skills/job-applications/applied_jobs.json');
const SESSION_DIR = resolve(process.env.HOME, '.openclaw/agents/main/sessions');
const jsonOut = process.argv.includes('--json');

function parseMaybeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function addEntry(map, raw, source) {
  if (!raw || typeof raw !== 'object') return;
  const status = String(raw.status || '');
  if (!isExternalSubmittedStatus(status, raw.url || '')) return;
  if (isLinkedInEasyApplySubmitted(status, raw.url || '')) return;
  const url = raw.url || raw.ats_url || raw.apply_url || '';
  if (!url || /linkedin\.com\/jobs\/view/i.test(url)) return;
  const key = normalizeJobUrl(url) || url.split('?')[0].toLowerCase();
  const plat = raw.platform || status.replace(/^submitted_/i, '') || classifyExternalUrl(url).platform;
  const company = raw.company || raw.company_name || raw.title || '';
  const ts = raw.ts || raw.submittedAt || raw.timestamp || '';
  const entry = { company, platform: plat, url, ts, status, source, key };
  const existing = map.get(key);
  const score = (e) => (e.company ? 2 : 0) + (e.ts ? 1 : 0) + (e.source === 'applied_jobs.json' ? 1 : 0);
  if (!existing || score(entry) > score(existing)) map.set(key, entry);
}

const map = new Map();

for (const file of [APPLIED, `${APPLIED}.bak`]) {
  if (!existsSync(file)) continue;
  try {
    for (const e of JSON.parse(readFileSync(file, 'utf8'))) {
      addEntry(map, e, file.endsWith('.bak') ? 'applied_jobs.json.bak' : 'applied_jobs.json');
    }
  } catch {
    // ignore
  }
}

if (existsSync(SESSION_DIR)) {
  const files = readdirSync(SESSION_DIR).filter((f) => f.endsWith('.jsonl') && !f.includes('trajectory'));
  for (const f of files) {
    const text = readFileSync(join(SESSION_DIR, f), 'utf8');
    const patterns = [
      /append-applied-job\.mjs '(\\?\{[^']*?"status"\s*:\s*"submitted[^']*?\})'/g,
      /\{"status":"submitted_[^"]+","[^}]*"url":"https?:[^"]+"[^}]*\}/g,
      /submitted_[a-z0-9_-]+\s+([^\s\\]+)\s+(https?:\/\/[^\s\\]+)/gi,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text))) {
        if (re === patterns[2]) {
          const company = m[1];
          const url = m[2].replace(/\\+$/, '');
          if (/linkedin\.com/i.test(url)) continue;
          addEntry(map, { status: 'submitted_unknown', company, url }, f);
        } else {
          let s = m[1] ?? m[0];
          if (m[1]) {
            s = m[1].replace(/\\'/g, "'").replace(/\\\\"/g, '"').replace(/\\"/g, '"');
          }
          const j = parseMaybeJson(s);
          if (j) addEntry(map, j, f);
        }
      }
    }
  }
}

const all = [...map.values()].sort((a, b) => Date.parse(a.ts || 0) - Date.parse(b.ts || 0));
const byPlatform = {};

for (const e of all) {
  const c = classifyExternalUrl(e.url);
  const plat = c.platform !== 'other' ? c.platform : (e.platform || 'unknown');
  if (!byPlatform[plat]) byPlatform[plat] = { tier: c.tier, hosts: new Set(), items: [] };
  byPlatform[plat].tier = c.tier;
  try {
    byPlatform[plat].hosts.add(new URL(e.url).hostname);
  } catch {
    // ignore
  }
  byPlatform[plat].items.push({ ...e, classified: c });
}

if (jsonOut) {
  console.log(JSON.stringify({ total: all.length, byPlatform }, null, 2));
  process.exit(0);
}

console.log(`Total unique external submits mined: ${all.length}\n`);

for (const [plat, data] of Object.entries(byPlatform).sort((a, b) => b[1].items.length - a[1].items.length)) {
  console.log(`\n## ${plat} (tier=${data.tier}, count=${data.items.length})`);
  console.log(`   hosts: ${[...data.hosts].slice(0, 5).join(', ')}`);
  for (const it of data.items) {
    console.log(`   - ${it.company || '?'} | ${it.url.slice(0, 100)}`);
  }
}

const tierCounts = {};
const unknownSamples = [];
for (const e of all) {
  const t = classifyExternalUrl(e.url).tier;
  tierCounts[t] = (tierCounts[t] || 0) + 1;
  if (t === 'unknown' && unknownSamples.length < 20) {
    unknownSamples.push(e);
  }
}
console.log('\n--- Tier summary ---');
console.log(tierCounts);
if (unknownSamples.length) {
  console.log('\n--- Unknown tier (not in current allowlist) ---');
  for (const u of unknownSamples) {
    console.log(`   ${u.company || '?'} | ${u.url}`);
  }
}
