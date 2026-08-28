// scrapers/weworkremotely.js
// We Work Remotely — RSS feed scraper for Programming and Design categories

import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const RSS_FEEDS = [
  {
    url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    category: 'Programming'
  },
  {
    url: 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
    category: 'Frontend'
  },
  {
    url: 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
    category: 'Full Stack'
  },
];

const RELEVANT_KEYWORDS = [
  'wordpress', 'php', 'react', 'javascript', 'typescript', 'node',
  'web developer', 'frontend', 'full stack', 'security', 'plugin',
  'instructor', 'teaching', 'html', 'css', 'woocommerce'
];

export async function scrapeWeWorkRemotely() {
  const allJobs = [];
  const seen = new Set();

  for (const feed of RSS_FEEDS) {
    try {
      const response = await axios.get(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)',
          'Accept': 'application/rss+xml, application/xml',
        },
        timeout: 12000,
      });

      const parsed = await parseStringPromise(response.data, { explicitArray: false });
      const items = parsed?.rss?.channel?.item;
      if (!items) continue;

      const jobList = Array.isArray(items) ? items : [items];

      for (const item of jobList) {
        const title = item.title || '';
        const description = (item.description || item['content:encoded'] || '').toLowerCase();
        const titleLower = title.toLowerCase();

        // Only include relevant jobs
        const isRelevant = RELEVANT_KEYWORDS.some(kw =>
          titleLower.includes(kw) || description.includes(kw)
        );
        if (!isRelevant) continue;

        // Extract company from title (format: "Company Name | Job Title")
        let company = '';
        let jobTitle = title;
        if (title.includes('\n')) {
          const parts = title.split('\n').filter(Boolean);
          company = parts[0]?.trim() || '';
          jobTitle = parts[1]?.trim() || title;
        }

        const jobId = `wwr-${Buffer.from(item.link || title).toString('base64').slice(0, 20)}`;
        if (seen.has(jobId)) continue;
        seen.add(jobId);

        allJobs.push({
          id: jobId,
          source: 'We Work Remotely',
          title: jobTitle,
          company,
          location: 'Remote (Worldwide)',
          description: item.description || '',
          tags: [feed.category],
          salary: '',
          applyUrl: item.link || '',
          postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.error(`[WWR Scraper Error - ${feed.category}]:`, error.message);
    }
  }

  return allJobs;
}
