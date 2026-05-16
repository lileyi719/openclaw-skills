# External Job Application Skill

## OBJECTIVE
Apply to jobs on external platforms (Ashby, Greenhouse, Lever, Workday, company websites) using resume data from ~/Documents/resume.txt.

## RESUME DATA
**File:** ~/Documents/resume.txt

**Personal Information:**
- First Name: Leyi
- Last Name: Li
- Full Name: Leyi Li
- Email: lileyi719@gmail.com
- Phone: (628) 306-6284
- Address: 16 Turk Street, San Francisco, CA 94102

**Work Experience:**
- Company: 7dollar.delivery
- Title: Software Engineer Intern
- Location: San Francisco, CA
- Start Date: 02/2026
- End Date: Present
- Description: AI chatbot in React Native/Node.js, Openclaw job automation tool

## WORKFLOW

### STEP 1: PLATFORM DETECTION
```
1. Navigate to external URL
2. Snapshot page
3. Detect platform from URL or page structure:
   - jobs.ashbyhq.com → Ashby (100% success rate)
   - workday.wd*.myworkdayjobs.com → Workday
   - jobs.jazzhr.com → JazzHR
   - bamboohr.com/jobs → BambooHR
   - jobs.comeet.com → Comeet
   - jobs.lever.co → Lever (watch for Captcha)
   - rippling.com/careers → Rippling
   - pinppl.com/jobs → Pin
   - boards.greenhouse.io → Greenhouse (0% success - skip)
   - careers.*.com/icims → iCIMS (0% success - skip)
   - Other → Custom company website
4. Choose appropriate strategy
```

**Platform Priority (by success rate):**
1. Ashby - 100% success, simple form
2. Workday - Unknown, use MASTER_apply.md
3. JazzHR - Unknown, simple form
4. BambooHR - Unknown, SMB platform
5. Comeet - Unknown, may be easy
6. Lever - Low success (Captcha issues)
7. Greenhouse/iCIMS - Skip (0% success)

### STEP 2: FILL BASIC INFORMATION
**All platforms require:**
- Name: Leyi Li
- Email: lileyi719@gmail.com
- Phone: (628) 306-6284
- Resume: Upload from ~/Documents/resume.txt or use resume file path

**Platform-specific fields:**

#### ASHBY (Simple Form)
```
Typical fields:
- Name* → Leyi Li
- Email* → lileyi719@gmail.com
- Resume* → Upload file
- Phone → (628) 306-6284

Steps:
1. Fill Name textbox
2. Fill Email textbox
3. Click "Upload File" button → Upload resume
4. Fill Phone (if field exists)
5. Click "Submit Application"
```

#### GREENHOUSE (Moderate Complexity)
```
Typical fields:
- First Name → Leyi
- Last Name → Li
- Email → lileyi719@gmail.com
- Phone → (628) 306-6284
- Resume → Upload
- Cover Letter → Optional (skip if not required)
- Additional questions → Answer based on context

Steps:
1. Fill name fields
2. Fill email/phone
3. Upload resume
4. Skip cover letter unless required*
5. Answer additional questions
6. Submit
```

#### LEVER (Simple-Moderate)
```
Typical fields:
- Name → Leyi Li
- Email → lileyi719@gmail.com
- Phone → (628) 306-6284
- Resume → Upload
- Current company → 7dollar.delivery
- Links (LinkedIn, GitHub, Portfolio) → Optional

Steps:
1. Fill basic info
2. Upload resume
3. Fill current company
4. Submit
```

#### JAZZHR (Simple Form)
```
Typical fields:
- Name → Leyi Li
- Email → lileyi719@gmail.com
- Phone → (628) 306-6284
- Resume → Upload file

Steps:
1. Fill Name
2. Fill Email
3. Fill Phone
4. Upload resume from /tmp/openclaw/uploads/resume.pdf
5. Fill optional fields if required*
6. Submit
```

#### BAMBOOHR (Simple Form)
```
Typical fields:
- First Name → Leyi
- Last Name → Li
- Email → lileyi719@gmail.com
- Phone → (628) 306-6284
- Resume → Upload file

Steps:
1. Fill name fields
2. Fill email/phone
3. Upload resume from /tmp/openclaw/uploads/resume.pdf
4. Submit
```

#### COMEET (Simple Form)
```
Typical fields:
- Full Name → Leyi Li
- Email → lileyi719@gmail.com
- Phone → (628) 306-6284
- Resume → Upload file

Steps:
1. Fill name
2. Fill email/phone
3. Upload resume from /tmp/openclaw/uploads/resume.pdf
4. Submit
```

#### WORKDAY (Complex - Use MASTER_apply.md)
```
DO NOT use this skill for Workday.
Route to: ~/.openclaw/skills/workday-apply/MASTER_apply.md
```

#### GREENHOUSE (Skip - 0% Success Rate)
```
DO NOT attempt Greenhouse applications.
React-Select components do not respond to browser automation.
Mark as "skipped_greenhouse" and move to next job.
```

