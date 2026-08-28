// notify/telegram.js
// Telegram Bot — sends job alerts and approval buttons.
// Security: every callback_query validates sender chat ID before acting.

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config.js';
import { updateJob, getTodayStats } from '../data/store.js';

let _bot = null;

export function getBot() {
  if (!_bot) {
    _bot = new TelegramBot(config.telegramBotToken, { polling: true });
    setupCallbackHandlers();
  }
  return _bot;
}

// Security: reject any callback not from the authorised chat
function isAuthorised(chatId) {
  return String(chatId) === String(config.telegramChatId);
}

function setupCallbackHandlers() {
  const bot = _bot;

  bot.on('callback_query', async (query) => {
    const { data, message } = query;

    // Reject if not from the owner's chat
    if (!isAuthorised(message.chat.id)) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorised.' });
      return;
    }

    if (data.startsWith('approve:')) {
      const jobId = sanitiseId(data.replace('approve:', ''));
      if (!jobId) return;

      await updateJob(jobId, { status: 'approved', approvedAt: new Date().toISOString() });
      await bot.answerCallbackQuery(query.id, { text: 'Approved. Applying now...' });
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '[ Applying... ]', callback_data: 'noop' }]] },
        { chat_id: message.chat.id, message_id: message.message_id }
      );

      const { applyToJob } = await import('../apply/engine.js');
      const { readJobs } = await import('../data/store.js');
      const jobs = await readJobs();
      const job = jobs.find(j => j.id === jobId);

      if (job) {
        const success = await applyToJob(job);
        const statusText = success ? '[ Applied ]' : '[ Failed — Apply Manually ]';
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: statusText, callback_data: 'noop' }]] },
          { chat_id: message.chat.id, message_id: message.message_id }
        );
        await sendAutoApplyNotification({ ...job, matchScore: job.matchScore || 0 }, success);
      }
    }

    if (data.startsWith('skip:')) {
      const jobId = sanitiseId(data.replace('skip:', ''));
      if (!jobId) return;

      await updateJob(jobId, { status: 'skipped' });
      await bot.answerCallbackQuery(query.id, { text: 'Job skipped.' });
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '[ Skipped ]', callback_data: 'noop' }]] },
        { chat_id: message.chat.id, message_id: message.message_id }
      );
    }
  });
}

export async function sendApprovalRequest(job) {
  const bot = getBot();
  const score = job.matchScore || 0;
  const scoreLabel = score >= 80 ? '[HIGH]' : score >= 70 ? '[GOOD]' : '[OK]';

  const message = `
${scoreLabel} *New Job Match — ${score}% Fit*

*${safe(job.title)}*
Company: ${safe(job.company)}
Location: ${safe(job.location)}
Source: ${safe(job.source)}

*Why you match:*
${job.matchReason ? safe(job.matchReason) : '_AI analysis pending_'}

[View Job Posting](${job.applyUrl})

_Tap Approve to auto-apply, Skip to ignore_
`.trim();

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '[ Approve & Apply ]', callback_data: `approve:${job.id}` },
        { text: '[ Skip ]', callback_data: `skip:${job.id}` },
      ]],
    },
  };

  try {
    const sent = await bot.sendMessage(config.telegramChatId, message, opts);
    return sent.message_id;
  } catch (err) {
    console.error('[Telegram] sendApprovalRequest failed:', err.message);
    return null;
  }
}

export async function sendAutoApplyNotification(job, success) {
  const bot = getBot();
  const statusLabel = success ? '[APPLIED]' : '[FAILED]';
  const statusText = success ? 'Applied automatically.' : 'Auto-apply failed — apply manually.';

  const message = `
${statusLabel} *${safe(job.title)}* — ${job.matchScore}% Match

Company: ${safe(job.company)}
Source: ${safe(job.source)}
Status: ${statusText}
[View Job](${job.applyUrl})
`.trim();

  try {
    await bot.sendMessage(config.telegramChatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Telegram] sendAutoApplyNotification failed:', err.message);
  }
}

export async function sendMorningDigest() {
  const bot = getBot();
  const stats = await getTodayStats();
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  let topMatchText = '';
  if (stats.topMatches.length > 0) {
    topMatchText = '\n\n*Top Matches Today:*\n';
    topMatchText += stats.topMatches.map((job, i) => {
      const status = job.applied ? '[Applied]' : job.status === 'queued_for_approval' ? '[Pending]' : '[Found]';
      return `${i + 1}\\. ${status} *${esc(job.title)}* @ ${esc(job.company)} \\(${job.matchScore}%\\)`;
    }).join('\n');
  }

  const message = `
*Quadri Job Agent — ${esc(dateStr)}*
\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-

Email applied:     ${stats.emailApplied}/15
Web form applied:  ${stats.webFormApplied}/15
Awaiting approval: ${stats.queued} jobs
Total scanned:     ${stats.totalScanned} jobs
Good matches:      ${stats.highMatch} jobs \\(70%\\+\\)
${topMatchText}

_Next scan in 30 minutes\\._
`.trim();

  try {
    await bot.sendMessage(config.telegramChatId, message, { parse_mode: 'MarkdownV2' });
    console.log('[Telegram] Morning digest sent');
  } catch (err) {
    console.error('[Telegram] sendMorningDigest failed:', err.message);
  }
}

export async function sendTestMessage() {
  const bot = getBot();
  try {
    await bot.sendMessage(
      config.telegramChatId,
      '*Quadri Job Agent is LIVE*\n\nYour automated job hunter is running\\. Daily report every morning at 6 AM\\.',
      { parse_mode: 'MarkdownV2' }
    );
    console.log('[Telegram] Test message sent');
  } catch (err) {
    console.error('[Telegram] sendTestMessage failed:', err.message);
  }
}

// Sanitise job ID from callback data — only allow alphanumeric and hyphens
function sanitiseId(id) {
  const clean = String(id || '').replace(/[^a-z0-9\-_]/gi, '').slice(0, 100);
  return clean || null;
}

// Escape for MarkdownV2
function esc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Escape for regular Markdown
function safe(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
