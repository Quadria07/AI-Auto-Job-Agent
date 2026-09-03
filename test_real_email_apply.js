// test_real_email_apply.js
// Tests real email application via Gmail SMTP AND real interactive Telegram Approval button click.

import { saveJobs, readJobs } from './data/store.js';
import { applyToJob } from './apply/engine.js';
import { sendApprovalRequest, getBot } from './notify/telegram.js';
import chalk from 'chalk';

async function testRealEmailAndTelegramButton() {
  console.log(chalk.cyan.bold('\n===================================================================='));
  console.log(chalk.cyan.bold('✉️ TESTING REAL EMAIL DISPATCH & TELEGRAM INTERACTIVE BUTTON CLICK'));
  console.log(chalk.cyan.bold('====================================================================\n'));

  // Start Telegram Bot Listener (Polling Mode) so it can receive your button click!
  const bot = getBot({ polling: true });
  console.log(chalk.green('Telegram Bot active and listening for interactive button clicks...'));

  // Create a real test job listing configured for EMAIL application
  const testJobId = `job-email-test-${Date.now()}`;
  const testEmailJob = {
    id: testJobId,
    title: 'Senior WordPress & Full Stack Developer',
    company: 'Quadri Test Enterprise',
    location: 'Remote (Worldwide)',
    source: 'WordPress Jobs',
    applyUrl: 'mailto:quadriadebisi3@gmail.com', // Sending copy to candidate's own email to verify!
    applyMethod: 'email',
    matchScore: 92,
    matchReason: 'Candidate is an expert WordPress & Full-Stack Developer eligible for remote worldwide work.',
    status: 'queued_for_approval',
    createdAt: new Date().toISOString()
  };

  // Save to daily store so Telegram callback handler can find it
  const existingJobs = await readJobs();
  await saveJobs([testEmailJob, ...existingJobs]);
  console.log(chalk.gray(`Saved test job ${testJobId} to store.`));

  // 1. Send Real Email Application right now via Gmail SMTP
  console.log(chalk.cyan(`\n1. Executing Real Email Application via Gmail SMTP...`));
  const applied = await applyToJob(testEmailJob, true);

  if (applied) {
    console.log(chalk.green.bold('  ✅ REAL EMAIL SUCCESSFULLY SENT via Gmail SMTP! Check your inbox/sent items at quadriadebisi3@gmail.com!'));
  } else {
    console.log(chalk.red('  ❌ Email apply failed. Check logs.'));
  }

  // 2. Send Telegram Approval Request button to Telegram Chat
  console.log(chalk.magenta(`\n2. Sending Interactive Telegram Approval Request to your Telegram chat...`));
  const msgId = await sendApprovalRequest(testEmailJob);

  if (msgId) {
    console.log(chalk.green.bold('\n📱 TELEGRAM APPROVAL BUTTON SENT!'));
    console.log(chalk.yellow('👉 Open your Telegram app right now and click [ Approve & Apply ].'));
    console.log(chalk.gray('The bot is running live right now. When you click [ Approve & Apply ], the button will instantly update to ⏳ Applying... and then ✅ Applied!'));
  }

  console.log(chalk.cyan('\nKeeping bot active for 60 seconds so you can click the button in Telegram...'));
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  console.log(chalk.green('Test completed! Exiting cleanly.'));
  process.exit(0);
}

testRealEmailAndTelegramButton().catch(err => {
  console.error(chalk.red('Test error:', err));
  process.exit(1);
});
