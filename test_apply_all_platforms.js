// test_apply_all_platforms.js
// Runs full application pipeline test (Scoring, Tailoring, PDF Generation, Email/WebForm Apply)
// testing 1 sample job for each of the 6 platforms.

import { readJobs } from './data/store.js';
import { scoreJobMatch } from './ai/scorer.js';
import { applyToJob } from './apply/engine.js';
import chalk from 'chalk';

const PLATFORMS = [
  'WordPress Jobs',
  'RemoteOK',
  'Remotive',
  'We Work Remotely',
  'Himalayas',
  'Jobicy'
];

async function runPlatformApplyTest() {
  console.log(chalk.cyan.bold('\n======================================================'));
  console.log(chalk.cyan.bold('🚀 STARTING FULL AGENT APPLICATION TEST (ALL 6 PLATFORMS)'));
  console.log(chalk.cyan.bold('======================================================\n'));

  const jobs = await readJobs();
  console.log(`Loaded ${jobs.length} total jobs from partitioned store.`);

  const testResults = [];

  for (const platform of PLATFORMS) {
    console.log(chalk.yellow(`\n------------------------------------------------------`));
    console.log(chalk.bold(`Testing Application Pipeline for Platform: ${platform}`));
    
    // Find a matching sample job for this platform
    const sample = jobs.find(j => 
      j.source && j.source.toLowerCase().replace(/\s/g, '').includes(platform.toLowerCase().replace(/\s/g, ''))
    );

    if (!sample) {
      console.log(chalk.red(`  ❌ No job listing found for source: ${platform}`));
      testResults.push({ platform, jobTitle: 'N/A', score: 0, status: 'NO_JOB_FOUND', method: 'N/A' });
      continue;
    }

    console.log(chalk.cyan(`  Title: ${sample.title} @ ${sample.company || 'Unknown'}`));
    console.log(chalk.gray(`  Apply URL: ${sample.applyUrl}`));

    // 1. Score match
    const match = await scoreJobMatch(sample);
    console.log(chalk.gray(`  Match Score: ${match.score}% (${match.reason})`));

    // Prepare a test copy so we don't pollute applied history permanent state for future scans
    const testJob = {
      ...sample,
      id: `${sample.id}-test-run`,
      matchScore: match.score,
    };

    // 2. Attempt Application (ignoreLimits = true)
    console.log(chalk.gray(`  Executing applyToJob...`));
    const applied = await applyToJob(testJob, true);

    testResults.push({
      platform,
      jobTitle: sample.title.slice(0, 35),
      score: `${match.score}%`,
      status: applied ? 'APPLIED_SUCCESS' : 'READY_OR_OUTBOUND_HANDLED',
      method: testJob.applyMethod || 'WebForm/Email'
    });
  }

  console.log(chalk.cyan.bold('\n======================================================'));
  console.log(chalk.cyan.bold('📊 CROSS-PLATFORM APPLICATION TEST REPORT'));
  console.table(testResults);
}

runPlatformApplyTest().catch(err => {
  console.error(chalk.red('Test failed:', err));
  process.exit(1);
});
