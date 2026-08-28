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
  const method = isEmailApplyUrl(applyUrl) ? 'email' : 'webForm';

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
    const canDirectApply = DIRECT_APPLY_PATTERNS.some(p => applyUrl.includes(p));

    if (method === 'email') {
      const emailAddress = extractEmail(applyUrl);
      console.log(chalk.gray(`  Sending email to ${emailAddress}...`));
      applied = await sendEmailApplication(job, cv.text, coverLetter?.text || '', emailAddress, pdfPath);
    } else if (canDirectApply && isValidHttpUrl(applyUrl)) {
      console.log(chalk.gray('  Filling web form...'));
      applied = await attemptAutoApply(job, cv.text, coverLetter?.text || '', pdfPath, appDir);
    } else {
      console.log(chalk.yellow(`  CV and PDF saved. Manual apply required: ${applyUrl}`));
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOpts);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.goto(job.applyUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.screenshot({ path: path.join(appDir, 'apply-before.png') });

    const filled = await fillApplicationForm(page, cvText, coverLetterText);
    await uploadPdfToForm(page, pdfPath);

    if (filled) {
      await page.screenshot({ path: path.join(appDir, 'apply-filled.png') });
      // Auto-submit is disabled by default. Enable only after manual verification.
      // await page.click('button[type="submit"], input[type="submit"]');
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
