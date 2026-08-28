// ai/cv-tailor.js
// Rewrites master CV to target a specific job using DeepSeek AI.
// Tone rules enforced in prompt: no em dashes, human language, specific achievements.

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

function sanitiseText(text, max = 2000) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, ' ').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function callDeepSeek(messages, maxTokens = 3500) {
  const response = await axios.post(
    `${config.deepseek.baseUrl}/chat/completions`,
    { model: config.deepseek.model, messages, max_tokens: maxTokens, temperature: 0.4 },
    {
      headers: { 'Authorization': `Bearer ${config.deepseekApiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    }
  );
  const content = response.data?.choices?.[0]?.message?.content || '';
  return content.replace(/```markdown/gi, '').replace(/```/g, '').trim();
}

export async function tailorCV(job) {
  const profile = getProfile();
  const jobDescription = sanitiseText(job.description, 2000);

  const prompt = `You are an expert CV writer. Rewrite this candidate's CV to target the specific job below.

WRITING RULES - follow these exactly:
- Use plain hyphens (-) for bullet points. Never use em dashes (--)
- Write in direct, human language. No corporate buzzwords or filler phrases
- Start every bullet point with a strong past-tense action verb (Built, Delivered, Developed, Designed, Implemented, Trained, Managed, Applied)
- Be specific - include numbers, countries, project names and real outcomes where they exist in the original CV
- Do not invent anything. Only rewrite and reorder what is already in the original CV
- Mirror the exact keywords and phrases from the job description throughout
- Rewrite the professional profile to directly address what this job is asking for
- Reorder the skills section so the most relevant skills appear first
- Use uppercase for section headings (PROFESSIONAL PROFILE, KEY ACHIEVEMENTS, TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS)
- Keep all sections from the original CV complete. Do NOT truncate or cut off any section

TARGET JOB:
Title: ${sanitiseText(job.title, 100)}
Company: ${sanitiseText(job.company, 100)}
Description: ${jobDescription}

ORIGINAL CV TO REWRITE:
${profile.masterCV}

Output the complete tailored CV as plain text only. Start with the candidate's name in uppercase.`;

  try {
    const tailoredCV = await callDeepSeek([
      { role: 'system', content: 'You are a professional CV writer. Output only the complete CV text, nothing else. No commentary, no preamble.' },
      { role: 'user', content: prompt }
    ]);

    // Validation: CV must contain at least 800 characters to be complete
    const isValid = tailoredCV && tailoredCV.trim().length > 800 && tailoredCV.includes('PROFESSIONAL');
    const finalCvText = isValid ? tailoredCV.trim() : profile.masterCV;

    if (!isValid) {
      console.warn(`[CVTailor] Warning: DeepSeek returned incomplete CV (${tailoredCV?.length || 0} chars). Using masterCV fallback.`);
    }

    const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const appDir = await ensureApplicationsDir(safeId);
    const cvPath = path.join(appDir, 'cv.txt');
    writeFileSync(cvPath, finalCvText, 'utf8');

    return { text: finalCvText, path: cvPath };
  } catch (err) {
    console.error(`[CVTailor] Failed for job ${job.id}:`, err.message);
    const safeId = job.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const appDir = await ensureApplicationsDir(safeId);
    const cvPath = path.join(appDir, 'cv.txt');
    writeFileSync(cvPath, profile.masterCV, 'utf8');
    return { text: profile.masterCV, path: cvPath };
  }
}
