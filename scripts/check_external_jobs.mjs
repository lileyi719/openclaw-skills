import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  'skills/job-applications/.browser-profile/linkedin',
  { headless: true, viewport: { width: 1280, height: 900 } }
);
const page = ctx.pages()[0] || await ctx.newPage();

await page.goto('https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=United%20States&f_E=2', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

// Scroll to load more
await page.evaluate(() => {
  const scroller = document.querySelector('.jobs-search-results-list');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
});
await new Promise(r => setTimeout(r, 3000));

const cards = await page.$$('.job-card-container');
console.log('Found cards:', cards.length);

for (let i = 0; i < Math.min(cards.length, 10); i++) {
  try {
    const card = (await page.$$('.job-card-container'))[i];
    if (!card) continue;
    
    const title = await card.$eval('.job-card-container__link, .job-card-list__title', el => el.textContent.trim()).catch(() => 'unknown');
    
    await card.click();
    await new Promise(r => setTimeout(r, 3000));
    
    const btns = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('button, a').forEach(el => {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent.trim();
        const lower = text.toLowerCase();
        if (lower.includes('apply') || lower.includes('external')) {
          results.push({
            tag,
            text: text.substring(0, 80),
            href: (el.getAttribute('href') || '').substring(0, 150),
            aria: el.getAttribute('aria-label') || ''
          });
        }
      });
      return results;
    });
    
    // Also check job details for apply type
    const applyType = await page.evaluate(() => {
      const body = document.body.textContent;
      if (body.includes('Easy Apply')) return 'easy_apply';
      if (body.includes('Apply on company website') || body.includes('External Apply')) return 'external_apply';
      if (body.includes('Applied')) return 'already_applied';
      return 'unknown';
    });
    
    console.log(`[${i}] [${applyType}] ${title.substring(0, 50)} @ ${await card.$eval('.job-card-container__company-name', el => el.textContent.trim()).catch(() => '?')}`);
    
    if (applyType === 'external_apply') {
      const extLinks = btns.filter(b => b.text.toLowerCase().includes('apply on') || b.text.toLowerCase().includes('external') || b.href.includes('http'));
      extLinks.forEach(b => console.log(`     → ${b.text} | ${b.href}`));
    }
    console.log('');
    
  } catch(e) {
    console.log(`Card ${i} error: ${e.message}`);
  }
}

await ctx.close();
