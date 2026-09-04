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

function checkLocationEligibility(job) {
  const combined = `${job.title} ${job.location || ''} ${job.description || ''} ${(job.tags || []).join(' ')}`.toLowerCase();

  // 1. Check for strict regional remote exclusions (US/EU/UK only)
  const STRICT_EXCLUSIONS = [
    /\bus only\b/i, /\bus citizens\b/i, /\bmust reside in us\b/i, /\bmust reside in the us\b/i,
    /\bmust be located in the us\b/i, /\buk only\b/i, /\beu only\b/i,
    /\beu citizens\b/i, /\bnorth america only\b/i, /\bcanada only\b/i, /\baustralia only\b/i
  ];
  if (STRICT_EXCLUSIONS.some(pattern => pattern.test(combined))) {
    return { eligible: false, reason: 'Restricted regional remote job (US/EU/UK only)' };
  }

  // 2. Check if job is Remote
  const isRemote = /\bremote\b/i.test(combined) ||
                   /\bwork from home\b/i.test(combined) ||
                   /\banywhere\b/i.test(combined) ||
                   /\bworldwide\b/i.test(combined) ||
                   /\bglobal\b/i.test(combined) ||
                   /\btelecommute\b/i.test(combined) ||
                   (job.location && /remote|anywhere|worldwide|global/i.test(job.location));

  // 3. Check if job is strictly located in Osogbo / Osun State
  const isOsogboLocal = /\bosogbo\b/i.test(combined) ||
                        /\bòsogbo\b/i.test(combined) ||
                        /\bosun\b/i.test(combined);

  // Remote jobs are valid for candidate working from Osogbo
  if (isRemote) {
    return { eligible: true };
  }

  // Non-remote / on-site jobs MUST be in Osogbo, Osun State
  if (isOsogboLocal) {
    return { eligible: true };
  }

  // Reject on-site/physical roles in Lagos, Abuja, Port Harcourt, or outside Osogbo/Osun State
  return { eligible: false, reason: 'On-site/physical role located outside candidate city (Òsogbo, Osun State)' };
}function calculateLocalFallbackScore(jobTitle, jobDescription, jobTags) {
  const combined = `${jobTitle} ${jobDescription} ${jobTags}`.toLowerCase();
  
  const STACK_KEYWORDS = [
    'wordpress', 'php', 'fullstack', 'full-stack', 'web developer', 'web development',
    'frontend', 'front-end', 'backend', 'back-end', 'react', 'javascript', 'typescript',
    'node', 'css', 'html', 'security', 'elementor', 'woocommerce'
  ];

  const matched = STACK_KEYWORDS.filter(kw => combined.includes(kw));

  if (matched.length >= 2 || combined.includes('wordpress') || combined.includes('full-stack') || combined.includes('fullstack')) {
    return {
      score: matched.includes('wordpress') ? 95 : 85,
      reason: 'Matched target stack (local rule-based fallback engine)',
      keyMatches: matched.slice(0, 4),
      gaps: []
    };
  }

  if (matched.length === 1) {
    return {
      score: 75,
      reason: 'Partial target stack match (local rule-based fallback engine)',
      keyMatches: matched,
      gaps: ['Requires full technical stack validation']
    };
  }

  return {
    score: 0,
    reason: 'Insufficient stack keyword alignment',
    keyMatches: [],
    gaps: ['Missing primary tech stack requirements']
  };
}

