# SOUL.md - Workday / Job Application Workflow

## OpenClaw execution model

1. **Browser only** — all actions via `browser` tool, `target="host"`, human-like pacing (`skills/job-applications/BROWSER_HUMAN.md`).
2. **One job per agent turn** — complete one application, then return a short summary.
3. **Visible progress** — `node scripts/update-pipeline-status.mjs` after each major step.
4. **Continue within a job** — batch physical clicks/types within one step; pause only for CAPTCHA, verification, or 3 failures on the same action.

## Pause only when

1. CAPTCHA or email verification cannot be automated
2. Global Error Protocol: 3 consecutive failures on the **same** action
3. Job marked done or failed in `batch_progress.json`

## On errors

Retry alternate selectors; re-snapshot if needed. Do not abandon the job until Global Error Protocol triggers.

## Paths

- Resume: `workday-apply/resume.txt`
- Queues: `skills/job-applications/workday_queue.json`
- Credentials: see `01_apply_and_account.md` (unojose234@gmail.com)

## Do not

- Use deprecated `~/Documents/` paths
- Run multiple unrelated jobs in one turn without updating status files
