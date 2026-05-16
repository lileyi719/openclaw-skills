import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'skills', 'job-applications');
mkdirSync(OUT_DIR, { recursive: true });

const SEARCH_URL = 'https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States';
const LIMIT = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[CLASSIFIER] Launching browser...');
  const browser = await chromium.launch({ headless: false }); // visible for login
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  console.log(`[CLASSIFIER] Navigating to LinkedIn Jobs search...`);
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Check if logged in by looking for profile icon
  const profileIcon = await page.$('.global-nav__me-photo, .profile-icon, img[alt*="photo"], .nav-item__profile-member-photo');
  if (!profileIcon) {
    // Check for sign-in link
    const signInBtn = await page.$('a[href*="login"], a.nav__button-tertiary, a[data-tracking-control="guest-home-nav"]');
    if (signInBtn) {
      console.log('[CLASSIFIER] ❌ Not logged into LinkedIn. Please log in manually.');
      console.log('[CLASSIFIER] The browser is open. Log in, then press Enter here.');
      await new Promise(r => {
        process.stdin.once('data', r);
        console.log('[CLASSIFIER] Waiting for you to log in and press Enter...');
      });
    } else {
      // Might already be logged in but we can't tell visually - check page content
      console.log('[CLASSIFIER] Checking profile indicator...');
      // Try to wait a bit more
      await sleep(2000);
    }
  }

  // Wait for job listings to load
  try {
    await page.waitForSelector('.job-card-container, .jobs-search-results__list, .scaffold-layout__list-container', { timeout: 10000 });
  } catch {
    console.log('[CLASSIFIER] Waiting additional time for listings...');
    await sleep(5000);
  }

  // Wait for page to settle
  await sleep(3000);

  // Take a screenshot for debugging
  await page.screenshot({ path: resolve(OUT_DIR, 'linkedin_debug.png') });
  console.log('[CLASSIFIER] 📸 Debug screenshot saved.');

  // Get job cards
  const jobCards = await page.$$('.job-card-container, .jobs-search-results__list-item');
  console.log(`[CLASSIFIER] Found ${jobCards.length} job cards on page.`);

  const easyApplyJobs = [];
  const externalApplyJobs = [];

  // Process each job card (up to LIMIT)
  const toProcess = jobCards.slice(0, LIMIT);
  for (let i = 0; i < toProcess.length; i++) {
    const card = toProcess[i];
    console.log(`\n[CLASSIFIER] --- Processing job ${i + 1}/${toProcess.length} ---`);

    try {
      // Scroll card into view
      await card.scrollIntoViewIfNeeded();
      await sleep(500);

      // Get title, company, location
      const titleEl = await card.$('.job-card-list__title, .jobs-search-results__list-item a, .job-card-container__link, a[data-tracking-control="job-card"]');
      const title = titleEl ? (await titleEl.textContent()).trim() : 'Unknown Title';
      
      const companyEl = await card.$('.job-card-container__company-name, .artdeco-entity-lockup__subtitle, .job-card-container__primary-description');
      const company = companyEl ? (await companyEl.textContent()).trim() : 'Unknown Company';
      
      const locationEl = await card.$('.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-card-container__secondary-description');
      const location = locationEl ? (await locationEl.textContent()).trim() : 'Unknown Location';

      // Get job URL from the card
      let jobUrl = '';
      const linkEl = await card.$('a');
      if (linkEl) {
        jobUrl = await linkEl.getAttribute('href');
        if (jobUrl && !jobUrl.startsWith('http')) {
          jobUrl = 'https://www.linkedin.com' + jobUrl;
        }
      }

      console.log(`[CLASSIFIER] Job: "${title}" at ${company} (${location})`);

      // Check for Easy Apply text in the card
      const cardText = await card.textContent();
      const easyApplyLabel = await card.$('text="Easy Apply", span:text("Easy Apply"), [class*="easy-apply"], span:has-text("Easy Apply")');

      // Check text content for Easy Apply
      const hasEasyApply = cardText.includes('Easy Apply');
      const hasExternalApply = cardText.includes('External Apply');

      if (hasEasyApply) {
        console.log(`[CLASSIFIER] ✅ Easy Apply detected on card`);
        
        // Extract LinkedIn job ID from URL
        const jobId = jobUrl ? jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1] || '' : '';
        
        easyApplyJobs.push({
          title,
          company,
          location,
          linkedin_job_id: jobId,
          url: jobUrl,
          apply_type: 'easy_apply'
        });
      } else {
        console.log(`[CLASSIFIER] ➡ Needs detail check (no Easy Apply on card)`);
        
        // Click on the card to open detail view
        try {
          await card.click();
          await sleep(3000);

          // In the detail panel, find the Apply button
          const detailPanel = await page.$('.jobs-search__job-details, .jobs-details, .artdeco-card, .job-view-layout, .jobs-details__main-content, .px-4.py-4');
          
          let detailText = '';
          if (detailPanel) {
            detailText = await detailPanel.textContent();
          } else {
            detailText = await page.textContent();
          }

          // Find Apply button in detail view
          const easyApplyBtn = await page.$('button:has-text("Easy Apply"), button[aria-label*="Easy Apply"], span:has-text("Easy Apply")');
          const applyBtn = await page.$('button:has-text("Apply"), a:has-text("Apply")');
          const companyApplyBtn = await page.$('button:has-text("Apply on company website"), a:has-text("Apply on company website")');

          let applyType = 'unknown';
          let externalUrl = '';

          if (easyApplyBtn) {
            console.log(`[CLASSIFIER] ✅ Easy Apply found in detail view`);
            const jobId = jobUrl ? jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1] || '' : '';
            easyApplyJobs.push({
              title,
              company,
              location,
              linkedin_job_id: jobId,
              url: jobUrl,
              apply_type: 'easy_apply'
            });
          } else if (companyApplyBtn) {
            console.log(`[CLASSIFIER] 🔗 External Apply found ("Apply on company website")`);
            // Click to open external URL
            try {
              const href = await companyApplyBtn.getAttribute('href');
              console.log(`[CLASSIFIER] External URL: ${href}`);
              
              // Extract job ID
              const jobId = jobUrl ? jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1] || '' : '';

              // Detect platform
              let platform = 'other';
              if (href) {
                if (href.includes('ashbyhq.com')) platform = 'ashby';
                else if (href.includes('myworkdayjobs.com')) platform = 'workday';
                else if (href.includes('greenhouse.io')) platform = 'greenhouse';
                else if (href.includes('lever.co')) platform = 'lever';
                else if (href.includes('bamboohr.com')) platform = 'bamboohr';
                else if (href.includes('jazzhr.com')) platform = 'jazzhr';
                else if (href.includes('comeet.com')) platform = 'comeet';
                else if (href.includes('rippling.com')) platform = 'rippling';
                else if (href.includes('pinppl.com')) platform = 'pinppl';
              }

              externalApplyJobs.push({
                title,
                company,
                location,
                linkedin_job_id: jobId,
                linkedin_url: jobUrl,
                external_url: href || '',
                platform,
                apply_type: 'external_apply'
              });
            } catch (e) {
              console.log(`[CLASSIFIER] ⚠ Failed to get external URL: ${e.message}`);
            }
          } else if (applyBtn) {
            console.log(`[CLASSIFIER] 🔗 "Apply" button found (likely external)`);
            // Try to get external URL
            try {
              const href = await applyBtn.getAttribute('href');
              console.log(`[CLASSIFIER] External URL: ${href}`);
              
              const jobId = jobUrl ? jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1] || '' : '';
              let platform = 'other';
              if (href) {
                if (href.includes('ashbyhq.com')) platform = 'ashby';
                else if (href.includes('myworkdayjobs.com')) platform = 'workday';
                else if (href.includes('greenhouse.io')) platform = 'greenhouse';
                else if (href.includes('lever.co')) platform = 'lever';
                else if (href.includes('bamboohr.com')) platform = 'bamboohr';
                else if (href.includes('jazzhr.com')) platform = 'jazzhr';
                else if (href.includes('comeet.com')) platform = 'comeet';
                else if (href.includes('rippling.com')) platform = 'rippling';
                else if (href.includes('pinppl.com')) platform = 'pinppl';
              }

              externalApplyJobs.push({
                title,
                company,
                location,
                linkedin_job_id: jobId,
                linkedin_url: jobUrl,
                external_url: href || '',
                platform,
                apply_type: 'external_apply'
              });
            } catch (e) {
              console.log(`[CLASSIFIER] ⚠ Failed to get external URL: ${e.message}`);
            }
          } else {
            console.log(`[CLASSIFIER] ❓ No Apply button found in detail view`);
          }

        } catch (e) {
          console.log(`[CLASSIFIER] ⚠ Error processing detail: ${e.message}`);
        }
      }

      await sleep(2000); // Rate limiting delay

    } catch (e) {
      console.log(`[CLASSIFIER] ⚠ Error processing job card ${i + 1}: ${e.message}`);
    }
  }

  // Write output files
  const easyPath = resolve(OUT_DIR, 'easy_apply_jobs.json');
  const extPath = resolve(OUT_DIR, 'external_apply_jobs.json');

  writeFileSync(easyPath, JSON.stringify(easyApplyJobs, null, 2));
  writeFileSync(extPath, JSON.stringify(externalApplyJobs, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('[CLASSIFIER] ✅ Scan Complete!');
  console.log(`[CLASSIFIER] Total scanned: ${toProcess.length}`);
  console.log(`[CLASSIFIER] Easy Apply: ${easyApplyJobs.length}`);
  console.log(`[CLASSIFIER] External Apply: ${externalApplyJobs.length}`);
  console.log(`[CLASSIFIER]`);
  console.log(`[CLASSIFIER] Files saved:`);
  console.log(`[CLASSIFIER]   ${easyPath}`);
  console.log(`[CLASSIFIER]   ${extPath}`);

  if (externalApplyJobs.length > 0) {
    console.log(`[CLASSIFIER]`);
    console.log(`[CLASSIFIER] External platforms breakdown:`);
    const platforms = {};
    for (const job of externalApplyJobs) {
      platforms[job.platform] = (platforms[job.platform] || 0) + 1;
    }
    for (const [p, count] of Object.entries(platforms)) {
      console.log(`[CLASSIFIER]   ${p}: ${count}`);
    }
  }

  // Keep browser open for debugging
  console.log('\n[CLASSIFIER] Press Enter to close browser...');
  await new Promise(r => process.stdin.once('data', r));
  
  await browser.close();
  console.log('[CLASSIFIER] Browser closed.');
}

main().catch(err => {
  console.error('[CLASSIFIER] ❌ Fatal error:', err);
  process.exit(1);
});
