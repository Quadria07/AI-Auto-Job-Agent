// config.js
// Single source of truth for all configuration.
// Loads secrets from .env, settings from config.json.
// Every module imports from here — nothing reads config.json or process.env directly.

import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSettings() {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch {
    console.error('[Config] Failed to read config.json');
    process.exit(1);
  }
}

const settings = loadSettings();

// Validate required env vars at startup — fail fast with a clear message
const REQUIRED_ENV = [
  'DEEPSEEK_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
];

export function validateEnv() {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[Config] Missing required environment variables:\n  ${missing.join('\n  ')}`);
    console.error('[Config] Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

// The single config object used across the entire app
export const config = {
  // Secrets from .env
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  gmail: {
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD,
  },

  // Settings from config.json
  matchThresholds: settings.matchThresholds,
  schedule: settings.schedule,
  platforms: settings.platforms,
  maxJobsPerScan: settings.maxJobsPerScan,
  maxApplicationsPerHour: settings.maxApplicationsPerHour || 5,
  maxApplicationsPerDay: settings.maxApplicationsPerDay,
  deepseek: {
    model: process.env.DEEPSEEK_MODEL || settings.deepseek?.model || 'deepseek-chat',
    baseUrl: settings.deepseek?.baseUrl || 'https://api.deepseek.com',
  },
};