export async function scoreJobMatch(job) {
  const profile = getProfile();
  const jobTitle = sanitiseText(job.title, 100);

  // Fast pre-filter for non-technical roles
  const NON_TECH_TITLE_PATTERNS = [
    /\bgardener\b/i, /\bcleaner\b/i, /\bbutcher\b/i, /\bmail sorter\b/i, /\bkitchen porter\b/i,
    /\bramp attendant\b/i, /\bbaker\b/i, /\bbarista\b/i, /\bwaiter\b/i, /\bwaitress\b/i,
    /\bcashier\b/i, /\bplumber\b/i, /\bdriver\b/i, /\breceptionist\b/i, /\bhousekeeper\b/i,
    /\bcook\b/i, /\bcourier\b/i, /\btrimmer\b/i, /\bequipment maintenance\b/i,
    /\bjanitor\b/i, /\bcarpenter\b/i, /\bhandyman\b/i, /\bhandywoman\b/i, /\bmot tester\b/i,
    /\bvehicle technician\b/i, /\bvehicle detailer\b/i, /\bplant fitter\b/i, /\bshunter\b/i,
    /\bwireperson\b/i, /\bfire officer\b/i, /\bparts person\b/i, /\bproduce clerk\b/i,
    /\bmail carrier\b/i, /\bvisual merchandiser\b/i, /\bpayroll clerk\b/i,
  ];

  // Fast pre-filter for spam, scam, and generic non-job listings
  const SPAM_TITLE_PATTERNS = [
    /apply now.*send.*resume/i,
    /send.*resume.*don.?t close/i,
    /expression of interest.*can.?t see/i,
    /veritas.*resume/i,
    /don.?t close website/i,
    /\bmapping test\b/i,
    /\bexpression of interest\b/i,
    /\bopen application\b/i,
    /\btable[- ]mapper\b/i,
  ];

  // Filter out irrelevant non-developer titles (e.g. nurse, officer, maid, sales, solutions architect, support)
  const CORE_DEV_KEYWORDS = [
    /\bdeveloper\b/i, /\bengineer\b/i, /\bprogrammer\b/i, /\bweb\b/i,
    /\bwordpress\b/i, /\bfull[- ]?stack\b/i, /\bfront[- ]?end\b/i, /\bback[- ]?end\b/i,
    /\bphp\b/i, /\breact\b/i, /\bjavascript\b/i, /\btypescript\b/i, /\bnode\b/i,
    /\bsoftware\b/i, /\bcss\b/i, /\bhtml\b/i, /\bcode\b/i, /\bcoder\b/i
  ];

  const IRRELEVANT_ROLE_PATTERNS = [
    /\bnurse\b/i, /\bofficer\b/i, /\bmaid\b/i, /\battendant\b/i, /\barchitect\b/i,
    /\bsupport engineer\b/i, /\bhelpdesk\b/i, /\banalyst\b/i, /\bexecutive\b/i,
    /\btechnician\b/i, /\btherapist\b/i, /\bclerk\b/i, /\bbuyer\b/i, /\bcopywriter\b/i,
    /\bdriver\b/i, /\brecruiter\b/i, /\bsales\b/i, /\bacountant\b/i
  ];

  const isDevRole = CORE_DEV_KEYWORDS.some(kw => kw.test(jobTitle));
  const isExplicitIrrelevant = IRRELEVANT_ROLE_PATTERNS.some(pat => pat.test(jobTitle));

  if (!isDevRole || isExplicitIrrelevant) {
    return { score: 0, reason: 'Job title is outside core target roles (Software / Web Developer)', keyMatches: [], gaps: [] };
  }

  // Check Location & Work Type eligibility (Remote or Òsogbo Osun State only)
  const locCheck = checkLocationEligibility(job);
  if (!locCheck.eligible) {
    return { score: 0, reason: locCheck.reason, keyMatches: [], gaps: ['Ineligible location/work mode'] };
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

CRITICAL LOCATION & ELIGIBILITY RULES:
- Candidate lives in Òsogbo, Osun State, Nigeria.
- Candidate is ONLY eligible for:
  1. FULLY REMOTE jobs (Worldwide / Global / Africa / Nigeria).
  2. On-Site / Hybrid jobs strictly located in Òsogbo / Osun State, Nigeria.
- On-site or physical jobs in Lagos, Abuja, or outside Òsogbo/Osun State MUST receive a score of 0.
- Any job requiring physical on-site presence or in-person meetings outside Òsogbo/Osun State MUST receive a score of 0.

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
    console.warn(`[Scorer] DeepSeek API unavailable (${err.message}). Using local rule-based fallback.`);
    return calculateLocalFallbackScore(jobTitle, jobDescription, jobTags);
  }
}
