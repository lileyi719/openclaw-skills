import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const url = 'https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=United+States&f_AL=true&sortBy=DD';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // Get page HTML and print key info
  const info = await page.evaluate(() => {
    const url = window.location.href;
    const title = document.title;
    const bodyText = document.body?.innerText?.substring(0, 3000) || 'NO BODY';
    // Check for login
    const loginForm = document.querySelector('.login-form, #username, .sign-in-form') !== null;
    const loginText = bodyText.includes('Sign in') || bodyText.includes('Email') || bodyText.includes('Password');
    
    // Try to find job-related elements
    const jobSelectors = [
      '.job-card-container',
      '.job-card-list',
      '[data-job-id]',
      '.jobs-search__results-list',
      '.jobs-search-results-list',
      '.scaffold-layout__list-item',
      'article',
      '.job-card-search'
    ];
    
    const foundElements = {};
    for (const sel of jobSelectors) {
      const els = document.querySelectorAll(sel);
      foundElements[sel] = els.length;
      if (els.length > 0) {
        foundElements[sel + '_sample'] = els[0].outerHTML.substring(0, 300);
      }
    }

    // Count links
    const allLinks = [...document.querySelectorAll('a')].map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 50) })).filter(a => a.href);

    return {
      url,
      title,
      bodyExcerpt: bodyText.substring(0, 2000),
      loginRequired: loginForm || loginText,
      foundElements,
      links: allLinks.slice(0, 20)
    };
  });

  console.log('URL:', info.url);
  console.log('Title:', info.title);
  console.log('Login required:', info.loginRequired);
  console.log('\n=== Body Excerpt ===');
  console.log(info.bodyExcerpt);
  console.log('\n=== Found Elements by Selector ===');
  for (const [k, v] of Object.entries(info.foundElements)) {
    if (v) console.log(`  ${k}:`, typeof v === 'number' ? v : v.substring(0, 200));
  }
  console.log('\n=== Links (first 20) ===');
  for (const l of info.links) {
    console.log(`  ${l.text || '(no text)'} -> ${l.href}`);
  }

  await page.screenshot({ path: 'screenshots/debug.png', fullPage: false });
  console.log('\nScreenshot saved');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
