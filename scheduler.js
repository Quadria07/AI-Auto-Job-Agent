// scheduler.js
// Cron-based scheduler — runs job scans and morning digest.

import cron from 'node-cron';
import chalk from 'chalk';
import { config } from './config.js';
import { runAllScrapers } from './scrapers/index.js';
import { getPendingJobs, updateJob } from './data/store.js';
import { scoreJobMatch } from './ai/scorer.js';
import { sendApprovalRequest, sendAutoApplyNotification } from './notify/telegram.js';
import { sendMorningDigest } from './notify/telegram.js';
import { applyToJob } from './apply/engine.js';

export async function processPendingJobs() {
  const pendingJobs = await getPendingJobs();
  if (pendingJobs.length === 0) return;

  console.log(chalk.cyan(`\nEvaluating ${pendingJobs.length} new jobs...`));

  for (const job of pendingJobs) {
    try {
      const matchResult = await scoreJobMatch(job);
      const score = matchResult.score;
      console.log(chalk.gray(`  ${job.title} @ ${job.company} — ${score}%`));

      let status = 'skipped';
      if (score >= config.matchThresholds.autoApply) {
        status = 'queued_for_auto_apply';
      } else if (score >= config.matchThresholds.telegramApproval) {
        status = 'queued_for_approval';
      } else if (score >= config.matchThresholds.silentSave) {
        status = 'silently_saved';
      }

      await updateJob(job.id, { matchScore: score, matchReason: matchResult.reason, status });

      if (status === 'queued_for_auto_apply') {
        const applied = await applyToJob(job);
        await sendAutoApplyNotification({ ...job, matchScore: score }, applied);
      } else if (status === 'queued_for_approval') {
        await sendApprovalRequest({ ...job, matchScore: score, matchReason: matchResult.reason });
      }

      // Brief pause between DeepSeek calls to respect rate limits
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(chalk.red(`  Failed to process job ${job.id}:`, err.message));
      await updateJob(job.id, { status: 'scoring_failed' });
    }
  }
}

export function startScheduler() {
  console.log(chalk.green('Scheduler started.'));
  console.log(chalk.gray(`  Scan: ${config.schedule.scanInterval}`));
  console.log(chalk.gray(`  Digest: ${config.schedule.morningDigest}`));

  cron.schedule(config.schedule.scanInterval, async () => {
    console.log(chalk.cyan('\n[Cron] Job scan starting...'));
    await runAllScrapers(config.platforms);
    await processPendingJobs();
  });

  cron.schedule(config.schedule.morningDigest, async () => {
    console.log(chalk.cyan('\n[Cron] Sending morning digest...'));
    await sendMorningDigest();
  });
}
