// test_all_platforms.js
// Enhanced audit script testing all 6 job platforms

import puppeteer from 'puppeteer';
import { readJobs } from './data/store.js';
import chalk from 'chalk';

const SOURCES = [
  'WordPress Jobs (Official)',
  'RemoteOK',
  'Remotive',
  'We Work Remotely',
  'Himalayas',
  'Jobicy'
];

const IGNORED_DOMAINS = ['wordpress.net', 'wordpress.org', 'remotive.com', 'jobicy.com', 'himalayas.app', 'weworkremotely.com', 'remoteok.com', 'example.com', 'sentry.io', 'schema.org'];
const isPlatformEmail = (email) => IGNORED_DOMAINS.some(domain => email.toLowerCase().includes(domain));

async function testPlatform(job) {
  console.log(chalk.cyan(`\n======================================================`));
  console.log(chalk.bold(`Testing Platform: ${job.source}`));
  console.log(chalk.yellow(`Job Title: ${job.title} @ ${job.company || 'Unknown'}`));
  console.log(chalk.gray(`Apply URL: ${job.applyUrl}`));

  let browser = null;
  const audit = {
    source: job.source,
    title: job.title,
    initialUrl: job.applyUrl,
    landedUrl: '',
    emailFound: null,
    applyLinkFound: null,
    formFound: false,
    formFields: [],
    status: 'UNKNOWN'
  };

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    try {
      await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (navErr) {
      console.log(chalk.yellow(`  [Nav Timeout, proceeding]: ${navErr.message}`));
    }

    audit.landedUrl = page.url();
    console.log(chalk.gray(`  Landed URL: ${audit.landedUrl}`));

    // 1. Check for Mailto / Email in page (excluding platform system emails)
    const mailtoLinks = await page.$$eval('a[href^="mailto:"]', links => links.map(l => l.href)).catch(() => []);
    for (const href of mailtoLinks) {
      const email = href.replace('mailto:', '').split('?')[0].trim();
      if (email && !isPlatformEmail(email)) {
        audit.emailFound = email;
        audit.status = 'VALID_EMPLOYER_EMAIL';
        console.log(chalk.green(`  ✔ Found Valid Employer Mailto: ${audit.emailFound}`));
        return audit;
      }
    }

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
    if (emailMatch) {
      const validEmails = emailMatch.filter(e => !isPlatformEmail(e));
      if (validEmails.length > 0) {
        audit.emailFound = validEmails[0];
        audit.status = 'VALID_EMPLOYER_EMAIL';
        console.log(chalk.green(`  ✔ Found Valid Employer Email in Text: ${audit.emailFound}`));
        return audit;
      }
    }

    // 2. Check for Outbound Apply Link / Button
    let targetApplyUrl = null;

    if (audit.landedUrl.includes('remoteok.com')) {
      targetApplyUrl = await page.evaluate(() => {
        const btn = document.querySelector('a.prevent_default, a[data-url], a[href*="/l/"]');
        if (!btn) return null;
        let dataUrl = btn.getAttribute('data-url') || btn.getAttribute('data-href') || btn.getAttribute('href');
        if (dataUrl && dataUrl.startsWith('/')) dataUrl = 'https://remoteok.com' + dataUrl;
        return dataUrl;
      }).catch(() => null);
    }

    if (!targetApplyUrl && audit.landedUrl.includes('jobs.wordpress.net')) {
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
          if (applyLink && applyLink.startsWith('http') && applyLink !== audit.landedUrl && !applyLink.includes('javascript:')) {
            targetApplyUrl = applyLink;
            break;
          }
        } catch { }
      }
    }

    if (targetApplyUrl) {
      audit.applyLinkFound = targetApplyUrl;
      console.log(chalk.gray(`  Following Apply Link: ${targetApplyUrl}`));
      try {
        await page.goto(targetApplyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        audit.landedUrl = page.url();
        console.log(chalk.gray(`  Navigated to Destination ATS: ${audit.landedUrl}`));
      } catch (err) {
        console.log(chalk.yellow(`  [Outbound Nav Timeout]: ${err.message}`));
      }
    }

    // 3. Check for Form on Landed Page
    const formSelectors = [
      { name: 'First Name', selector: 'input[name*="first_name" i], input[name*="first" i], input[id*="first" i]' },
      { name: 'Last Name', selector: 'input[name*="last_name" i], input[name*="last" i], input[id*="last" i]' },
      { name: 'Full Name', selector: 'input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]' },
      { name: 'Email', selector: 'input[type="email"], input[name*="email" i], input[id*="email" i]' },
      { name: 'Phone', selector: 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]' },
      { name: 'Resume PDF', selector: 'input[type="file"]' },
      { name: 'Cover Letter', selector: 'textarea[name*="cover" i], textarea[id*="cover" i]' },
    ];

    for (const field of formSelectors) {
      const el = await page.$(field.selector).catch(() => null);
      if (el) {
        audit.formFields.push(field.name);
      }
    }

    if (audit.formFields.length > 0) {
      audit.formFound = true;
      audit.status = 'FORM_DETECTED';
      console.log(chalk.green(`  ✔ Detected Form Fields: ${audit.formFields.join(', ')}`));
    } else {
      audit.status = 'OUTBOUND_NAVIGATED_OR_NO_FORM';
      console.log(chalk.yellow(`  ℹ Outbound destination reached at ${audit.landedUrl}`));
    }

  } catch (err) {
    audit.status = `ERROR (${err.message})`;
    console.log(chalk.red(`  [Error]: ${err.message}`));
  } finally {
    if (browser) await browser.close();
  }

  return audit;
}

async function runAudit() {
  const jobs = await readJobs();
  console.log(`Loaded ${jobs.length} jobs. Testing 1 sample job per platform...`);

  const results = [];
  for (const source of SOURCES) {
    const sample = jobs.find(j => j.source === source || j.source.startsWith(source.split(' ')[0]));
    if (!sample) {
      console.log(chalk.red(`No sample job found for source: ${source}`));
      continue;
    }
    const audit = await testPlatform(sample);
    results.push(audit);
  }

  console.log(chalk.cyan(`\n======================================================`));
  console.log(chalk.bold(`UPDATED AUDIT SUMMARY REPORT:`));
  console.table(results.map(r => ({
    Source: r.source,
    Status: r.status,
    Email: r.emailFound || 'N/A',
    'Form Fields': r.formFields.join(', ') || 'None',
    'Final Landed URL': r.landedUrl.slice(0, 50) + (r.landedUrl.length > 50 ? '...' : '')
  })));
}

runAudit();
