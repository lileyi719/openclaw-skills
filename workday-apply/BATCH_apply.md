# BATCH WORKDAY APPLICATION ORCHESTRATOR

## 1. OBJECTIVE
Execute multiple Workday job applications in a single session, reusing authentication and tracking progress. This orchestrator wraps the existing MASTER_apply.md workflow.

## 2. INPUT

**Primary:** Read `skills/job-applications/workday_queue.json` (from `node scripts/run_job_pipeline.mjs --phase=prepare`).

Each entry should include `apply_url` or `external_url` (Workday job page).

**Fallback:** User-provided URL list in chat.

## 3. PROGRESS TRACKING
**File:** `skills/job-applications/batch_progress.json`

**Structure:**
```json
{
  "session_id": "batch_YYYY-MM-DD_HHMM",
  "started_at": "ISO timestamp",
  "total_jobs": 4,
  "completed": 0,
  "failed": 0,
  "current_job_index": 0,
  "current_job_url": "",
  "current_step": "",
  "jobs": [
    {
      "url": "...",
      "status": "pending|in_progress|done|failed",
      "started_at": "ISO timestamp or null",
      "finished_at": "ISO timestamp or null",
      "error": "error message or null",
      "step_reached": ""
    }
  ]
}
```

**Update Rules:**
- Initialize file at batch start
- Update `current_job_index`, `current_step` after EACH step completion
- Update job status when starting/completing/failing a job
- NEVER delete or overwrite - always read-modify-write

## 4. EXECUTION WORKFLOW

### PHASE 1: INITIALIZATION
1. Create progress file with all jobs marked as "pending"
2. Open browser to first job URL
3. Navigate: `browser.open url="<first_job_url>" target="host"`

### PHASE 2: AUTHENTICATION (FIRST JOB ONLY)
**⚠️ CRITICAL: Full authentication flow ONLY for the first job.**

Follow MASTER_apply.md **STEP 1** completely:
- Click Apply
- Handle modal (Apply Manually)
- Create Account OR Sign In (if email exists)
- Complete registration/login flow
- Wait for "My Information" page to confirm auth success

**After first job completes auth, session is established.**

### PHASE 3: BATCH LOOP
For EACH job URL in the queue:

#### 3.1 START JOB
```
1. Update progress file:
   - jobs[i].status = "in_progress"
   - jobs[i].started_at = current timestamp
   - current_job_index = i
   - current_job_url = url
   - current_step = "starting"

2. If NOT first job:
   - Navigate directly to URL: browser.open url="<job_url>" target="host"
   - Wait 3 seconds for page load
   - Take snapshot to verify page state
```

#### 3.2 EXECUTE APPLICATION
**⚠️ NO TIMEOUT - Continue until completion or unrecoverable error.**

Execute MASTER_apply.md steps in sequence:
- **STEP 1** (Auth): Only for first job. For subsequent jobs, verify already logged in.
- **STEP 2** (Basic Info): Fill personal details
- **STEP 3** (Experience): Fill work history
- **STEP 4** (Education): Fill education
- **STEP 5** (EEO & Submit): Complete disclosures and submit

**After each step:**
- Update progress file: `current_step = "basic_info" | "experience" | "education" | "eeo" | "submit"`
- Update job: `jobs[i].step_reached = current_step`

#### 3.3 COMPLETE JOB
```
1. Verify submission success (look for "Thank You", "Application Submitted")
2. Update progress file:
   - jobs[i].status = "done"
   - jobs[i].finished_at = current timestamp
   - completed += 1
3. Move to next job (if any)
```

#### 3.4 HANDLE FAILURE
**Only mark as "failed" if:**
- CAPTCHA or verification wall appears
- Network error / page crash
- User manually requests skip

**On failure:**
```
1. Update progress file:
   - jobs[i].status = "failed"
   - jobs[i].error = "error description"
   - jobs[i].finished_at = current timestamp
   - failed += 1
2. Continue to next job (DO NOT STOP the entire batch)
```

