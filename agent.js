// agent.js
// Entry point. Validates environment, then starts the scheduler or runs a single command.

import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { validateEnv, config } from './config.js';
import { startScheduler, processPendingJobs } from './scheduler.js';
import { runAllScrapers } from './scrapers/index.js';
import { getBot, sendTestMessage } from './notify/telegram.js';
import { startDashboardServer } from './server.js';
import { logEvent } from './logger.js';
import chalk from 'chalk';

validateEnv();

async function main() {
  console.log(chalk.blue('Starting AI Auto Job Agent...'));
  logEvent('INFO', 'SYSTEM', 'AI Auto Job Agent initializing...');

  // Start HTTP Web Dashboard for /logs
  startDashboardServer();

  getBot({ polling: true });
  console.log(chalk.green('Telegram bot ready.'));
  logEvent('INFO', 'TELEGRAM', 'Telegram Bot connected');

  const args = process.argv.slice(2);

  if (args.includes('--test-telegram')) {
    await sendTestMessage();
    process.exit(0);
  }

  if (args.includes('--scan-once')) {
    console.log(chalk.cyan('Running one-time scan...'));
    logEvent('INFO', 'SCAN', 'One-time job scan started');
    await runAllScrapers(config.platforms);
    await processPendingJobs();
    logEvent('SUCCESS', 'SCAN', 'One-time job scan completed');
    process.exit(0);
  }

  // Daemon mode — starts cron scheduler then immediately does first scan
  startScheduler();
  logEvent('INFO', 'SYSTEM', 'Scheduler started in daemon mode');
  await runAllScrapers(config.platforms);
  await processPendingJobs();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
