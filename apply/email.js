// apply/email.js
// Handles CV PDF generation and sending via Gmail SMTP.
// PDF uses a clean single-column ATS-safe layout.

import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import path from 'path';

// Converts plain-text CV into a structured, ATS-safe PDF.
// Design: single column, accent border on section headings, Inter font.
// Text is fully selectable and copyable - no image text.
export async function generateCvPdf(cvText, outPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const html = buildCvHtml(cvText);

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOpts);

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
  });

  await browser.close();
  return outPath;
}

export function buildCvHtml(cvText) {
  const lines = cvText.split('\n');
  let bodyHtml = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      continue;
    }

    // Name line (first non-empty line)
    if (i === 0 || (i < 3 && line === line.toUpperCase() && line.length > 3 && !line.includes('|'))) {
      bodyHtml += `<div class="name">${escHtml(line)}</div>`;
      continue;
    }

    // Subtitle / Contact line (contains | and contact info)
    if (line.includes('|') && (line.includes('@') || line.includes('Remote') || line.includes('Developer') || line.includes('Engineer') || line.includes('.app') || line.includes('.com') || line.includes('+234'))) {
      const cleanContact = line
        .split('|')
        .map(part => part.trim())
        .join('  •  ');

      if (line.includes('@') || line.includes('.app') || line.includes('Nigeria') || line.includes('+234') || line.includes('github')) {
        bodyHtml += `<div class="contact-bar">${escHtml(cleanContact)}</div>`;
      } else {
        bodyHtml += `<div class="tagline">${escHtml(cleanContact)}</div>`;
      }
      continue;
    }

    // Section headings (all caps, no punctuation at end)
    if (line === line.toUpperCase() && line.length > 3 && !line.startsWith('-') && !/\d/.test(line)) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      bodyHtml += `<div class="section-heading">${escHtml(line)}</div>`;
      continue;
    }

    // Bullet points
    if (line.startsWith('- ')) {
      if (!inList) { bodyHtml += '<ul>'; inList = true; }
      bodyHtml += `<li>${escHtml(line.slice(2))}</li>`;
      continue;
    }

    // Role / experience / skill category lines (contain | or bold prefix)
    if (line.includes('|') || line.endsWith(':') || /^\w.+\|\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/.test(line)) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      bodyHtml += `<div class="role-line">${escHtml(line)}</div>`;
      continue;
    }

    // Normal paragraph line
    if (inList) { bodyHtml += '</ul>'; inList = false; }
    bodyHtml += `<p>${escHtml(line)}</p>`;
  }

  if (inList) bodyHtml += '</ul>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quadri Adebisi - Curriculum Vitae</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 9pt;
    color: #111111;
    line-height: 1.45;
    background: #ffffff;
    padding-top: 4px;
  }
  
  .name {
    font-size: 20pt;
    font-weight: 700;
    color: #000000;
    letter-spacing: -0.4px;
    margin-bottom: 3px;
  }
  
  .tagline {
    font-size: 9.5pt;
    font-weight: 600;
    color: #111111;
    margin-bottom: 4px;
  }
  
  .contact-bar {
    font-size: 8.5pt;
    font-weight: 500;
    color: #222222;
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1.5px solid #000000;
  }
  
  .section-heading {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.9px;
    color: #000000;
    text-transform: uppercase;
    border-bottom: 1.5px solid #000000;
    padding-bottom: 3px;
    margin-top: 13px;
    margin-bottom: 6px;
  }
  
  .role-line {
    font-weight: 600;
    font-size: 9pt;
    color: #000000;
    margin-top: 8px;
    margin-bottom: 2px;
  }
  
  p {
    margin-bottom: 5px;
    color: #111111;
    text-align: justify;
  }
  
  ul {
    padding-left: 14px;
    margin-bottom: 5px;
  }
  
  li {
    margin-bottom: 3px;
    color: #111111;
  }
  
  li::marker {
    color: #000000;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function escHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendEmailApplication(job, cvText, coverLetterText, applyEmail, cvPdfPath) {
  if (!config.gmail || !config.gmail.user) {
    throw new Error('Gmail credentials not configured');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail.user,
      pass: config.gmail.appPassword,
    },
  });

  console.log(`    Generating PDF for ${applyEmail}...`);
  await generateCvPdf(cvText, cvPdfPath);

  const mailOptions = {
    from: `Quadri Adebisi <${config.gmail.user}>`,
    to: applyEmail,
    subject: `Application for ${job.title} - Quadri Adebisi`,
    text: coverLetterText,
    attachments: [
      {
        filename: 'Quadri_Adebisi_CV.pdf',
        path: cvPdfPath,
        contentType: 'application/pdf',
      },
    ],
  };

  console.log(`    Sending email to ${applyEmail}...`);
  await transporter.sendMail(mailOptions);
  return true;
}
