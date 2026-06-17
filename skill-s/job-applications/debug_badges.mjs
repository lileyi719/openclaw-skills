import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const url = 'https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=United+States&f_AL=true&sortBy=DD';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // Check ALL badges and spans inside the job list
  const badges = await page.evaluate(() => {
    const list = document.querySelector('.jobs-search__results-list');
    if (!list) return 'NO LIST FOUND';
    
    const allSpans = list.querySelectorAll('span, div, .job-search-card__easy-apply-badge, [class*="easy"], [class*="badge"]');
    const results = [];
    for (const el of allSpans) {
      const text = el.textContent.trim();
      const cls = el.className;
      if (text.length > 0 && text.length < 100) {
        // Check for easy apply related text
        if (text.toLowerCase().includes('easy') || text.includes('抢先') || text.includes('快速') || text.includes('Apply') || text.includes('申请')) {
          results.push({ text, class: cls, tag: el.tagName });
        }
      }
      // Also collect unique class names
      if (el.className && (el.className.includes('badge') || el.className.includes('easy') || el.className.includes('apply'))) {
        results.push({ text, class: cls, tag: el.tagName });
      }
    }
    return results;
  });

  console.log('=== Badges found ===');
  for (const b of badges) {
    console.log(`  text="${b.text}" | class="${b.class}" | tag=${b.tag}`);
  }

  // Also check the full HTML of one specific card that had "抢先申请"
  const easyApplyHTML = await page.evaluate(() => {
    const list = document.querySelector('.jobs-search__results-list');
    const lis = list.querySelectorAll('li');
    for (const li of lis) {
      if (li.textContent.includes('抢先申请')) {
        return li.outerHTML.substring(0, 4000);
      }
    }
    return 'NOT FOUND';
  });

  console.log('\n=== Card with "抢先申请" (Easy Apply) HTML ===');
  console.log(easyApplyHTML);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
