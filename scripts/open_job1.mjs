import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  'skills/job-applications/.browser-profile/linkedin',
  { headless: false, viewport: { width: 1280, height: 900 } }
);
const page = ctx.pages()[0] || await ctx.newPage();

// Go to LinkedIn first to check login
await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
console.log('Logged in:', !(await page.textContent('body')).includes('Sign in'));

// Go to search page
await page.goto('https://www.linkedin.com/jobs/search/?keywords=Entry-level%20Sales%20Pharma&location=United%20States&f_AL=true', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

// Click first card
const cards = await page.$$('.job-card-container');
if (cards.length > 0) {
  await cards[0].click();
  await new Promise(r => setTimeout(r, 4000));

  // Check for Easy Apply button in detail panel
  const info = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => ({
      text: b.textContent.trim().substring(0, 60),
      aria: b.getAttribute('aria-label') || ''
    }));
    const body = document.body.textContent;
    return {
      btns,
      hasEasyApply: body.includes('Easy Apply'),
      hasApply: body.includes('Apply'),
      hasApplied: body.includes('Applied'),
      title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent?.trim()?.substring(0, 60) || '',
      company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.textContent?.trim() || ''
    };
  });
  console.log(JSON.stringify(info, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'skills/job-applications/job1_detail.png' });
}

await ctx.close();
