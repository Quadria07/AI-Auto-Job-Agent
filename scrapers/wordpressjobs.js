// scrapers/wordpressjobs.js
// WordPress Official Job Board (jobs.wordpress.net) — RSS feed
// The MOST trusted WordPress job source — only serious WordPress work posted here

import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const WP_JOBS_RSS = 'https://jobs.wordpress.net/feed/';

export async function scrapeWordPressJobs() {
  try {
    const response = await axios.get(WP_JOBS_RSS, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
        'Accept': 'application/rss+xml, application/xml',
      },
      timeout: 12000,
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const items = parsed?.rss?.channel?.item;
    if (!items) return [];

    const jobList = Array.isArray(items) ? items : [items];

    return jobList.map(item => {
      const title = item.title || '';
      const description = item.description || item['content:encoded'] || '';

      // Extract location from job_listing:job_location if available
      const location = item['job_listing:job_location'] || 'Remote';

      return {
        id: `wpjobs-${Buffer.from(item.link || title).toString('base64').slice(0, 20)}`,
        source: 'WordPress Jobs (Official)',
        title,
        company: item['job_listing:company'] || '',
        location,
        description,
        tags: ['WordPress', 'PHP'],
        salary: item['job_listing:salary'] || '',
        applyUrl: item.link || '',
        postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error('[WordPress Jobs Scraper Error]:', error.message);
    return [];
  }
}
