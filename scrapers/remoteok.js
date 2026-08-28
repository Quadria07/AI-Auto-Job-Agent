// scrapers/remoteok.js
// RemoteOK public JSON API — no scraping needed, free forever

import axios from 'axios';

const REMOTE_OK_API = 'https://remoteok.com/api';
const TARGET_TAGS = [
  'wordpress', 'php', 'react', 'javascript', 'typescript', 'node',
  'web', 'frontend', 'security', 'fullstack', 'teaching', 'education',
  'html', 'css', 'dev', 'plugin', 'instructor'
];

export async function scrapeRemoteOK() {
  try {
    const response = await axios.get(REMOTE_OK_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    // First element is metadata, skip it
    const jobs = response.data.slice(1);

    const filtered = jobs.filter(job => {
      if (!job || !job.position) return false;

      const tags = (job.tags || []).map(t => t.toLowerCase());
      const title = (job.position || '').toLowerCase();
      const description = (job.description || '').toLowerCase();

      return TARGET_TAGS.some(tag =>
        tags.includes(tag) ||
        title.includes(tag) ||
        description.includes(tag)
      );
    });

    return filtered.map(job => ({
      id: `remoteok-${job.id || job.slug}`,
      source: 'RemoteOK',
      title: job.position,
      company: job.company,
      location: 'Remote',
      description: job.description || '',
      tags: job.tags || [],
      salary: job.salary ? `${job.salary_min || ''} - ${job.salary_max || ''}` : '',
      applyUrl: job.apply_url || `https://remoteok.com/l/${job.slug}`,
      postedAt: job.date ? new Date(job.date).toISOString() : new Date().toISOString(),
      scrapedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('[RemoteOK Scraper Error]:', error.message);
    return [];
  }
}
