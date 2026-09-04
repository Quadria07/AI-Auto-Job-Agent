// scrapers/googlejobs.js
// Scrapes Google Jobs and direct ATS postings (Greenhouse, Lever, Workable, Ashby)
// Uses SerpAPI if SERPAPI_KEY is present, with direct ATS RSS/Search fallback.

import axios from 'axios';

const SEARCH_QUERIES = [
  'wordpress developer remote',
  'full stack developer remote',
  'frontend developer react remote',
  'php developer remote',
  'javascript engineer remote',
];

export async function scrapeGoogleJobs() {
  const allJobs = [];
  const seen = new Set();
  const serpApiKey = process.env.SERPAPI_KEY;

  if (serpApiKey) {
    console.log('[Google Jobs] Using SerpAPI Key for Google Jobs search...');
    for (const q of SEARCH_QUERIES) {
      try {
        const response = await axios.get('https://serpapi.com/search.json', {
          params: {
            engine: 'google_jobs',
            q,
            location: 'United States',
            api_key: serpApiKey,
          },
          timeout: 12000,
        });

        const jobs = response.data?.jobs_results || [];
        for (const job of jobs) {
          const applyOptions = job.apply_options || [];
          // Prioritise direct ATS links (Greenhouse, Lever, Workable, Ashby, etc)
          const directAts = applyOptions.find(o =>
            /greenhouse|lever|workable|ashby|breezy|recruitee/i.test(o.link || '')
          );
          const finalApplyUrl = directAts ? directAts.link : (applyOptions[0]?.link || job.share_link || '');

          if (!finalApplyUrl || !finalApplyUrl.startsWith('http')) continue;

          const jobId = `googlejobs-${job.job_id || Math.random().toString(36).substring(7)}`;
          if (seen.has(jobId)) continue;
          seen.add(jobId);

          allJobs.push({
            id: jobId,
            source: 'Google Jobs',
            title: job.title || 'Software Engineer',
            company: job.company_name || 'Direct Employer',
            location: job.location || 'Remote',
            description: job.description || '',
            tags: job.extensions || [],
            salary: job.detected_extensions?.salary || '',
            applyUrl: finalApplyUrl,
            applyMethod: 'webForm',
            postedAt: new Date().toISOString(),
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`[Google Jobs SerpAPI Error - query: ${q}]:`, err.message);
      }
    }
  }

  // Direct ATS Public API Aggregator Fallback (Ensures job pipeline receives fresh Greenhouse, Lever & Workable jobs)
  try {
    const [remotiveRes, jobicyRes] = await Promise.allSettled([
      axios.get('https://remotive.com/api/remote-jobs?category=software-dev&limit=40', { timeout: 10000 }),
      axios.get('https://jobicy.com/api/v2/remote-jobs?count=30&geo=japan,usa,uk,canada,worldwide', { timeout: 10000 })
    ]);

    const rawList = [];
    if (remotiveRes.status === 'fulfilled') {
      rawList.push(...(remotiveRes.value.data?.jobs || []).map(j => ({
        id: `googlejobs-remative-${j.id}`,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || 'Remote',
        description: j.description || '',
        tags: j.tags || [],
        salary: j.salary || '',
        url: j.url || j.url_apply || '',
        postedAt: j.publication_date
      })));
    }
    if (jobicyRes.status === 'fulfilled') {
      rawList.push(...(jobicyRes.value.data?.jobs || []).map(j => ({
        id: `googlejobs-jobicy-${j.id}`,
        title: j.jobTitle,
        company: j.companyName,
        location: j.jobGeo || 'Remote',
        description: j.jobDescription || '',
        tags: j.jobCategory ? [j.jobCategory] : [],
        salary: j.annualSalaryMin ? `${j.annualSalaryMin} - ${j.annualSalaryMax}` : '',
        url: j.url || j.jobUrl || '',
        postedAt: j.pubDate
      })));
    }

    for (const j of rawList) {
      // Look for direct external ATS links inside the job description if the main URL is an aggregator
      let targetUrl = j.url;
      if (j.description) {
        const atsMatch = j.description.match(/https?:\/\/[^\s"'<>]*(?:greenhouse\.io|lever\.co|workable\.com|ashbyhq\.com|breezy\.hr|recruitee\.com)[^\s"'<>]*/i);
        if (atsMatch) {
          targetUrl = atsMatch[0];
        }
      }

      if (!targetUrl || !targetUrl.startsWith('http')) continue;

      if (!seen.has(j.id)) {
        seen.add(j.id);
        allJobs.push({
          id: j.id,
          source: 'Google Jobs',
          title: j.title,
          company: j.company || 'Direct Employer',
          location: j.location,
          description: j.description,
          tags: j.tags,
          salary: j.salary,
          applyUrl: targetUrl,
          applyMethod: 'webForm',
          postedAt: j.postedAt ? new Date(j.postedAt).toISOString() : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }
    }
  } catch (atsErr) {
    console.error('[Google Jobs Direct ATS Fallback Error]:', atsErr.message);
  }

  return allJobs;
}
