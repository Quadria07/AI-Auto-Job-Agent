// scrapers/jobspresso.js
// Jobspresso — High quality remote tech jobs in Web Development, Software Engineering.
// Uses unblocked public RSS feed — zero anti-bot walls.

import axios from 'axios';

const RSS_URL = 'https://jobspresso.co/feed/?post_type=job_listing';

export async function scrapeJobspresso() {
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

      const slugMatch = link.match(/\/job\/([^\/]+)/);
      const jobId = `jobspresso-${slugMatch ? slugMatch[1] : Math.random().toString(36).substring(7)}`;

      if (seen.has(jobId)) continue;
      seen.add(jobId);

      allJobs.push({
        id: jobId,
        source: 'Jobspresso',
        title,
        company: 'Remote Tech Employer',
        location: 'Remote',
        description: `Jobspresso remote position: ${title}`,
        tags: ['Remote', 'Developer', 'Tech'],
        salary: '',
        applyUrl: link,
        applyMethod: 'webForm',
        postedAt: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[Jobspresso Scraper Error]:', error.message);
  }

  return allJobs;
}
