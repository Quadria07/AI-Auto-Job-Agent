// scrapers/jobicy.js
// Jobicy free REST API — no auth, filterable by tag

import axios from 'axios';

const JOBICY_API = 'https://jobicy.com/api/v2/remote-jobs';

// Jobicy tag slugs for relevant roles
const QUERY_TAGS = [
  'wordpress', 'php', 'react', 'javascript', 'web-development',
  'frontend', 'full-stack', 'node-js', 'cybersecurity', 'teaching'
];

export async function scrapeJobicy() {
  const allJobs = [];
  const seen = new Set();

  for (const tag of QUERY_TAGS) {
    try {
      const response = await axios.get(JOBICY_API, {
        params: {
          count: 20,
          geo: 'worldwide',
          industry: 'engineering',
          tag: tag,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
        },
        timeout: 12000,
      });

      const jobs = response.data?.jobs || [];

      for (const job of jobs) {
        const jobId = `jobicy-${job.id}`;
        if (seen.has(jobId)) continue;
        seen.add(jobId);

        allJobs.push({
          id: jobId,
          source: 'Jobicy',
          title: job.jobTitle || '',
          company: job.companyName || '',
          location: job.jobGeo || 'Remote',
          description: job.jobDescription || job.jobExcerpt || '',
          tags: job.jobType ? [job.jobType] : [],
          salary: job.annualSalaryMin
            ? `$${job.annualSalaryMin} - $${job.annualSalaryMax}`
            : '',
          applyUrl: job.url || '',
          postedAt: job.pubDate ? new Date(job.pubDate).toISOString() : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }

      // Small delay to be respectful to API
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`[Jobicy Scraper Error - tag: ${tag}]:`, error.message);
    }
  }

  return allJobs;
}
