# LinkedIn Job Classifier

## OBJECTIVE
Classify LinkedIn jobs into two categories:
- **Easy Apply**: Jobs that can be applied directly on LinkedIn
- **External Apply**: Jobs that redirect to external application sites (Workday, Greenhouse, Lever, Ashby, etc.)

## OUTPUT
Two files in ~/Documents/:
- `easy_apply_jobs.json` - Jobs for EasyApplyBot
- `external_apply_jobs.json` - Jobs for BATCH_apply skill

## WORKFLOW

### STEP 1: NAVIGATE TO LINKEDIN JOBS
```
1. Open LinkedIn jobs search page with user's authenticated session
2. User provides search URL or search parameters (keywords, location)
3. Wait for page load
4. Verify user is logged in (check for profile icon)
```

**⚠️ CRITICAL: Must use authenticated session. Unauthenticated users cannot see Apply buttons.**

### STEP 2: SCAN JOB LISTINGS (FIRST PASS - LIST PAGE)
```
For each job card in the listing:
1. Get job title, company, location
2. Extract LinkedIn job URL from job title link
3. Check if job card has "Easy Apply" label/tag:
   - Look for text "Easy Apply" in job card
   - If found → Mark as EASY_APPLY immediately (no further testing needed)
4. If NO "Easy Apply" label → Mark as NEEDS_DETAIL_CHECK
5. Record job info:
   - Title
   - Company
   - Location
   - LinkedIn URL
   - Apply type (EASY_APPLY | NEEDS_DETAIL_CHECK)
```

**Key Finding from Testing:**
- ✅ Easy Apply jobs have visible "Easy Apply" tag in job card on list page
- ⚠️ Jobs without this tag need detail view check
- ⚠️ Some jobs don't show any Apply info on list page (e.g., Alignerr)

### STEP 3: CHECK JOBS WITHOUT EASY APPLY LABEL
For jobs marked as NEEDS_DETAIL_CHECK:
```
1. Click to open job detail view (right panel in LinkedIn)
2. Wait 2-3 seconds for detail panel to load
3. Snapshot the detail panel
4. Find the Apply button in detail view:
   - Look for button with text "Easy Apply" → EASY_APPLY
   - Look for button/link with text "Apply" or "Apply on company website" → EXTERNAL_APPLY
5. Update job classification
```

### STEP 4: EXTRACT EXTERNAL URL
For jobs confirmed as EXTERNAL_APPLY:
```
1. Click the Apply button/link
2. Wait 2-3 seconds for response
3. Check browser tabs:
   - If new tab opened → Get URL from new tab
   - If same page navigated → Get current URL
4. Identify platform from URL domain
5. Close external tab (if opened) and return to LinkedIn
6. Record external URL
```

### STEP 5: RECORD RESULTS
```
EASY_APPLY jobs:
{
  "title": "...",
  "company": "...",
  "location": "...",
  "linkedin_job_id": "...",
  "url": "https://www.linkedin.com/jobs/view/...",
  "apply_type": "easy_apply"
}

EXTERNAL_APPLY jobs:
{
  "title": "...",
  "company": "...",
  "location": "...",
  "linkedin_job_id": "...",
  "linkedin_url": "https://www.linkedin.com/jobs/view/...",
  "external_url": "https://jobs.ashbyhq.com/...",
  "platform": "ashby|workday|greenhouse|lever|other",
  "apply_type": "external_apply"
}
```

### STEP 6: CONTINUE SCANNING
```
1. Scroll down to load more jobs (use pagination or scroll)
2. Repeat STEP 2-5 for new jobs
3. Stop when:
   - Reached configured limit (default: 50 jobs)
   - User requests stop
   - No more jobs to load
```

### STEP 7: SAVE RESULTS
```
1. Write easy_apply_jobs.json to ~/Documents/
2. Write external_apply_jobs.json to ~/Documents/
3. Report summary:
   - Total scanned: X
   - Easy Apply: Y
   - External Apply: Z
   - External platforms breakdown
```

## PLATFORM DETECTION

Detect external application platform from URL domain:

