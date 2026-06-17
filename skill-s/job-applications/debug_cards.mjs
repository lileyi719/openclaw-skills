import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const url = 'https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=United+States&f_AL=true&sortBy=DD';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dump the full HTML of a few job cards to understand structure
  const cardHTML = await page.evaluate(() => {
    const items = document.querySelectorAll('.jobs-search__results-list li');
    const results = [];
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const html = items[i].outerHTML;
      const text = items[i].textContent.trim();
      results.push({ index: i, text: text.substring(0, 500), html: html.substring(0, 2000) });
    }
    return results;
  });

  for (const c of cardHTML) {
    console.log(`\n=== Card ${c.index} text ===`);
    console.log(c.text);
    console.log(`\n=== Card ${c.index} HTML ===`);
    console.log(c.html);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
