// scrapers/wordpressjobs.js
// WordPress Official Job Board (jobs.wordpress.net) — RSS feed
// The MOST trusted WordPress job source — only serious WordPress work posted here

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import crypto from 'crypto';

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
      const location = item['job_listing:job_location'] || 'Remote';

      // Extract email addresses from description text (e.g. "send your CV to jobs@company.com")
      const emailMatches = description.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
      const applyEmail = emailMatches
        ? emailMatches.find(e => !e.includes('wordpress') && !e.includes('example'))
        : null;

      // Extract the first external URL from the description text that looks like an apply link
      const urlMatches = description.match(/https?:\/\/[^\s"<>]+/g);
      const externalApplyUrl = urlMatches
        ? urlMatches.find(u => !u.includes('jobs.wordpress.net') && !u.includes('wordpress.org'))
        : null;

      // Priority: email > external URL > job listing page
      let applyUrl = item.link || '';
      let applyMethod = 'manual';
      if (applyEmail) {
        applyUrl = `mailto:${applyEmail}`;
        applyMethod = 'email';
      } else if (externalApplyUrl) {
        applyUrl = externalApplyUrl;
        applyMethod = 'webForm';
      }

      const linkUrl = item.link || title;
      const hashId = crypto.createHash('md5').update(linkUrl).digest('hex').slice(0, 12);
      return {
        id: `wpjobs-${hashId}`,
        source: 'WordPress Jobs (Official)',
        title,
        company: item['job_listing:company'] || '',
        location,
        description,
        tags: ['WordPress', 'PHP'],
        salary: item['job_listing:salary'] || '',
        applyUrl,
        applyMethod,
        listingUrl: item.link || '',
        postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error('[WordPress Jobs Scraper Error]:', error.message);
    return [];
  }
}
