// logger.js
// Structured logging system for AI Auto Job Agent.
// Writes logs to console, logs/agent.log (raw text), and data/logs.json (structured JSON for dashboard).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
const JSON_LOG_FILE = path.join(__dirname, 'data', 'logs.json');

// Ensure log directories exist
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(JSON_LOG_FILE)) fs.writeFileSync(JSON_LOG_FILE, '[]', 'utf8');

const MAX_JSON_LOGS = 500;

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

  // 3. Update JSON log file for web dashboard
  try {
    let logs = [];
    if (fs.existsSync(JSON_LOG_FILE)) {
      const content = fs.readFileSync(JSON_LOG_FILE, 'utf8');
      logs = JSON.parse(content || '[]');
    }
    logs.unshift(logEntry);
    if (logs.length > MAX_JSON_LOGS) logs = logs.slice(0, MAX_JSON_LOGS);
    fs.writeFileSync(JSON_LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('[Logger] Failed to write JSON log:', err.message);
  }

  return logEntry;
}

export function getLogs(limit = 100, category = null) {
  try {
    if (!fs.existsSync(JSON_LOG_FILE)) return [];
    const content = fs.readFileSync(JSON_LOG_FILE, 'utf8');
    let logs = JSON.parse(content || '[]');
    if (category) {
      logs = logs.filter(l => l.category.toLowerCase() === category.toLowerCase());
    }
    return logs.slice(0, limit);
  } catch (err) {
    console.error('[Logger] Failed to read logs:', err.message);
    return [];
  }
}

export function clearLogs() {
  fs.writeFileSync(JSON_LOG_FILE, '[]', 'utf8');
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  logEvent('INFO', 'SYSTEM', 'Logs cleared by user request');
}
