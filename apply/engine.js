// apply/engine.js
// Apply engine — routes each job to the correct application method.
// Security: validates URL format before Puppeteer navigates to it.

import puppeteer from 'puppeteer';
import { updateJob, recordApplication, getTodayApplyCount } from '../data/store.js';
import { tailorCV } from '../ai/cv-tailor.js';
import { generateCoverLetter } from '../ai/cover-letter.js';
import { sendEmailApplication, generateCvPdf } from './email.js';
import { config } from '../config.js';
import chalk from 'chalk';
import path from 'path';
import { readFileSync } from 'fs';
import { ensureApplicationsDir } from '../data/store.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _profile = null;
function getProfile() {
  if (!_profile) _profile = JSON.parse(readFileSync(path.join(__dirname, '..', 'profile.json'), 'utf8'));
  return _profile;
}

// ATS platforms that support guest form filling
const DIRECT_APPLY_PATTERNS = [
  'greenhouse.io',
  'lever.co',
  'workable.com',
  'ashbyhq.com',
  'jobs.wordpress.net',
  'breezy.hr',
  'recruitee.com',
  'teamtailor.com',
];

function isEmailApplyUrl(url = '') {
  return url.startsWith('mailto:') || (url.includes('@') && !url.startsWith('http'));
}

function extractEmail(url = '') {
  return url.replace('mailto:', '').split('?')[0].trim();
}

// Security: only allow http/https URLs before navigating with Puppeteer
function isValidHttpUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function checkDailyLimit(method) {
  const limits = config.maxApplicationsPerDay;
  const limit = method === 'email' ? limits.email : limits.webForm;
  const count = await getTodayApplyCount(method);
  if (count >= limit) {
    console.log(chalk.yellow(`  Daily ${method} limit reached (${count}/${limit}). Skipping.`));
    return false;
  }
  return true;
}

export async function applyToJob(job) {
  console.log(chalk.blue(`\nApplying to: ${job.title} @ ${job.company}`));

  const applyUrl = job.applyUrl || '';

  // Use scraper-provided method hint, then fall back to URL detection
  const method = job.applyMethod || (isEmailApplyUrl(applyUrl) ? 'email' : 'webForm');

  const withinLimit = await checkDailyLimit(method);
  if (!withinLimit) {
    await updateJob(job.id, { status: 'skipped_daily_limit' });
    return false;
  }

  try {
    console.log(chalk.gray('  Tailoring CV...'));
    const cv = await tailorCV(job);
    if (!cv) throw new Error('CV tailoring failed');

    console.log(chalk.gray('  Writing cover letter...'));
    const coverLetter = await generateCoverLetter(job, cv.text);

    console.log(chalk.gray('  Generating PDF...'));
    const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const appDir = await ensureApplicationsDir(safeId);
    const pdfPath = path.join(appDir, 'Quadri_Adebisi_CV.pdf');
    await generateCvPdf(cv.text, pdfPath);

    let applied = false;

    if (method === 'email') {
      const emailAddress = extractEmail(applyUrl);
      console.log(chalk.gray(`  Sending email to ${emailAddress}...`));
      applied = await sendEmailApplication(job, cv.text, coverLetter?.text || '', emailAddress, pdfPath);
    } else if (method === 'manual' || !isValidHttpUrl(applyUrl)) {
      console.log(chalk.yellow(`  CV saved. Manual apply required: ${applyUrl}`));
    } else {
      // Try webForm for any valid http/https URL (no ATS whitelist restriction)
      console.log(chalk.gray('  Filling web form...'));
      applied = await attemptAutoApply(job, cv.text, coverLetter?.text || '', pdfPath, appDir);
    }

    await recordApplication(
      { ...job, autoApplied: applied },
      cv.path,
      coverLetter?.path || '',
      method
    );

    await updateJob(job.id, {
      status: applied ? 'applied' : 'ready_to_apply',
      applyMethod: method,
      applied,
      appliedAt: applied ? new Date().toISOString() : null,
      cvTailored: true,
      pdfGenerated: true,
      coverLetterGenerated: !!coverLetter,
    });

    console.log(applied
      ? chalk.green(`  Applied (${method}) successfully.`)
      : chalk.yellow(`  Not auto-applied. Files saved.`)
    );

    return applied;
  } catch (err) {
    console.error(chalk.red(`  Apply failed: ${err.message}`));
    await updateJob(job.id, { status: 'apply_failed', error: err.message });
    return false;
  }
}

