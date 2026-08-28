// scrapers/index.js
// Master scraper — runs all platforms, deduplicates, saves to data/jobs.json

import { scrapeRemoteOK } from './remoteok.js';
import { scrapeJobicy } from './jobicy.js';
import { scrapeRemotive } from './remotive.js';
import { scrapeWeWorkRemotely } from './weworkremotely.js';
import { scrapeHimalayas } from './himalayas.js';
import { scrapeWordPressJobs } from './wordpressjobs.js';
import { readJobs, saveJobs } from '../data/store.js';
import chalk from 'chalk';

const SCRAPERS = [
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

  let totalFound = 0;
  let newJobs = [];

  for (const scraper of SCRAPERS) {
    if (enabledPlatforms && !enabledPlatforms.includes(scraper.name.toLowerCase().replace(/\s/g, ''))) {
      continue;
    }

    process.stdout.write(chalk.gray(`  • ${scraper.name}... `));
    try {
      const jobs = await scraper.fn();
      const fresh = jobs.filter(j => !existingIds.has(j.id));
      totalFound += jobs.length;
      newJobs.push(...fresh);
      fresh.forEach(j => existingIds.add(j.id));
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
