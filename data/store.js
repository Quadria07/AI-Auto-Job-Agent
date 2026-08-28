// data/store.js
// Simple JSON file-based storage for jobs and applications

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const APPLIED_FILE = path.join(DATA_DIR, 'applied.json');

async function ensureFile(filepath, defaultContent = '[]') {
  if (!existsSync(filepath)) {
    await writeFile(filepath, defaultContent, 'utf8');
  }
}

export async function readJobs() {
  await ensureFile(JOBS_FILE);
  try {
    const content = await readFile(JOBS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function saveJobs(jobs) {
  await writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
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
  return jobs.filter(j => j.status === 'pending_score');
}

export async function getApprovedJobs() {
  const jobs = await readJobs();
  return jobs.filter(j => j.status === 'approved');
}

export async function readApplied() {
  await ensureFile(APPLIED_FILE);
  try {
    const content = await readFile(APPLIED_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function recordApplication(job, tailoredCvPath, coverLetterPath, applyMethod = 'webForm') {
  const applied = await readApplied();
  applied.push({
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
  });
  await writeFile(APPLIED_FILE, JSON.stringify(applied, null, 2), 'utf8');
}

export async function ensureApplicationsDir(jobId) {
  const appsDir = path.join(__dirname, '..', 'applications', jobId);
  if (!existsSync(appsDir)) {
    await mkdir(appsDir, { recursive: true });
  }
  return appsDir;
}

export async function getTodayApplyCount(method) {
  const applied = await readApplied();
  const today = new Date().toDateString();
  return applied.filter(a =>
    new Date(a.appliedAt).toDateString() === today &&
    a.applyMethod === method &&
    a.autoApplied === true
  ).length;
}

export async function getTodayStats() {
  const applied = await readApplied();
  const jobs = await readJobs();
  const today = new Date().toDateString();

  const todayApplied = applied.filter(a => new Date(a.appliedAt).toDateString() === today);
  const queued = jobs.filter(j => j.status === 'queued_for_approval');
  const highMatch = jobs.filter(j => j.matchScore >= 70 && new Date(j.scrapedAt).toDateString() === today);
  const emailCount = await getTodayApplyCount('email');
  const webFormCount = await getTodayApplyCount('webForm');

  return {
    totalScanned: jobs.filter(j => new Date(j.scrapedAt).toDateString() === today).length,
    autoApplied: todayApplied.filter(a => a.autoApplied).length,
    emailApplied: emailCount,
    webFormApplied: webFormCount,
    queued: queued.length,
    highMatch: highMatch.length,
    topMatches: highMatch.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5),
  };
}