async function attemptAutoApply(job, cvText, coverLetterText, pdfPath, appDir) {
  let browser = null;
  try {
    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    // Step 1: Navigate to the URL
    try {
      await page.goto(job.applyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (navErr) {
      console.warn(`[AutoApply] Navigation warning:`, navErr.message);
      return false;
    }

    const landedUrl = page.url();
    console.log(chalk.gray(`  Landed on: ${landedUrl}`));
    await page.screenshot({ path: path.join(appDir, 'apply-before.png') });

    // Step 2: If this is a WordPress Jobs listing page, extract real apply info from page
    if (landedUrl.includes('jobs.wordpress.net')) {
      // Extract all mailto links from the page
      const mailtoLinks = await page.$$eval('a[href^="mailto:"]', links => links.map(l => l.href));
      if (mailtoLinks.length > 0) {
        const emailAddr = extractEmail(mailtoLinks[0]);
        console.log(chalk.cyan(`  Found email on listing page: ${emailAddr}`));
        const applied = await sendEmailApplication(job, cvText, coverLetterText, emailAddr, pdfPath);
        return applied;
      }

      // Extract email from page body text
      const bodyText = await page.evaluate(() => document.body.innerText);
      const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@(?!wordpress|example|sentry|w3)[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const emailAddr = emailMatch[0];
        console.log(chalk.cyan(`  Found email in page text: ${emailAddr}`));
        const applied = await sendEmailApplication(job, cvText, coverLetterText, emailAddr, pdfPath);
        return applied;
      }

      // Extract external apply links (not wordpress.net/wordpress.org)
      const externalLinks = await page.$$eval('a[href]', links =>
        links
          .map(l => ({ href: l.href, text: l.innerText.toLowerCase().trim() }))
          .filter(l =>
            l.href.startsWith('http') &&
            !l.href.includes('jobs.wordpress.net') &&
            !l.href.includes('wordpress.org') &&
            !l.href.includes('profiles.wordpress') &&
            (l.text.includes('apply') || l.text.includes('application') || l.text.includes('submit'))
          )
      );

      if (externalLinks.length > 0) {
        const applyLink = externalLinks[0].href;
        console.log(chalk.cyan(`  Following external apply link: ${applyLink}`));
        try {
          await page.goto(applyLink, { waitUntil: 'networkidle2', timeout: 25000 });
          console.log(chalk.gray(`  Navigated to: ${page.url()}`));
        } catch { /* ignore navigation errors */ }
      } else {
        console.log(chalk.yellow(`  No email or apply link found on listing page. Files saved for manual apply.`));
        return false;
      }
    }

    // Step 3: On non-listing pages, check for standard mailto links
    if (!landedUrl.includes('jobs.wordpress.net')) {
      try {
        const mailtoHref = await page.$eval('a[href^="mailto:"]', el => el.href);
        if (mailtoHref) {
          const emailAddr = extractEmail(mailtoHref);
          console.log(chalk.cyan(`  Detected mailto on page: ${emailAddr}`));
          const applied = await sendEmailApplication(job, cvText, coverLetterText, emailAddr, pdfPath);
          return applied;
        }
      } catch { /* no mailto found */ }
    }

    // Step 4: Try filling the form on whatever page we're now on
    const filled = await fillApplicationForm(page, cvText, coverLetterText);
    await uploadPdfToForm(page, pdfPath);

    if (filled) {
      console.log(chalk.green(`  Form filled successfully on: ${page.url()}`));
      await page.screenshot({ path: path.join(appDir, 'apply-filled.png') });
    } else {
      console.log(chalk.yellow(`  No fillable form found at: ${page.url()} — files saved for manual apply.`));
      await page.screenshot({ path: path.join(appDir, 'apply-no-form.png') });
    }

    return filled;
  } catch (err) {
    console.error('[AutoApply] Form fill failed:', err.message);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}



async function uploadPdfToForm(page, pdfPath) {
  const selectors = [
    'input[type="file"][accept*="pdf"]',
    'input[type="file"][name*="resume"]',
    'input[type="file"][name*="cv"]',
    'input[type="file"][id*="resume"]',
    'input[type="file"][id*="cv"]',
    'input[type="file"]',
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.uploadFile(pdfPath);
        console.log(chalk.green('  PDF uploaded to form.'));
        return true;
      }
    } catch { /* field not found, try next */ }
  }
  return false;
}

async function fillApplicationForm(page, cvText, coverLetterText) {
  const profile = getProfile();
  const fields = [
    { selectors: ['input[name*="name"]', 'input[id*="name"]', 'input[placeholder*="name" i]'], value: profile.personal.name },
    { selectors: ['input[name*="first"]', 'input[id*="first"]'], value: profile.personal.name.split(' ')[0] },
    { selectors: ['input[name*="last"]', 'input[id*="last"]'], value: profile.personal.name.split(' ')[1] || '' },
    { selectors: ['input[type="email"]', 'input[name*="email"]'], value: profile.personal.email },
    { selectors: ['input[name*="website"]', 'input[name*="portfolio"]', 'input[placeholder*="website" i]'], value: profile.personal.portfolio },
    { selectors: ['input[name*="github"]', 'input[placeholder*="github" i]'], value: profile.personal.github },
    { selectors: ['textarea[name*="cover"]', 'textarea[id*="cover"]', 'textarea[placeholder*="cover" i]'], value: coverLetterText },
  ];

  let filled = 0;
  for (const field of fields) {
    if (!field.value) continue;
    for (const selector of field.selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(field.value, { delay: 20 });
          filled++;
          break;
        }
      } catch { /* skip */ }
    }
  }

  return filled > 0;
}
