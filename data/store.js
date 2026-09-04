// data/store.js
// Daily partitioned JSON file storage system for jobs and applications

import { readFile, writeFile, mkdir, readdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;

const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const APPLIED_DIR = path.join(DATA_DIR, 'applied');
const LEGACY_JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const LEGACY_APPLIED_FILE = path.join(DATA_DIR, 'applied.json');

function getDateString(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

async function ensureDirs() {
  if (!existsSync(JOBS_DIR)) await mkdir(JOBS_DIR, { recursive: true });
  if (!existsSync(APPLIED_DIR)) await mkdir(APPLIED_DIR, { recursive: true });
}

// Automatic legacy migration
async function migrateLegacyFiles() {
  await ensureDirs();

  // Migrate jobs.json if present
  if (existsSync(LEGACY_JOBS_FILE)) {
    try {
      const content = await readFile(LEGACY_JOBS_FILE, 'utf8');
      const jobs = JSON.parse(content || '[]');
      if (Array.isArray(jobs) && jobs.length > 0) {
        const grouped = {};
        for (const job of jobs) {
          const dateStr = getDateString(job.scrapedAt);
          if (!grouped[dateStr]) grouped[dateStr] = [];
          grouped[dateStr].push(job);
        }
        for (const [dateStr, dateJobs] of Object.entries(grouped)) {
          const filePath = path.join(JOBS_DIR, `jobs-${dateStr}.json`);
          let existing = [];
          if (existsSync(filePath)) {
            try { existing = JSON.parse(await readFile(filePath, 'utf8')); } catch { }
          }
          const mergedMap = new Map(existing.map(j => [j.id, j]));
          dateJobs.forEach(j => mergedMap.set(j.id, j));
          await writeFile(filePath, JSON.stringify(Array.from(mergedMap.values()), null, 2), 'utf8');
        }
      }
      await rename(LEGACY_JOBS_FILE, `${LEGACY_JOBS_FILE}.migrated.bak`);
      console.log(`[Store] Migrated legacy jobs.json into daily files in ${JOBS_DIR}`);
    } catch (err) {
      console.error('[Store] Migration error for jobs.json:', err.message);
    }
  }

  // Migrate applied.json if present
  if (existsSync(LEGACY_APPLIED_FILE)) {
    try {
      const content = await readFile(LEGACY_APPLIED_FILE, 'utf8');
      const applied = JSON.parse(content || '[]');
      if (Array.isArray(applied) && applied.length > 0) {
        const grouped = {};
        for (const item of applied) {
          const dateStr = getDateString(item.appliedAt);
          if (!grouped[dateStr]) grouped[dateStr] = [];
          grouped[dateStr].push(item);
        }
        for (const [dateStr, dateItems] of Object.entries(grouped)) {
          const filePath = path.join(APPLIED_DIR, `applied-${dateStr}.json`);
          let existing = [];
          if (existsSync(filePath)) {
            try { existing = JSON.parse(await readFile(filePath, 'utf8')); } catch { }
          }
          const mergedMap = new Map(existing.map(a => [a.jobId || a.applyUrl, a]));
          dateItems.forEach(a => mergedMap.set(a.jobId || a.applyUrl, a));
          await writeFile(filePath, JSON.stringify(Array.from(mergedMap.values()), null, 2), 'utf8');
        }
      }
      await rename(LEGACY_APPLIED_FILE, `${LEGACY_APPLIED_FILE}.migrated.bak`);
      console.log(`[Store] Migrated legacy applied.json into daily files in ${APPLIED_DIR}`);
    } catch (err) {
      console.error('[Store] Migration error for applied.json:', err.message);
    }
  }
}

// Run migration check once on module import
migrateLegacyFiles().catch(err => console.error('[Store] Migration initialization failed:', err));

export async function readJobs() {
  await ensureDirs();
  const allJobs = [];
  try {
    const files = await readdir(JOBS_DIR);
    const jsonFiles = files.filter(f => f.startsWith('jobs-') && f.endsWith('.json')).sort().reverse();
    
    for (const file of jsonFiles) {
      try {
        const content = await readFile(path.join(JOBS_DIR, file), 'utf8');
        const jobs = JSON.parse(content || '[]');
        allJobs.push(...jobs);
      } catch { }
    }
  } catch { }

  // Deduplicate by ID just in case
  const map = new Map();
  for (const job of allJobs) {
    if (!map.has(job.id)) map.set(job.id, job);
  }
  return Array.from(map.values());
}

export async function saveJobs(jobs) {
  await ensureDirs();
  const grouped = {};
  for (const job of jobs) {
    const dateStr = getDateString(job.scrapedAt);
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(job);
  }

  for (const [dateStr, dateJobs] of Object.entries(grouped)) {
    const filePath = path.join(JOBS_DIR, `jobs-${dateStr}.json`);
    await writeFile(filePath, JSON.stringify(dateJobs, null, 2), 'utf8');
  }
}

export async function updateJob(jobId, updates) {
  const jobs = await readJobs();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates };
    await saveJobs(jobs);
    return jobs[idx];
  }
  return null;
}

