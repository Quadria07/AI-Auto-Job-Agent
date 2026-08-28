// agent.js
// Entry point. Validates environment, then starts the scheduler or runs a single command.

import { validateEnv, config } from './config.js';
import { startScheduler, processPendingJobs } from './scheduler.js';
import { runAllScrapers } from './scrapers/index.js';
import { getBot, sendTestMessage } from './notify/telegram.js';
import chalk from 'chalk';

validateEnv();

async function main() {
  console.log(chalk.blue('Starting AI Auto Job Agent...'));

  getBot();
  console.log(chalk.green('Telegram bot ready.'));

  const args = process.argv.slice(2);

  if (args.includes('--test-telegram')) {
    await sendTestMessage();
    process.exit(0);
  }

  if (args.includes('--scan-once')) {
    console.log(chalk.cyan('Running one-time scan...'));
    await runAllScrapers(config.platforms);
    await processPendingJobs();
    process.exit(0);
  }

  // Daemon mode — starts cron scheduler then immediately does first scan
  startScheduler();
  await runAllScrapers(config.platforms);
  await processPendingJobs();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
