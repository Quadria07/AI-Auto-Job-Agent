// apply/engine.js
// Apply engine — routes each job to the correct application method.
// Security: validates URL format before Puppeteer navigates to it.

import puppeteer from 'puppeteer';
import { updateJob, recordApplication, getTodayApplyCount, readApplied } from '../data/store.js';
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

export function canAutoApplyJob(job) {
  const url = (job.applyUrl || '').toLowerCase().trim();

  // Email application — always directly appliable
  if (isEmailApplyUrl(url) || job.applyMethod === 'email') return true;

  // Known ATS platforms that accept guest form submissions
  const DIRECT_ATS = [
    'greenhouse.io', 'lever.co', 'workable.com', 'ashbyhq.com',
    'breezy.hr', 'recruitee.com', 'teamtailor.com', 'smartrecruiters.com',
    'bamboohr.com', 'jobs.wordpress.net',
  ];
  if (DIRECT_ATS.some(pat => url.includes(pat))) return true;

  // WordPress Jobs with email or known ATS URL — always appliable
  if (job.source && job.source.toLowerCase().includes('wordpress jobs')) {
    // Only auto-appliable if we extracted an email or direct ATS link
    if (job.applyMethod === 'email' || DIRECT_ATS.some(pat => url.includes(pat))) return true;
    return false; // External URLs on WordPress Jobs need manual checking
  }

  // For all other sources (Himalayas, WWR, RemoteOK, Remotive, Jobicy):
  // Only mark as appliable if URL points directly to a known ATS
  return DIRECT_ATS.some(pat => url.includes(pat));
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

export async function applyToJob(job, ignoreLimits = false) {
  console.log(chalk.blue(`\nApplying to: ${job.title} @ ${job.company}`));

  // Check if already applied to this job (by ID, apply URL, or title + company)
  const appliedRecords = await readApplied();
  const alreadyApplied = appliedRecords.some(a =>
    (a.jobId && a.jobId === job.id) ||
    (a.applyUrl && job.applyUrl && a.applyUrl === job.applyUrl) ||
    (a.title && a.title === job.title && a.company === job.company)
  );

  if (alreadyApplied) {
    console.log(chalk.yellow(`  Already applied to ${job.title} @ ${job.company}. Skipping.`));
    await updateJob(job.id, { status: 'already_applied', applied: true });
    return false;
  }

  const applyUrl = job.applyUrl || '';
  const method = job.applyMethod || (isEmailApplyUrl(applyUrl) ? 'email' : 'webForm');

  if (!ignoreLimits) {
    const withinLimit = await checkDailyLimit(method);
    if (!withinLimit) {
      await updateJob(job.id, { status: 'skipped_daily_limit' });
      return false;
    }
  }

  try {
    let applied = false;
    let finalCvPath = '';
    let finalCoverLetterPath = '';
    
    if (method === 'email') {
      const emailAddress = extractEmail(applyUrl);
      console.log(chalk.gray(`  Preparing materials for email application...`));
      const mats = await prepareApplicationMaterials(job);
      finalCvPath = mats.cv.path;
      finalCoverLetterPath = mats.coverLetter?.path || '';
      
      console.log(chalk.gray(`  Sending email to ${emailAddress}...`));
      applied = await sendEmailApplication(job, mats.cv.text, mats.coverLetter?.text || '', emailAddress, mats.pdfPath);
    } else if (!isValidHttpUrl(applyUrl)) {
      console.log(chalk.yellow(`  No valid apply URL. Skipping CV prep.`));
    } else {
      console.log(chalk.gray('  Checking web form...'));
      const result = await attemptAutoApply(job);
      applied = result.applied;
      finalCvPath = result.cvPath || '';
      finalCoverLetterPath = result.coverLetterPath || '';
    }

    // Only record and count towards rate limits if the application actually succeeded
    if (applied) {
      await recordApplication(
        { ...job, autoApplied: true },
        finalCvPath,
        finalCoverLetterPath,
        method
      );
    }

    await updateJob(job.id, {
      status: applied ? 'applied' : 'skipped_no_auto_apply',
      applyMethod: method,
      applied,
      appliedAt: applied ? new Date().toISOString() : null,
      cvTailored: !!finalCvPath,
      pdfGenerated: !!finalCvPath,
      coverLetterGenerated: !!finalCoverLetterPath,
    });

    console.log(applied
      ? chalk.green(`  Applied (${method}) successfully.`)
      : chalk.yellow(`  Not auto-applied. Files saved (if generated).`)
    );

    return applied;
  } catch (err) {
    console.error(chalk.red(`  Apply failed: ${err.message}`));
    await updateJob(job.id, { status: 'apply_failed', error: err.message });
    return false;
  }
}

async function prepareApplicationMaterials(job) {
  console.log(chalk.gray('  Tailoring CV...'));
  const cv = await tailorCV(job);
  if (!cv) throw new Error('CV tailoring failed');

  console.log(chalk.gray('  Writing cover letter...'));
  const coverLetter = await generateCoverLetter(job, cv.text);

  console.log(chalk.gray('  Generating PDF...'));
  const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
  const safeTitle = (job.title || 'Web_Developer').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 30);
  const appDir = await ensureApplicationsDir(safeId);
  const pdfPath = path.join(appDir, `Quadri_Adebisi_${safeTitle}_CV.pdf`);
  await generateCvPdf(cv.text, pdfPath);

  return { cv, coverLetter, pdfPath, appDir };
}async function attemptAutoApply(job) {
  let browser = null;
  const result = { applied: false, cvPath: '', coverLetterPath: '' };
  
  try {
    const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const appDir = await ensureApplicationsDir(safeId);
    
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

    try {
      await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (navErr) {
      console.warn(`[AutoApply] Navigation warning:`, navErr.message);
    }

    const landedUrl = page.url();
    console.log(chalk.gray(`  Landed on: ${landedUrl}`));
    await page.screenshot({ path: path.join(appDir, 'apply-before.png') }).catch(() => {});

    // Ignore platform system/support emails
    const IGNORED_DOMAINS = ['wordpress.net', 'wordpress.org', 'remotive.com', 'jobicy.com', 'himalayas.app', 'weworkremotely.com', 'remoteok.com', 'example.com', 'sentry.io', 'schema.org'];
    const isPlatformEmail = (email) => IGNORED_DOMAINS.some(domain => email.toLowerCase().includes(domain));

    // Step 1: Universal Email Check
    const mailtoLinks = await page.$$eval('a[href^="mailto:"]', links => links.map(l => l.href)).catch(() => []);
    for (const href of mailtoLinks) {
      const emailAddr = extractEmail(href);
      if (emailAddr && !isPlatformEmail(emailAddr)) {
        console.log(chalk.cyan(`  Found employer mailto link: ${emailAddr}`));
        const mats = await prepareApplicationMaterials(job);
        result.cvPath = mats.cv.path;
        result.coverLetterPath = mats.coverLetter?.path || '';
        result.applied = await sendEmailApplication(job, mats.cv.text, mats.coverLetter?.text || '', emailAddr, mats.pdfPath);
        return result;
      }
    }

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
    if (emailMatch) {
      const validEmails = emailMatch.filter(e => !isPlatformEmail(e));
      if (validEmails.length > 0) {
        const emailAddr = validEmails[0];
        console.log(chalk.cyan(`  Found employer email in page text: ${emailAddr}`));
        const mats = await prepareApplicationMaterials(job);
        result.cvPath = mats.cv.path;
        result.coverLetterPath = mats.coverLetter?.path || '';
        result.applied = await sendEmailApplication(job, mats.cv.text, mats.coverLetter?.text || '', emailAddr, mats.pdfPath);
        return result;
      }
    }

    // Step 2: Platform-Specific Outbound Apply Buttons
    let targetApplyUrl = null;

    // RemoteOK Special Handling: Click apply button directly or extract data-url
    if (landedUrl.includes('remoteok.com')) {
      try {
        const btn = await page.$('a.prevent_default, a[data-url], a[href*="/l/"]');
        if (btn) {
          const rawUrl = await page.evaluate(el => el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('href'), btn);
          if (rawUrl) {
            targetApplyUrl = rawUrl.startsWith('/') ? 'https://remoteok.com' + rawUrl : rawUrl;
          }
        }
      } catch { }
    }

    // WordPress Jobs Special Handling: Extract outbound apply links from post body
    if (!targetApplyUrl && landedUrl.includes('jobs.wordpress.net')) {
      targetApplyUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.entry-content a[href], .job-description a[href]'));
        const external = links.find(a =>
          a.href.startsWith('http') &&
          !a.href.includes('jobs.wordpress.net') &&
          !a.href.includes('wordpress.org') &&
          !a.href.includes('profiles.wordpress')
        );
        return external ? external.href : null;
      }).catch(() => null);
    }

    // Generic Outbound Apply Link Resolution
    if (!targetApplyUrl) {
      const APPLY_LINK_SELECTORS = [
        '#job-apply-button',
        'a.remotive-apply-button',
        'a.job-apply-btn',
        'a.apply-button',
        'a[href*="/l/"]',
        'a[href*="apply"]',
        'a[data-button-text*="Apply" i]',
        'a[title*="Apply" i]',
        '.application-btn a',
        '#apply-button',
        '.entry-apply a',
        'a.button[href*="http"]',
        '.job-description a[href*="http"]',
        '.entry-content a[href*="http"]'
      ];

      for (const sel of APPLY_LINK_SELECTORS) {
        try {
          const applyLink = await page.$eval(sel, el => el.href || el.getAttribute('href') || '');
          if (applyLink && applyLink.startsWith('http') && applyLink !== landedUrl && !applyLink.includes('javascript:')) {
            targetApplyUrl = applyLink;
            break;
          }
        } catch { }
      }
    }

    if (targetApplyUrl) {
      console.log(chalk.gray(`  Following apply link: ${targetApplyUrl}`));
      try {
        await page.goto(targetApplyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log(chalk.gray(`  Navigated to ATS: ${page.url()}`));
      } catch (err) {
        console.warn(`[AutoApply] Outbound navigation warning:`, err.message);
      }
    }

    // Step 3: Check mailto again on destination page
    const mailtoAfter = await page.$$eval('a[href^="mailto:"]', links => links.map(l => l.href)).catch(() => []);
    for (const href of mailtoAfter) {
      const emailAddr = extractEmail(href);
      if (emailAddr && !isPlatformEmail(emailAddr)) {
        console.log(chalk.cyan(`  Found employer mailto on landing page: ${emailAddr}`));
        const mats = await prepareApplicationMaterials(job);
        result.cvPath = mats.cv.path;
        result.coverLetterPath = mats.coverLetter?.path || '';
        result.applied = await sendEmailApplication(job, mats.cv.text, mats.coverLetter?.text || '', emailAddr, mats.pdfPath);
        return result;
      }
    }

    // Step 4: Detect and fill web form on target page (Greenhouse, Lever, Workable, Ashby, etc.)
    const hasForm = await hasFillableForm(page);
    if (!hasForm) {
      console.log(chalk.yellow(`  No fillable form found at: ${page.url()} — skipping CV prep.`));
      return result;
    }

    const mats = await prepareApplicationMaterials(job);
    result.cvPath = mats.cv.path;
    result.coverLetterPath = mats.coverLetter?.path || '';

    const filled = await fillApplicationForm(page, mats.cv.text, mats.coverLetter?.text || '');
    await uploadPdfToForm(page, mats.pdfPath);

    if (filled) {
      console.log(chalk.green(`  Form filled successfully on: ${page.url()}`));
      await page.screenshot({ path: path.join(appDir, 'apply-filled.png') });
    } else {
      console.log(chalk.yellow(`  Failed to fill form at: ${page.url()} — manual apply required.`));
      await page.screenshot({ path: path.join(appDir, 'apply-failed.png') });
    }

    result.applied = filled;
    return result;
  } catch (err) {
    console.error('[AutoApply] Form fill failed:', err.message);
    return result;
  } finally {
    if (browser) await browser.close();
  }
}

