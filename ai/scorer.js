// ai/scorer.js
// Scores a job against the candidate profile using DeepSeek AI.
// Input sanitisation: description is stripped of HTML and truncated before prompt injection.

import axios from 'axios';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _profile = null;

function getProfile() {
  if (!_profile) _profile = JSON.parse(readFileSync(path.join(__dirname, '..', 'profile.json'), 'utf8'));
  return _profile;
}

// Strip HTML tags and control chars from external data before AI injection
function sanitiseText(text, maxLength = 1500) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, ' ')        // strip HTML tags
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '') // strip control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

async function callDeepSeek(messages, maxTokens = 300) {
  const response = await axios.post(
    `${config.deepseek.baseUrl}/chat/completions`,
    {
      model: config.deepseek.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Authorization': `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from DeepSeek');
  const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanContent);
}

export async function scoreJobMatch(job) {
  const profile = getProfile();
  const jobTitle = sanitiseText(job.title, 100);

  // Fast pre-filter for non-technical roles to save DeepSeek API calls & speed up execution
  const NON_TECH_TITLE_PATTERNS = [
    /\bgardener\b/i, /\bcleaner\b/i, /\bbutcher\b/i, /\bmail sorter\b/i, /\bkitchen porter\b/i,
    /\bramp attendant\b/i, /\bbaker\b/i, /\bbarista\b/i, /\bwaiter\b/i, /\bwaitress\b/i,
    /\bcashier\b/i, /\bplumber\b/i, /\bdriver\b/i, /\breceptionist\b/i, /\bhousekeeper\b/i,
    /\bcook\b/i, /\bcourier\b/i, /\btrimmer\b/i, /\bequipment maintenance\b/i
  ];

  if (NON_TECH_TITLE_PATTERNS.some(pattern => pattern.test(jobTitle))) {
    return { score: 0, reason: 'Non-technical role filtered locally', keyMatches: [], gaps: [] };
  }

  const skillsSummary = [
    ...profile.skills.security,
    ...profile.skills.webDevelopment,
    ...profile.skills.wordpress,
    ...profile.skills.tools,
  ].join(', ');

  // Sanitise all external data before injecting into prompt
  const jobCompany = sanitiseText(job.company, 100);
  const jobLocation = sanitiseText(job.location, 100);
  const jobDescription = sanitiseText(job.description, 1500);
  const jobTags = (job.tags || []).map(t => sanitiseText(t, 30)).join(', ');

  const prompt = `You are a professional job matcher. Score how well this candidate fits this job.

CANDIDATE PROFILE:
Name: ${profile.personal.name}
Target Roles: ${profile.targetRoles.join(', ')}
Skills: ${skillsSummary}
Experience: ${profile.experience.map(e => `${e.role} at ${e.company} (${e.duration})`).join(', ')}
Portfolio: ${profile.personal.portfolio}
Location: ${profile.personal.location}
Projects: Over 20 live deployed projects across healthcare, e-commerce, hospitality, media, fintech and education
Clients: Australia, United Kingdom, Canada, Nigeria and beyond

JOB TO EVALUATE:
Title: ${jobTitle}
Company: ${jobCompany}
Location: ${jobLocation}
Tags: ${jobTags}
Description: ${jobDescription}

Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "reason": "<one sentence>",
  "keyMatches": ["<skill 1>", "<skill 2>"],
  "gaps": ["<missing req 1>"]
}`;

  try {
    const result = await callDeepSeek([
      { role: 'system', content: 'You are a precise job-candidate matcher. Return only JSON.' },
      { role: 'user', content: prompt }
    ], 400);

    return {
      score: Math.min(100, Math.max(0, Number(result.score) || 0)),
      reason: sanitiseText(result.reason || '', 300),
      keyMatches: (result.keyMatches || []).map(m => sanitiseText(m, 50)),
      gaps: (result.gaps || []).map(g => sanitiseText(g, 50)),
    };
  } catch (err) {
    console.error(`[Scorer] Failed for job ${job.id}:`, err.message);
    return { score: 0, reason: 'Scoring failed', keyMatches: [], gaps: [] };
  }
}
