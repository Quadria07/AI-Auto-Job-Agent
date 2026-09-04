// scrapers/index.js
// Master scraper — runs all platforms, deduplicates, saves to data/jobs.json

import { scrapeRemoteOK } from './remoteok.js';
import { scrapeJobicy } from './jobicy.js';
import { scrapeRemotive } from './remotive.js';
import { scrapeWeWorkRemotely } from './weworkremotely.js';
import { scrapeHimalayas } from './himalayas.js';
import { scrapeWordPressJobs } from './wordpressjobs.js';
import { scrapeGoogleJobs } from './googlejobs.js';
import { scrapeRemote4Africa } from './remote4africa.js';
import { scrapeJobspresso } from './jobspresso.js';
import { scrapeWorkingNomads } from './workingnomads.js';
import { readJobs, saveJobs } from '../data/store.js';
import chalk from 'chalk';

const SCRAPERS = [
  { name: 'Remote4Africa',        fn: scrapeRemote4Africa },
  { name: 'Jobspresso',           fn: scrapeJobspresso },
  { name: 'Working Nomads',       fn: scrapeWorkingNomads },
  { name: 'Google Jobs',          fn: scrapeGoogleJobs },
  { name: 'RemoteOK',             fn: scrapeRemoteOK },
  { name: 'Jobicy',               fn: scrapeJobicy },
  { name: 'Remotive',             fn: scrapeRemotive },
  { name: 'We Work Remotely',     fn: scrapeWeWorkRemotely },
  { name: 'Himalayas',            fn: scrapeHimalayas },
  { name: 'WordPress Jobs',       fn: scrapeWordPressJobs },
];

export async function runAllScrapers(enabledPlatforms = null) {
  console.log(chalk.cyan('\n🔍 Starting job scan across all platforms...'));
  const startTime = Date.now();

  const existingJobs = await readJobs();
  const existingIds = new Set(existingJobs.map(j => j.id));
  const existingUrls = new Set(existingJobs.map(j => (j.applyUrl || '').toLowerCase().trim()).filter(Boolean));
  const existingKeys = new Set(existingJobs.map(j => `${(j.title || '').toLowerCase().trim()}|${(j.company || '').toLowerCase().trim()}`));

  let totalFound = 0;
  let newJobs = [];

  for (const scraper of SCRAPERS) {
    if (enabledPlatforms && Array.isArray(enabledPlatforms) && enabledPlatforms.length > 0) {
      const normalizedEnabled = enabledPlatforms.map(p => String(p).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const currentName = scraper.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!normalizedEnabled.includes(currentName)) {
        continue;
      }
    }

    process.stdout.write(chalk.gray(`  • ${scraper.name}... `));
    try {
      const jobs = await scraper.fn();
      const fresh = jobs.filter(j => {
        const normUrl = (j.applyUrl || '').toLowerCase().trim();
        const normKey = `${(j.title || '').toLowerCase().trim()}|${(j.company || '').toLowerCase().trim()}`;
        if (existingIds.has(j.id)) return false;
        if (normUrl && existingUrls.has(normUrl)) return false;
        if (j.title && j.company && existingKeys.has(normKey)) return false;
        return true;
      });

      totalFound += jobs.length;
      newJobs.push(...fresh);
      fresh.forEach(j => {
        existingIds.add(j.id);
        if (j.applyUrl) existingUrls.add(j.applyUrl.toLowerCase().trim());
        if (j.title && j.company) existingKeys.add(`${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`);
      });
      console.log(chalk.green(`${jobs.length} found, ${fresh.length} new`));
    } catch (err) {
      console.log(chalk.red(`failed (${err.message})`));
    }
  }

  // Mark new jobs as pending scoring
  const newJobsWithStatus = newJobs.map(job => ({
    ...job,
    status: 'pending_score',
    matchScore: null,
    matchReason: null,
    cvTailored: false,
    coverLetterGenerated: false,
    applied: false,
    appliedAt: null,
    telegramMessageId: null,
  }));

  // Save all jobs
  const allJobs = [...existingJobs, ...newJobsWithStatus];
  await saveJobs(allJobs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.cyan(`\n✅ Scan complete in ${elapsed}s — ${newJobs.length} new jobs found`));

  return newJobsWithStatus;
}
