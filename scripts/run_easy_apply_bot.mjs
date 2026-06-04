#!/usr/bin/env node
/**
 * Optional EasyApplyBot runner. Set EASYAPPLY_BOT_DIR to bot root.
 * If bot unavailable, exit 0 with message — use easy-apply/SKILL.md + browser instead.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { createPipelineLogger } from './lib/pipeline-log.mjs';

const log = createPipelineLogger({ stage: 'easy_apply' });
const botDir = process.env.EASYAPPLY_BOT_DIR || resolve(process.env.HOME, 'Desktop', 'EasyApplyBot');

if (!existsSync(resolve(botDir, 'main.py'))) {
  log.warn('bot', `EasyApplyBot not found at ${botDir} — use skills/job-applications/easy-apply/SKILL.md with browser`);
  process.exit(0);
}

log.info('bot', `EasyApplyBot found at ${botDir}; run manually: cd "${botDir}" && python main.py`);
log.warn('bot', 'Automated spawn not enabled — known Selenium issues; prefer browser skill per easy-apply/SKILL.md');
process.exit(0);
