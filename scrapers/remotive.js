// scrapers/remotive.js
// Remotive public API — free, curated remote tech jobs

import axios from 'axios';

const REMOTIVE_API = 'https://remotive.com/api/remote-jobs';

const SEARCH_TERMS = [
  'wordpress', 'php developer', 'react developer',
  'web developer', 'frontend developer', 'full stack developer',
  'javascript developer', 'security engineer', 'technical instructor'
];

export async function scrapeRemotive() {
  const allJobs = [];
  const seen = new Set();

  for (const term of SEARCH_TERMS) {
    try {
      const response = await axios.get(REMOTIVE_API, {
        params: {
          search: term,
          limit: 15,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
        },
        timeout: 12000,
      });

      const jobs = response.data?.jobs || [];

      for (const job of jobs) {
        const jobId = `remotive-${job.id}`;
        if (seen.has(jobId)) continue;
        seen.add(jobId);

        allJobs.push({
          id: jobId,
          source: 'Remotive',
          title: job.title || '',
          company: job.company_name || '',
          location: job.candidate_required_location || 'Remote',
          description: job.description || '',
          tags: job.tags || [],
          salary: job.salary || '',
          applyUrl: job.url || '',
          postedAt: job.publication_date
            ? new Date(job.publication_date).toISOString()
            : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`[Remotive Scraper Error - term: ${term}]:`, error.message);
    }
  }

  return allJobs;
}
