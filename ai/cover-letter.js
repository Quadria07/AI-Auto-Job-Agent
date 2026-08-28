// ai/cover-letter.js
// Generates a tailored cover letter for a specific job using DeepSeek AI.
// Tone: direct, human, specific. No corporate fluff. No em dashes.

import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { ensureApplicationsDir } from '../data/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _profile = null;

function getProfile() {
  if (!_profile) _profile = JSON.parse(readFileSync(path.join(__dirname, '..', 'profile.json'), 'utf8'));
  return _profile;
}

function sanitiseText(text, max = 1500) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, ' ').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function callDeepSeek(messages, maxTokens = 2500) {
  const response = await axios.post(
    `${config.deepseek.baseUrl}/chat/completions`,
    { model: config.deepseek.model, messages, max_tokens: maxTokens, temperature: 0.3 },
    {
      headers: { 'Authorization': `Bearer ${config.deepseekApiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    }
  );
  const msg = response.data?.choices?.[0]?.message;
  const content = msg?.content || '';
  return content.replace(/```markdown/gi, '').replace(/```/g, '').trim();
}

export async function generateCoverLetter(job, tailoredCvText = '') {
  const profile = getProfile();
  const jobDescription = sanitiseText(job.description, 1500);

  const prompt = `Write a professional cover letter for this job application.

CANDIDATE:
Name: ${profile.personal.name}
Email: ${profile.personal.email}
Portfolio: ${profile.personal.portfolio}
GitHub: ${profile.personal.github}
Location: ${profile.personal.location}

JOB:
Title: ${sanitiseText(job.title, 100)}
Company: ${sanitiseText(job.company, 100)}
Description: ${jobDescription}

CANDIDATE BACKGROUND:
${tailoredCvText ? tailoredCvText.slice(0, 1000) : profile.masterCV.slice(0, 1000)}

WRITING RULES - follow these strictly:
1. FORBIDDEN PHRASES (NEVER USE):
   - Never say "I am writing to apply for", "I am applying for", or "I believe I would be a great fit".
   - Never say "code samples", "inspect my builds", "inspect my work", or "take a look at".
   - Never use em dashes (--).
   - Never use buzzwords ("passionate", "dynamic", "synergy", "innovative").

2. OPENING HOOK (Paragraph 1, ~40 words):
   - Start immediately with a confident, direct hook matching the job requirements:
   - Example style: "Your need for a ${sanitiseText(job.title, 60)} who treats security and performance as core features matches exactly how I work."

3. PROOF & IMPACT (Paragraph 2, ~80 words):
   - Highlight 20+ live production projects for clients in Australia, the UK, Canada, and Nigeria across healthcare, e-commerce, media, and fintech, with OWASP security built in.

4. CLOSING (Paragraph 3, ~35 words + Sign-off):
   - End paragraph 3 with: "I am available immediately for remote work. You can view my portfolio and live projects at https://quadri-adebisi.vercel.app/ or reach me directly at ${profile.personal.email}."
   - Always end the letter with the sign-off:
     Best regards,
     ${profile.personal.name}
   
5. LENGTH:
   - Keep body text strictly between 140 and 170 words (3 short, high-impact paragraphs + sign-off).

6. STRICT FACTUAL ACCURACY:
   - Do NOT invent or swap project details or client countries.
   - Kennixcare is an Australian healthcare provider (never UK-based).
   - Client regions are Australia, the United Kingdom, Canada, and Nigeria.
   - Only reference facts explicitly provided in the candidate background.

Start with "Dear Hiring Team," - output only the cover letter text, nothing else.`;

  try {
    let coverLetter = await callDeepSeek([
      { role: 'system', content: 'You are a professional cover letter writer. Output only the cover letter text. No commentary, no subject line, no preamble.' },
      { role: 'user', content: prompt }
    ]);

    if (!coverLetter || coverLetter.trim().length < 50) {
      throw new Error('DeepSeek returned empty or invalid cover letter text');
    }

    coverLetter = coverLetter.trim();
    if (!coverLetter.includes('Best regards') && !coverLetter.includes('Sincerely')) {
      coverLetter += `\n\nBest regards,\n${profile.personal.name}`;
    }

    const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const appDir = await ensureApplicationsDir(safeId);
    const coverPath = path.join(appDir, 'cover-letter.txt');
    writeFileSync(coverPath, coverLetter, 'utf8');

    return { text: coverLetter, path: coverPath };
  } catch (err) {
    console.error(`[CoverLetter] Failed for job ${job.id}:`, err.message);
    return null;
  }
}
