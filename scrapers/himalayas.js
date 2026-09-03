// scrapers/himalayas.js
// Himalayas.app free public JSON API — no auth needed, great for remote jobs

import axios from 'axios';
import crypto from 'crypto';

const HIMALAYAS_API = 'https://himalayas.app/jobs/api';
const HIMALAYAS_SEARCH = 'https://himalayas.app/jobs/api/search';

const SEARCH_QUERIES = [
  'wordpress developer',
  'php developer',
  'react developer',
  'web developer',
  'frontend developer',
  'full stack developer',
  'application security',
  'javascript developer',
  'technical instructor',
  'plugin developer'
];

export async function scrapeHimalayas() {
  const allJobs = [];
  const seen = new Set();

  for (const query of SEARCH_QUERIES) {
    try {
      const response = await axios.get(HIMALAYAS_SEARCH, {
        params: { q: query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
          'Accept': 'application/json',
        },
        timeout: 12000,
      });

      const jobs = response.data?.jobs || [];

      for (const job of jobs) {
        const uniqueKey = job.id || job.slug || job.applicationLink || `${job.title}-${job.company?.name}`;
        const hashId = crypto.createHash('md5').update(String(uniqueKey)).digest('hex').slice(0, 12);
        const jobId = `himalayas-${hashId}`;
        if (seen.has(jobId)) continue;
        seen.add(jobId);

        allJobs.push({
          id: jobId,
          source: 'Himalayas',
          title: job.title || '',
          company: job.company?.name || '',
          location: job.locationRestrictions?.join(', ') || 'Remote',
          description: job.description || job.content || '',
          tags: job.technologies || [],
          salary: job.salary ? `$${job.salary.min} - $${job.salary.max}` : '',
          applyUrl: job.applicationLink || `https://himalayas.app/jobs/${job.slug}`,
          postedAt: job.createdAt
            ? new Date(job.createdAt).toISOString()
            : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }

      await new Promise(r => setTimeout(r, 400));
    } catch (error) {
      console.error(`[Himalayas Scraper Error - query: ${query}]:`, error.message);
    }
  }

  return allJobs;
}