export async function getPendingJobs() {
  const jobs = await readJobs();
  const pending = jobs.filter(j => j.status === 'pending_score');
  // Sort descending by postedAt/scrapedAt so real-time newest jobs are processed first
  return pending.sort((a, b) => {
    const timeA = new Date(a.postedAt || a.scrapedAt || 0).getTime();
    const timeB = new Date(b.postedAt || b.scrapedAt || 0).getTime();
    return timeB - timeA;
  });
}

export async function getApprovedJobs() {
  const jobs = await readJobs();
  return jobs.filter(j => j.status === 'approved');
}

export async function readApplied() {
  await ensureDirs();
  const allApplied = [];
  try {
    const files = await readdir(APPLIED_DIR);
    const jsonFiles = files.filter(f => f.startsWith('applied-') && f.endsWith('.json')).sort().reverse();

    for (const file of jsonFiles) {
      try {
        const content = await readFile(path.join(APPLIED_DIR, file), 'utf8');
        const items = JSON.parse(content || '[]');
        allApplied.push(...items);
      } catch { }
    }
  } catch { }

  // Deduplicate
  const seen = new Set();
  const result = [];
  for (const item of allApplied) {
    const key = item.jobId || item.applyUrl || `${item.title}|${item.company}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export async function recordApplication(job, tailoredCvPath, coverLetterPath, applyMethod = 'webForm') {
  await ensureDirs();
  const todayStr = getDateString();
  const filePath = path.join(APPLIED_DIR, `applied-${todayStr}.json`);

  let applied = [];
  if (existsSync(filePath)) {
    try {
      applied = JSON.parse(await readFile(filePath, 'utf8'));
    } catch { }
  }

  const record = {
    jobId: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    applyUrl: job.applyUrl,
    matchScore: job.matchScore,
    appliedAt: new Date().toISOString(),
    applyMethod,
    autoApplied: job.autoApplied || false,
    tailoredCvPath,
    coverLetterPath,
  };

  applied.push(record);
  await writeFile(filePath, JSON.stringify(applied, null, 2), 'utf8');
}

export async function ensureApplicationsDir(jobId) {
  const appsDir = path.join(__dirname, '..', 'applications', jobId);
  if (!existsSync(appsDir)) {
    await mkdir(appsDir, { recursive: true });
  }
  return appsDir;
}

export async function getHourlyApplyCount() {
  const applied = await readApplied();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return applied.filter(a =>
    a.appliedAt && !isNaN(new Date(a.appliedAt).getTime()) &&
    new Date(a.appliedAt).getTime() >= oneHourAgo
  ).length;
}

export async function getTodayApplyCount(method) {
  const applied = await readApplied();
  const today = new Date().toDateString();
  return applied.filter(a =>
    a.appliedAt && !isNaN(new Date(a.appliedAt).getTime()) &&
    new Date(a.appliedAt).toDateString() === today &&
    (!method || a.applyMethod === method)
  ).length;
}

export async function getStatsForDate(targetDate) {
  const applied = await readApplied();
  const jobs = await readJobs();
  const dateStr = targetDate.toDateString();

  const dayApplied = applied.filter(a =>
    a.appliedAt && !isNaN(new Date(a.appliedAt).getTime()) &&
    new Date(a.appliedAt).toDateString() === dateStr
  );

  const dayJobs = jobs.filter(j =>
    j.scrapedAt && !isNaN(new Date(j.scrapedAt).getTime()) &&
    new Date(j.scrapedAt).toDateString() === dateStr
  );

  const dayHighMatches = dayJobs.filter(j => (j.matchScore || 0) >= 70);

  const emailApplied = dayApplied.filter(a => a.applyMethod === 'email').length;
  const webFormApplied = dayApplied.filter(a => a.applyMethod === 'webForm').length;

  return {
    totalScanned: dayJobs.length,
    autoApplied: dayApplied.length,
    emailApplied,
    webFormApplied,
    queued: 0,
    highMatch: dayHighMatches.length,
    topMatches: dayHighMatches.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)).slice(0, 5),
  };
}

export async function getTodayStats() {
  return getStatsForDate(new Date());
}

export async function getYesterdayStats() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getStatsForDate(yesterday);
}
