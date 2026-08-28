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

  try {
    const response = await axios.get(JOBICY_API, {
      params: {
        count: 50,
        geo: 'worldwide'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
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
  } catch (error) {
    console.error(`[Jobicy Scraper Error]:`, error.message);
  }

  return allJobs;
}
