// run_real_platform_tests.js
// Live Multi-Platform Application Test following strict Telegram notification rules:
// - Telegram notifications are ONLY sent for Applied Jobs or Approval Decisions (Score >= 70%).
// - Low-match or ineligible jobs (Score < 70%) produce NO Telegram alerts.

import { readJobs } from './data/store.js';
import { scoreJobMatch } from './ai/scorer.js';
import { applyToJob } from './apply/engine.js';
import { sendAutoApplyNotification, sendApprovalRequest } from './notify/telegram.js';
import { tailorCV } from './ai/cv-tailor.js';
import { generateCoverLetter } from './ai/cover-letter.js';
import { generateCvPdf } from './apply/email.js';
import { ensureApplicationsDir } from './data/store.js';
import chalk from 'chalk';
import path from 'path';

const TARGET_PLATFORMS = [
  'WordPress Jobs',
  'RemoteOK',
  'Remotive',
  'We Work Remotely',
  'Himalayas',
  'Jobicy'
];

async function runRealTests() {
  console.log(chalk.cyan.bold('\n===================================================================='));
  console.log(chalk.cyan.bold('🔥 RUNNING TEST WITH STRICT TELEGRAM RULES (ONLY APPLIED & DECISION JOBS)'));
  console.log(chalk.cyan.bold('====================================================================\n'));

  const jobs = await readJobs();
  const testResults = [];
  const testRunTimestamp = Date.now();

  for (const platform of TARGET_PLATFORMS) {
    console.log(chalk.yellow.bold(`\n--------------------------------------------------------------------`));
    console.log(chalk.bold(`Platform: ${platform}`));

    // Find listing for platform
    const platformJobs = jobs.filter(j => 
      j.source && j.source.toLowerCase().replace(/\s/g, '').includes(platform.toLowerCase().replace(/\s/g, ''))
    );

    let selectedJob = platformJobs.find(j => 
      /wordpress|web|frontend|react|fullstack|developer|engineer|security/i.test(j.title)
    ) || platformJobs[0];

    if (!selectedJob) {
      console.log(chalk.red(`  No job found for ${platform}`));
      continue;
    }

    console.log(chalk.cyan(`  Listing: ${selectedJob.title} @ ${selectedJob.company || 'Direct Employer'}`));
    console.log(chalk.gray(`  Apply URL: ${selectedJob.applyUrl}`));

    // 1. Run AI Matcher
    console.log(chalk.gray(`  Running DeepSeek AI Matcher...`));
    const match = await scoreJobMatch(selectedJob);
    selectedJob.matchScore = match.score;
    selectedJob.matchReason = match.reason;
    console.log(chalk.green(`  AI Match Score: ${match.score}% (${match.reason})`));

    const liveJob = {
      ...selectedJob,
      id: `test-${platform.toLowerCase().replace(/[^a-z0-9]/g, '')}-${testRunTimestamp}`,
      title: `${selectedJob.title} (Live Test)`,
      company: selectedJob.company || 'Test Employer',
      applyUrl: selectedJob.applyUrl
    };

    let telegramAlertSent = false;
    let telegramType = 'NONE (Low Score / Ineligible)';
    let applied = false;

    // 2. Strict Telegram Notification Rules
    if (match.score >= 85) {
      console.log(chalk.cyan(`  🤖 Tailoring CV with DeepSeek AI...`));
      const cv = await tailorCV(liveJob);
      
      console.log(chalk.cyan(`  📝 Generating Cover Letter...`));
      const coverLetter = await generateCoverLetter(liveJob, cv.text);

      console.log(chalk.cyan(`  📄 Compiling PDF Resume...`));
      const safeId = liveJob.id.replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
      const appDir = await ensureApplicationsDir(safeId);
      const pdfPath = path.join(appDir, `Quadri_Adebisi_CV.pdf`);
      await generateCvPdf(cv.text, pdfPath);

      console.log(chalk.cyan(`  🚀 Running Application Engine...`));
      applied = await applyToJob(liveJob, true);

      // Telegram notification sent ONLY for Auto-Applied job
      console.log(chalk.magenta(`  📱 Sending Telegram Auto-Apply Notification...`));
      await sendAutoApplyNotification(liveJob, applied);
      telegramAlertSent = true;
      telegramType = 'AUTO_APPLIED 📱';
    } else if (match.score >= 70) {
      // Telegram notification sent for User Approval Decision
      console.log(chalk.magenta(`  📱 Sending Telegram Approval Request to User Chat...`));
      await sendApprovalRequest(liveJob);
      telegramAlertSent = true;
      telegramType = 'DECISION_REQUEST 📱';
    } else {
      console.log(chalk.gray(`  🚫 Score is ${match.score}% (<70%). Telegram notification SUPPRESSED as requested.`));
    }

    testResults.push({
      platform,
      title: selectedJob.title.slice(0, 26),
      score: `${match.score}%`,
      telegramNotification: telegramType,
      appliedStatus: applied ? 'APPLIED' : (match.score >= 70 ? 'PENDING_APPROVAL' : 'FILTERED_OUT')
    });
  }

  console.log(chalk.cyan.bold('\n===================================================================='));
  console.log(chalk.cyan.bold('📊 STRICT TELEGRAM RULE MULTI-PLATFORM TEST REPORT'));
  console.table(testResults);
  process.exit(0);
}

runRealTests().catch(err => {
  console.error(chalk.red('Test failed:', err));
  process.exit(1);
});