**Supported Platforms (Priority Order):**
1. `jobs.ashbyhq.com` → **Ashby** (100% success rate - highest priority)
2. `workday.wd*.myworkdayjobs.com` → **Workday**
3. `jobs.jazzhr.com` → **JazzHR** (SMB platform, simple forms)
4. `bamboohr.com/jobs` → **BambooHR** (SMB platform)
5. `jobs.comeet.com` → **Comeet** (recruitment platform)
6. `jobs.lever.co` → **Lever** (simple but Captcha issues)
7. `rippling.com/careers` → **Rippling**
8. `pinppl.com/jobs` → **Pin**

**Skip Platforms (0% Success):**
- `boards.greenhouse.io` → **Greenhouse** (React-Select issues)
- `careers.*.com/icims` → **iCIMS** (complex forms)
- `taleo.*.com` → **Taleo** (Oracle, very complex)
- `successfactors.*.com` → **SuccessFactors** (SAP, complex)

**Other Patterns:**
- `my.indeed.com/apply` → **Indeed Apply**
- Other → classify as **"other"** (try generic approach)

## INTEGRATION

**Output files can be used by:**
- `easy_apply_jobs.json` → EasyApplyBot input (or manual Easy Apply)
- `external_apply_jobs.json` → workday-apply/BATCH_apply skill for automated applications

## CONFIGURATION

User can provide:
- `search_url`: LinkedIn jobs search URL (preferred)
- `keywords`: Job search keywords (if no URL provided)
- `location`: Job location (if no URL provided)
- `limit`: Max jobs to scan (default: 50)
- `skip_easy_apply`: Only collect external apply jobs (default: false)
- `platforms`: Filter specific platforms (e.g., only collect Workday jobs)

## EXAMPLE USAGE

User command:
```
"帮我在LinkedIn上找Sales Engineer职位，区分Easy Apply和External Apply"
```

Agent response:
```
[CLASSIFIER] Opening LinkedIn jobs search...
[CLASSIFIER] Using authenticated session (logged in as 胡汉三)
[CLASSIFIER] Scanning page 1...
[CLASSIFIER] Job 1: "UI Engineer at Filevine" - Easy Apply ✅
[CLASSIFIER] Job 2: "Software Engineer at ShiftOS" - Easy Apply ✅
[CLASSIFIER] Job 3: "Software Engineer at Everis" - Needs detail check...
[CLASSIFIER] Job 3 detail: External Apply (Ashby) → https://jobs.ashbyhq.com/everis/...
[CLASSIFIER] Job 4: "Software Engineer at Alignerr" - Needs detail check...
[CLASSIFIER] Scanning page 2...
...
[CLASSIFIER] Summary: 25 jobs scanned, 10 Easy Apply, 15 External Apply
[CLASSIFIER] Platforms: 5 Ashby, 4 Workday, 3 Greenhouse, 3 other
[CLASSIFIER] Files saved to ~/Documents/
```

## IMPLEMENTATION NOTES

### Efficiency Optimization
- ✅ First scan list page for obvious "Easy Apply" tags (fast)
- ✅ Only click into detail view for ambiguous jobs (slower)
- ✅ Batch process by page (scan 25 jobs per page load)

### Rate Limiting
- Add 3-5 second delay between job checks
- LinkedIn may detect automated behavior if too fast
- Use reasonable scrolling speed

### Error Handling
- If Apply button not found → Skip job, mark as "unknown"
- If external URL extraction fails → Record job but no URL
- If login session expires → Alert user, pause operation

### Resume Capability
- Save progress after each page
- On interrupt, can resume from last scanned job
- Track scanned job IDs to avoid duplicates

## CRITICAL FINDINGS FROM TESTING

1. **Must be logged in** - Unauthenticated users cannot see Apply buttons
2. **Easy Apply is visible on list page** - No need to click into every job
3. **External Apply needs detail view** - Must click to see Apply button
4. **Multiple platforms exist** - Not just Workday (Ashby, Greenhouse, Lever, etc.)
5. **External URLs open in new tab** - Must check browser tabs after clicking Apply