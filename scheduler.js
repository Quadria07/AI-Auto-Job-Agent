// scheduler.js
// Cron-based scheduler — runs job scans and morning digest.

import cron from 'node-cron';
import chalk from 'chalk';
import { config } from './config.js';
import { runAllScrapers } from './scrapers/index.js';
import { getPendingJobs, updateJob, getHourlyApplyCount } from './data/store.js';
import { scoreJobMatch } from './ai/scorer.js';
import { sendApprovalRequest, sendAutoApplyNotification, sendManualApplyAlert } from './notify/telegram.js';
import { sendMorningDigest } from './notify/telegram.js';
import { applyToJob, canAutoApplyJob } from './apply/engine.js';

import { logEvent } from './logger.js';

export async function processPendingJobs() {
  const pendingJobs = await getPendingJobs();
  if (pendingJobs.length === 0) return;

  console.log(chalk.cyan(`\nEvaluating ${pendingJobs.length} new jobs...`));
  logEvent('INFO', 'SCORE', `Evaluating ${pendingJobs.length} new jobs...`);

  for (const job of pendingJobs) {
    try {
      const matchResult = await scoreJobMatch(job);
      const score = matchResult.score;
      console.log(chalk.gray(`  ${job.title} @ ${job.company} — ${score}%`));

      // Below 70% — skip silently, no Telegram, no nothing
      if (score < config.matchThresholds.autoApply) {
        await updateJob(job.id, { matchScore: score, matchReason: matchResult.reason, status: 'skipped' });
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      // 70%+ — check hourly rate limit
      const hourlyCount = await getHourlyApplyCount();
      if (hourlyCount >= config.maxApplicationsPerHour) {
        console.log(chalk.yellow(`  [Rate Limit] Hourly limit reached (${hourlyCount}/${config.maxApplicationsPerHour}). Re-queuing ${job.title}.`));
        // Leave as pending_score so next hour it will be picked up again
        await updateJob(job.id, { matchScore: score, matchReason: matchResult.reason, status: 'pending_score' });
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      await updateJob(job.id, { matchScore: score, matchReason: matchResult.reason, status: 'queued_for_auto_apply' });

      logEvent('SUCCESS', 'SCORE', `Match (${score}%): ${job.title} @ ${job.company}`, {
        title: job.title, company: job.company, score, applyUrl: job.applyUrl
      });

      // Check if agent can actually apply before trying
      if (!canAutoApplyJob(job)) {
        console.log(chalk.yellow(`  ${job.title}: no direct apply method. Skipped silently.`));
        logEvent('INFO', 'APPLY', `No direct auto-apply method for ${job.title}. Skipped.`);
        await updateJob(job.id, { status: 'skipped_no_auto_apply' });
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      logEvent('INFO', 'APPLY', `Auto-applying to ${job.title} @ ${job.company} (${score}%)`);
      const applied = await applyToJob(job);

      if (applied) {
        logEvent('SUCCESS', 'APPLY', `Applied to ${job.title} @ ${job.company} (${score}%)`);
        await sendAutoApplyNotification({ ...job, matchScore: score }, true);
      } else {
        console.log(chalk.yellow(`  Auto-apply unachievable for ${job.title}. Skipped silently.`));
        logEvent('WARN', 'APPLY', `Auto-apply failed for ${job.title} @ ${job.company}. Skipped.`);
        await updateJob(job.id, { status: 'skipped_no_auto_apply' });
      }

      // Brief pause to respect DeepSeek & SMTP rate limits
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(chalk.red(`  Failed to process job ${job.id}:`, err.message));
      logEvent('ERROR', 'SCORE', `Failed to score job ${job.id}`, { error: err.message });
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
