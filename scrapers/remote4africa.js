// scrapers/remote4africa.js
// Remote4Africa — Remote job board tailored for African & global tech professionals.
// No login wall, zero bot challenges, direct guest apply links.

import axios from 'axios';

const BASE_URL = 'https://remote4africa.com';

export async function scrapeRemote4Africa() {
  const allJobs = [];
  const seen = new Set();

  try {
    const response = await axios.get(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const html = response.data || '';
    const linkMatches = html.match(/href=[\"'](\/jobs\/[^\x22\x27]+)[\"']/g) || [];

    for (const match of linkMatches) {
      const cleanPath = match.replace(/href=[\"']/, '').replace(/[\"']$/, '');
      if (cleanPath.includes('/post-a-job') || cleanPath.includes('/category/')) continue;

      const detailUrl = `${BASE_URL}${cleanPath}`;
      const slug = cleanPath.replace('/jobs/', '');
      const jobId = `remote4africa-${slug}`;

      if (seen.has(jobId)) continue;
      seen.add(jobId);

      // Convert slug into formatted title and company estimation
      const titleParts = slug.split('-');
      const formattedTitle = titleParts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      allJobs.push({
        id: jobId,
        source: 'Remote4Africa',
        title: formattedTitle,
        company: 'African Remote Employer',
        location: 'Remote (Africa / Worldwide)',
        description: `Remote job for African developers: ${formattedTitle}`,
        tags: ['Remote', 'Africa', 'Developer'],
        salary: '',
        applyUrl: detailUrl,
        applyMethod: 'webForm',
        postedAt: new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[Remote4Africa Scraper Error]:', error.message);
  }

  return allJobs;
}
