// logger.js
// Structured logging system for AI Auto Job Agent.
// Writes logs to console, logs/agent.log (raw text), and data/logs/logs-YYYY-MM-DD.json (daily JSON for dashboard).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
const JSON_LOGS_DIR = path.join(__dirname, 'data', 'logs');
const LEGACY_JSON_LOG_FILE = path.join(__dirname, 'data', 'logs.json');

// Ensure log directories exist
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(JSON_LOGS_DIR)) fs.mkdirSync(JSON_LOGS_DIR, { recursive: true });

function getTodayLogFile() {
  const dateStr = new Date().toISOString().split('T')[0];
  return path.join(JSON_LOGS_DIR, `logs-${dateStr}.json`);
}

// Migrate legacy data/logs.json into daily files if present
try {
  if (fs.existsSync(LEGACY_JSON_LOG_FILE)) {
    const content = fs.readFileSync(LEGACY_JSON_LOG_FILE, 'utf8');
    const logs = JSON.parse(content || '[]');
    if (Array.isArray(logs) && logs.length > 0) {
      const grouped = {};
      for (const log of logs) {
        const dateStr = (log.timestamp || new Date().toISOString()).split('T')[0];
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push(log);
      }
      for (const [dateStr, dateLogs] of Object.entries(grouped)) {
        const targetFile = path.join(JSON_LOGS_DIR, `logs-${dateStr}.json`);
        let existing = [];
        if (fs.existsSync(targetFile)) {
          try { existing = JSON.parse(fs.readFileSync(targetFile, 'utf8')); } catch { }
        }
        const merged = [...dateLogs, ...existing];
        fs.writeFileSync(targetFile, JSON.stringify(merged, null, 2), 'utf8');
      }
    }
    fs.renameSync(LEGACY_JSON_LOG_FILE, `${LEGACY_JSON_LOG_FILE}.migrated.bak`);
    console.log(`[Logger] Migrated legacy logs.json into daily files in ${JSON_LOGS_DIR}`);
  }
} catch (err) {
  console.error('[Logger] Failed legacy logs migration:', err.message);
}

const MAX_JSON_LOGS_PER_DAY = 500;

export function logEvent(level, category, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp,
    level, // 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
    category, // 'SCAN' | 'SCORE' | 'APPLY' | 'TELEGRAM' | 'SYSTEM'
    message,
    details: details || {}
  };

  // 1. Console log
  const logPrefix = `[${timestamp.slice(11, 19)}] [${level}] [${category}]`;
  if (level === 'ERROR') {
    console.error(`${logPrefix} ${message}`, details.error || '');
  } else {
    console.log(`${logPrefix} ${message}`);
  }

  // 2. Append to text log file
  const textLine = `${timestamp} [${level.padEnd(7)}] [${category.padEnd(8)}] ${message} ${Object.keys(details).length ? JSON.stringify(details) : ''}\n`;
  fs.appendFileSync(LOG_FILE, textLine, 'utf8');

  // 3. Update daily JSON log file for web dashboard
  try {
    const todayLogFile = getTodayLogFile();
    let logs = [];
    if (fs.existsSync(todayLogFile)) {
      const content = fs.readFileSync(todayLogFile, 'utf8');
      logs = JSON.parse(content || '[]');
    }
    logs.unshift(logEntry);
    if (logs.length > MAX_JSON_LOGS_PER_DAY) logs = logs.slice(0, MAX_JSON_LOGS_PER_DAY);
    fs.writeFileSync(todayLogFile, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('[Logger] Failed to write daily JSON log:', err.message);
  }

  return logEntry;
}

export function getLogs(limit = 100, category = null) {
  try {
    const files = fs.readdirSync(JSON_LOGS_DIR)
      .filter(f => f.startsWith('logs-') && f.endsWith('.json'))
      .sort()
      .reverse();

    let allLogs = [];
    for (const file of files) {
      if (allLogs.length >= limit * 2) break;
      const content = fs.readFileSync(path.join(JSON_LOGS_DIR, file), 'utf8');
      const logs = JSON.parse(content || '[]');
      allLogs.push(...logs);
    }

    if (category) {
      allLogs = allLogs.filter(l => l.category.toLowerCase() === category.toLowerCase());
    }
    return allLogs.slice(0, limit);
  } catch (err) {
    console.error('[Logger] Failed to read daily logs:', err.message);
    return [];
  }
}

export function clearLogs() {
  try {
    const files = fs.readdirSync(JSON_LOGS_DIR).filter(f => f.startsWith('logs-') && f.endsWith('.json'));
    for (const f of files) {
      fs.writeFileSync(path.join(JSON_LOGS_DIR, f), '[]', 'utf8');
    }
  } catch { }
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  logEvent('INFO', 'SYSTEM', 'Logs cleared by user request');
}