#### iCIMS (Skip - 0% Success Rate)
```
DO NOT attempt iCIMS applications.
Complex forms with unreliable automation.
Mark as "skipped_icims" and move to next job.
```

### STEP 3: HANDLE ADDITIONAL QUESTIONS
**Common additional fields:**
- "Why do you want to work here?" → Skip (not required*)
- "What's your expected salary?" → Skip or use range from resume
- "Are you authorized to work in the US?" → Yes
- "Do you require visa sponsorship?" → Answer truthfully
- LinkedIn profile → Optional (skip unless required*)
- GitHub/Portfolio → Optional (skip unless required*)

**Rule: Skip optional fields. Only fill required fields (marked with *).**

### STEP 4: UPLOAD RESUME
```
1. Click "Upload" or "Choose File" button
2. If file dialog appears:
   - Use ~/Documents/resume.txt as text resume
   - OR use ~/Documents/resume.pdf if exists (preferred for uploads)
3. Wait for upload confirmation
4. Verify resume is attached
```

### STEP 5: SUBMIT APPLICATION
```
1. Review filled fields
2. Click Submit/Apply button
3. Wait for confirmation:
   - "Application submitted" message
   - Thank you page
   - Confirmation email mention
4. Record success in progress file
```

### STEP 6: RECORD RESULTS
```
Update ~/Documents/batch_progress.json:
{
  "job_url": "...",
  "platform": "ashby|greenhouse|lever|other",
  "status": "submitted",
  "submitted_at": "ISO timestamp"
}

Append to ~/Documents/applied_jobs.json:
{
  "title": "...",
  "company": "...",
  "platform": "...",
  "external_url": "...",
  "submitted_at": "...",
  "source": "linkedin_classifier"
}
```

## CRITICAL RULES

### Rule 1: SKIP OPTIONAL FIELDS
- Only fill fields marked with * (required)
- Skip cover letters unless explicitly required
- Skip "Why do you want to work here" essays
- Skip portfolio/GitHub/LinkedIn links unless required

### Rule 2: NO TIMEOUT
- Each application takes as long as needed
- Do NOT auto-skip based on time
- Only fail on unrecoverable errors

### Rule 3: CONTINUE ON ERROR
- Individual field failure → Try alternate approach
- Platform not recognized → Fill generic fields
- Upload fails → Try drag-and-drop or text paste

### Rule 4: USE RESUME DATA ONLY
- Never invent information
- If field not in resume → Skip or use placeholder
- Phone format: (628) 306-6284
- Email: lileyi719@gmail.com (always)

### Rule 5: BROWSER TARGET
- Always use `target="host"`
- Never use sandbox or isolated browser

## ERROR HANDLING

### Captcha/Verification Wall
```
1. Alert user
2. Pause application
3. Wait for user to solve
4. Continue after user confirms
```

### Login Required
```
1. Check if account exists
2. If not → Create account using resume email
3. If yes → Login with email
4. Continue application
```

### File Upload Fails
```
1. Try alternative upload method (drag-drop)
2. Try copy-paste text if text field available
3. Skip and submit without resume if allowed
4. Mark as "submitted without resume"
```

### Unknown Platform
```
1. Snapshot page
2. Identify form fields
3. Fill required fields generically
4. Submit
5. Record as "unknown platform"
```

## INTEGRATION WITH CLASSIFIER

**Input:** ~/Documents/external_apply_jobs.json from linkedin-job-classifier

**Process:**
```
1. Read external_apply_jobs.json
2. For each job:
   - Navigate to external_url
   - Detect platform
   - Apply using platform-specific strategy
   - Record result
3. Generate summary report
```

## EXAMPLE EXECUTION

```
[APPLY] Starting external applications...
[APPLY] 2 jobs to process

[APPLY] Job 1: Everis - Ashby platform
[APPLY] Filling Name: Leyi Li
[APPLY] Filling Email: lileyi719@gmail.com
[APPLY] Uploading resume...
[APPLY] Filling Phone: (628) 306-6284
[APPLY] Submitting...
[APPLY] ✅ Application submitted

[APPLY] Job 2: Alignerr - Custom platform
[APPLY] Navigating to https://www.alignerr.com/jobs/...
[APPLY] Snapshot page...
[APPLY] Platform: Alignerr (custom form)
[APPLY] Filling basic info...
[APPLY] Submitting...
[APPLY] ✅ Application submitted

[APPLY] Summary: 2/2 submitted successfully
[APPLY] Files updated: batch_progress.json, applied_jobs.json
```

## FILES

- **Skill:** ~/.openclaw/skills/external-apply/SKILL.md
- **Resume:** ~/Documents/resume.txt
- **Input:** ~/Documents/external_apply_jobs.json
- **Progress:** ~/Documents/batch_progress.json
- **Applied History:** ~/Documents/applied_jobs.json