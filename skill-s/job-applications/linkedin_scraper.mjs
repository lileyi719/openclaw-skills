import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const OUTPUT = path.join(__dirname, 'easy_apply_jobs.json');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
    console.log(`  📸 Screenshot: ${name}.png`);
  } catch {}
}

async function extractEasyApplyJobs(page) {
  return await page.evaluate(() => {
    const items = document.querySelectorAll('.jobs-search__results-list li');
    const results = [];
    for (const li of items) {
      const cardHTML = li.innerHTML;
      // Check for Easy Apply badge (Chinese "抢先申请" or English "Easy Apply")
      if (!cardHTML.includes('抢先申请') && !cardHTML.includes('Easy Apply') && !cardHTML.includes('easy-apply')) continue;

      const titleEl = li.querySelector('.base-search-card__title');
      const companyEl = li.querySelector('.base-search-card__subtitle a');
      const locationEl = li.querySelector('.job-search-card__location');
      const linkEl = li.querySelector('.base-card__full-link');
      
      const title = titleEl?.textContent?.trim() || '';
      const company = companyEl?.textContent?.trim() || '';
      const location = locationEl?.textContent?.trim() || '';
      const link = linkEl?.href || '';
      
      if (title && company) {
        results.push({ title, company, location, link });
      }
    }
    return results;
  });
}

async function scrollJobList(page) {
  return await page.evaluate(() => {
    const scrollers = [
      '.jobs-search-results-list',
      '.scaffold-layout__list',
      '.jobs-search__results-list',
      '.scaffold-layout__list-container',
    ];
    for (const sel of scrollers) {
      const el = document.querySelector(sel);
      if (el) {
        const before = el.scrollTop;
        el.scrollBy(0, 1000);
        if (el.scrollTop !== before) return true;
      }
    }
    // Fallback: scroll body
    const before = window.scrollY;
    window.scrollBy(0, 800);
    return window.scrollY !== before;
  });
}

async function clickNextPage(page) {
  // Try to find and click a "Next" pagination button
  const clicked = await page.evaluate(() => {
    const nextBtn = document.querySelector(
      'button[aria-label="Next"], ' +
      'button.jobs-search-pagination__button[aria-label="下一页"], ' +
      'button[aria-label*="next" i], ' +
      '.artdeco-pagination__button--next button, ' +
      'li.artdeco-pagination__indicator + li button, ' +
      'button:has(svg use[href*="chevron-right"])'
    );
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.click();
      return true;
    }
    // Try numbered page buttons
    const buttons = document.querySelectorAll('.artdeco-pagination__indicator button');
    // Find the current active page, click the next one
    for (let i = 0; i < buttons.length - 1; i++) {
      if (buttons[i].getAttribute('aria-current') === 'true' || 
          buttons[i].getAttribute('aria-selected') === 'true' ||
          buttons[i].classList.contains('active') ||
          buttons[i].classList.contains('selected')) {
        buttons[i + 1]?.click();
        return true;
      }
    }
    return false;
  });
  return clicked;
}

async function main() {
  console.log('🚀 Starting LinkedIn Easy Apply job scraper...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const url = 'https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=United+States&f_AL=true&sortBy=DD';
  
  console.log(`🔗 Navigating to LinkedIn job search...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000); // Wait for JS rendering
  console.log('✅ Page loaded\n');
  await screenshot(page, '01_initial_load');

  // Check for login redirect
  if (page.url().includes('login') || page.url().includes('checkpoint')) {
    console.log('⚠️  LinkedIn requires login. Please sign in manually in the browser window.');
    console.log('⏳ Waiting up to 180 seconds...');
    try {
      await page.waitForURL('**/jobs/**', { timeout: 180000 });
      console.log('✅ Login successful!\n');
      await sleep(3000);
      await screenshot(page, '02_after_login');
    } catch {
      console.error('❌ Login timeout. Exiting.');
      await browser.close();
      process.exit(1);
    }
  }

  const allEasyApplyJobs = new Map(); // key: title|company
  let currentPage = 0;
  const MAX_PAGES = 10;

  while (allEasyApplyJobs.size < 5 && currentPage < MAX_PAGES) {
    currentPage++;
    console.log(`\n📄 Page ${currentPage} — Found ${allEasyApplyJobs.size}/5 Easy Apply jobs`);

    // Wait for job cards to render on this page
    await sleep(4000);

    // Extract Easy Apply jobs from current page
    const pageJobs = await extractEasyApplyJobs(page);
    console.log(`  Found ${pageJobs.length} Easy Apply job(s) on this page`);

    for (const job of pageJobs) {
      const key = `${job.title}|${job.company}`;
      if (!allEasyApplyJobs.has(key)) {
        allEasyApplyJobs.set(key, job);
        console.log(`  ✅ ${job.title} @ ${job.company} — ${job.location}`);
      }
    }

    if (allEasyApplyJobs.size >= 5) {
      console.log(`\n🎉 Found ${allEasyApplyJobs.size} Easy Apply jobs — done collecting!`);
      break;
    }

    // Try to scroll more on the same page first
    let scrolledCount = 0;
    while (scrolledCount < 5) {
      const scrolled = await scrollJobList(page);
      await sleep(2500);
      if (!scrolled) break;
      scrolledCount++;

      const newJobs = await extractEasyApplyJobs(page);
      for (const job of newJobs) {
        const key = `${job.title}|${job.company}`;
        if (!allEasyApplyJobs.has(key)) {
          allEasyApplyJobs.set(key, job);
          console.log(`  ✅ (scrolled) ${job.title} @ ${job.company} — ${job.location}`);
        }
      }
      if (allEasyApplyJobs.size >= 5) break;
      console.log(`  Scrolled more (${scrolledCount})... ${allEasyApplyJobs.size}/5`);
    }

    if (allEasyApplyJobs.size >= 5) break;

    // Try pagination
    const clickedNext = await clickNextPage(page);
    if (!clickedNext) {
      console.log('  ⚠️ No more pages available');
      break;
    }
    console.log('  📄 Going to next page...');
    await page.waitForTimeout(5000);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await sleep(2000);
  }

  await screenshot(page, '03_final_results');

  // Format results
  const resultArray = [...allEasyApplyJobs.values()].slice(0, 5).map(j => ({
    title: j.title,
    company: j.company,
    location: j.location,
    linkedin_link: j.link
  }));

  console.log('\n' + '='.repeat(60));
  console.log(`📊 FINAL RESULTS: ${resultArray.length} Easy Apply jobs`);
  console.log('='.repeat(60));
  console.log(JSON.stringify(resultArray, null, 2));

  // Write to file
  writeFileSync(OUTPUT, JSON.stringify(resultArray, null, 2), 'utf-8');
  console.log(`\n💾 Saved to: ${OUTPUT}`);

  await browser.close();
  console.log('\n✅ 全部完成');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