async function hasFillableForm(page) {
  const allSelectors = [
    'input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="name" i]',
    'input[type="email"]', 'input[name*="email" i]',
    'input[type="file"]'
  ];
  for (const sel of allSelectors) {
    try {
      if (await page.$(sel)) return true;
    } catch {}
  }
  return false;
}

async function uploadPdfToForm(page, pdfPath) {
  const selectors = [
    'input[type="file"][accept*="pdf"]',
    'input[type="file"][name*="resume" i]',
    'input[type="file"][name*="cv" i]',
    'input[type="file"][id*="resume" i]',
    'input[type="file"][id*="cv" i]',
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
    } catch { }
  }
  return false;
}

async function fillApplicationForm(page, cvText, coverLetterText) {
  const profile = getProfile();
  const nameParts = (profile.personal.name || 'Applicant').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const fields = [
    { selectors: ['input[name*="first_name" i]', 'input[name*="first" i]', 'input[id*="first" i]'], value: firstName },
    { selectors: ['input[name*="last_name" i]', 'input[name*="last" i]', 'input[id*="last" i]'], value: lastName },
    { selectors: ['input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="name" i]'], value: profile.personal.name },
    { selectors: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'], value: profile.personal.email },
    { selectors: ['input[type="tel"]', 'input[name*="phone" i]', 'input[id*="phone" i]'], value: profile.personal.phone || '' },
    { selectors: ['input[name*="website" i]', 'input[name*="portfolio" i]', 'input[name*="urls" i]', 'input[placeholder*="website" i]'], value: profile.personal.portfolio },
    { selectors: ['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'], value: profile.personal.linkedin || '' },
    { selectors: ['input[name*="github" i]', 'input[placeholder*="github" i]'], value: profile.personal.github },
    { selectors: ['textarea[name*="cover" i]', 'textarea[id*="cover" i]', 'textarea[placeholder*="cover" i]', 'textarea[placeholder*="letter" i]'], value: coverLetterText },
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
      } catch { }
    }
  }

  return filled > 0;
}