### PHASE 4: COMPLETION
After all jobs processed:
1. Generate summary report
2. Send Telegram notification to user
3. Save final progress file

**Summary Report Format:**
```
🎯 Batch Application Complete

✅ Completed: X/Y
❌ Failed: Z/Y

Completed Jobs:
- [Job Title] (URL)
- [Job Title] (URL)

Failed Jobs:
- [Job Title] (URL) - Error: [reason]

Progress file: skills/job-applications/batch_progress.json
```

## 5. USER COMMANDS (USER CAN SEND ANYTIME)

### "进度怎么样" / "status"
Read progress file and report:
```
📊 Batch Progress

Job X of Y
Current: [Job Title]
Step: [current step]

✅ Completed: A
❌ Failed: B
⏳ Remaining: C
```

### "跳过当前这个" / "skip"
1. Mark current job as failed (reason: "User skipped")
2. Navigate to next job
3. Continue batch

### "停下来" / "stop"
1. Mark current job as failed (reason: "User stopped")
2. Stop entire batch
3. Generate partial summary

## 6. CRITICAL RULES

### Rule 1: NO TIMEOUT
- Each job takes as long as it needs
- Do NOT auto-skip based on time
- Only fail on unrecoverable errors

### Rule 2: SESSION REUSE
- Authenticate ONCE at the beginning
- Reuse browser session for all jobs
- If session expires mid-batch, re-authenticate and continue

### Rule 3: PROGRESS PERSISTENCE
- Update progress file AFTER EVERY STEP
- On crash/restart, can resume from progress file
- Never lose track of what's completed

### Rule 4: CONTINUE ON ERROR
- Individual job failure does NOT stop the batch
- Log error and move to next job
- Only stop if user requests

### Rule 5: BROWSER TARGET
- Always use `target="host"` (user's Chrome)
- Never use sandbox or isolated browser

## 7. INTEGRATION WITH MASTER_apply.md

This orchestrator delegates to MASTER_apply.md for:
- Authentication flow (STEP 1)
- Form filling logic (STEPS 2-5)
- React-safe interaction protocols
- Error handling for individual fields

**When executing a step:**
1. Read the corresponding section in MASTER_apply.md
2. Follow its rules exactly
3. Update BATCH progress file after step completion
4. Continue to next step

## 8. EXAMPLE EXECUTION

```
[INIT] Creating progress file...
[INIT] 4 jobs queued

[AUTH] Starting first job: Enterprise Architect
[AUTH] Full authentication flow...
[AUTH] ✅ Logged in successfully

[JOB 1] Step: basic_info
[JOB 1] Step: experience
[JOB 1] Step: education
[JOB 1] Step: eeo
[JOB 1] Step: submit
[JOB 1] ✅ Application submitted

[JOB 2] Navigating to: SDR-BDR
[JOB 2] Step: basic_info
[JOB 2] Step: experience
...

[FAIL] Job 3 encountered CAPTCHA
[FAIL] Marking as failed, continuing...

[JOB 4] Navigating to: Technical Consultant
[JOB 4] Step: basic_info
...

[DONE] All jobs processed
[REPORT] 3/4 completed, 1/4 failed
[NOTIFY] Sending Telegram summary...
```

## 9. RESUME CAPABILITY

If batch is interrupted (crash, user stop):
1. Read progress file on next run
2. Find first job with status != "done"
3. Resume from that job
4. Skip already completed jobs

**Resume command:** "继续上次" / "resume"

## 10. FILES

- **Orchestrator:** `BATCH_apply.md` (this file)
- **Worker:** `MASTER_apply.md` (single job logic)
- **Progress:** `skills/job-applications/batch_progress.json`
- **Applied Jobs History:** `skills/job-applications/applied_jobs.json` (append-only)
- **Live status:** `skills/job-applications/run_status.json`
- **Pipeline log:** `skills/job-applications/pipeline.log`
