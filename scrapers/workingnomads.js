// scrapers/workingnomads.js
// Working Nomads — Curated 100% Work from Anywhere developer jobs.
// Uses unblocked public RSS feed.

import axios from 'axios';

const RSS_URL = 'https://www.workingnomads.com/jobs/rss';

export async function scrapeWorkingNomads() {
  const allJobs = [];
  const seen = new Set();

  try {
    const response = await axios.get(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const xml = response.data || '';
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const item of items) {
      const titleMatch = item.match(/<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';
      if (!title || !link) continue;

      const jobId = `workingnomads-${link.replace(/[^a-zA-Z0-9]/g, '')}`;

      if (seen.has(jobId)) continue;
      seen.add(jobId);

      allJobs.push({
        id: jobId,
        source: 'Working Nomads',
        title,
        company: 'Global Remote Employer',
        location: 'Work from Anywhere',
        description: `Working Nomads position: ${title}`,
        tags: ['Remote', 'Developer'],
        salary: '',
        applyUrl: link,
        applyMethod: 'webForm',
        postedAt: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[Working Nomads Scraper Error]:', error.message);
  }

  return allJobs;
}
