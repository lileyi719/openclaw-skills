import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  'skills/job-applications/.browser-profile/linkedin',
  { headless: true, viewport: { width: 1280, height: 900 } }
);
const page = ctx.pages()[0] || await ctx.newPage();

// Try searching for specific roles that tend to be external
const searchUrls = [
  'https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States&f_WT=2',
  'https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Engineer&location=United%20States',
  'https://www.linkedin.com/jobs/search/?keywords=Backend%20Engineer&location=United%20States'
];

let externalFound = [];

for (const url of searchUrls) {
  console.log(`\n=== Searching: ${url.substring(0, 80)}... ===`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // Scroll to load more
  await page.evaluate(() => {
    const scroller = document.querySelector('.jobs-search-results-list');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await new Promise(r => setTimeout(r, 3000));

  const cards = await page.$$('.job-card-container');
  console.log('Cards:', cards.length);

  for (let i = 0; i < Math.min(cards.length, 7); i++) {
    try {
      const card = (await page.$$('.job-card-container'))[i];
      if (!card) continue;

      await card.click();
      await new Promise(r => setTimeout(r, 3000));

      const info = await page.evaluate(() => {
        const body = document.body.textContent;
        const isEasy = body.includes('Easy Apply') && !body.includes('Apply on company website');
        const isExternal = body.includes('Apply on company website') || body.includes('External Apply') || body.includes('company website');
        const isApplied = body.includes('Applied');
        
        // Find the external apply link/button
        let externalUrl = '';
        let applyBtn = '';
        document.querySelectorAll('a').forEach(a => {
          const t = a.textContent.trim().toLowerCase();
          if (t.includes('apply on') || t.includes('external')) {
            externalUrl = a.getAttribute('href') || '';
            applyBtn = a.textContent.trim();
          }
        });
        
        const titleEl = document.querySelector('.job-view-layout h1, .jobs-details-top-card h1, .job-details-jobs-unified-top-card__job-title');
        const companyEl = document.querySelector('.job-view-layout .job-details-jobs-unified-top-card__company-name, .jobs-details-top-card h2 a, .job-details-jobs-unified-top-card__company-name');
        
        return {
          type: isExternal ? 'external' : isEasy ? 'easy_apply' : isApplied ? 'applied' : 'other',
          title: titleEl?.textContent?.trim() || '',
          company: companyEl?.textContent?.trim() || '',
          externalUrl,
          applyBtnText: applyBtn
        };
      });
      
      console.log(`[${i}] ${info.type} | ${info.title.substring(0, 50)} @ ${info.company.substring(0, 30)}`);
      if (info.type === 'external') {
        console.log(`     APPLY: ${info.applyBtnText} | ${info.externalUrl.substring(0, 120)}`);
        externalFound.push(info);
      }
      
    } catch(e) {
      console.log(`Card ${i} error: ${e.message}`);
    }
  }
  
  if (externalFound.length >= 3) break;
}

console.log(`\n\n=== EXTERNAL JOBS FOUND: ${externalFound.length} ===`);
externalFound.forEach((j, i) => {
  console.log(`${i+1}. ${j.title} @ ${j.company}`);
  console.log(`   ${j.externalUrl}`);
});

// Save found external jobs
const fs = await import('fs');
fs.writeFileSync('skills/job-applications/external_found.json', JSON.stringify(externalFound, null, 2));
console.log('\nSaved to external_found.json');

await ctx.close();
