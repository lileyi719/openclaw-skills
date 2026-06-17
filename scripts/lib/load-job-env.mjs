import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { JOB_APPS_DIR } from './pipeline-log.mjs';

const ENV_PATH = resolve(JOB_APPS_DIR, '.env');
let loaded = false;

/** Load skills/job-applications/.env into process.env (does not override existing vars). */
export function loadJobEnv(force = false) {
  if (loaded && !force) return ENV_PATH;
  if (!existsSync(ENV_PATH)) return null;
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
  loaded = true;
  return ENV_PATH;
}

export function getJobEnvPath() {
  return ENV_PATH;
}
