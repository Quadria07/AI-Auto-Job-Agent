// server.js
// Express Web Dashboard for AI Auto Job Agent.
// Serves / and /logs with Pretty View & JSON View, live stats, and API endpoints.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogs, clearLogs, logEvent } from './logger.js';
import { getTodayStats, readJobs } from './data/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Endpoints
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 150;
  const category = req.query.category || null;
  res.json(getLogs(limit, category));
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getTodayStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clear-logs', (req, res) => {
  clearLogs();
  res.json({ success: true, message: 'Logs cleared successfully' });
});

app.post('/api/trigger-scan', async (req, res) => {
  logEvent('INFO', 'SCAN', 'Manual scan triggered from Web Dashboard');
  res.json({ success: true, message: 'Job scan started in background' });
  
  // Trigger scan in background
  try {
    const { runAllScrapers } = await import('./scrapers/index.js');
    const { processPendingJobs } = await import('./scheduler.js');
    const { config } = await import('./config.js');
    
    runAllScrapers(config.platforms)
      .then(() => processPendingJobs())
      .catch(err => logEvent('ERROR', 'SCAN', `Manual scan failed: ${err.message}`));
  } catch (e) {
    console.error('Trigger scan err:', e);
  }
});

// Serve Dashboard HTML on / and /logs
const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quadri AI Job Agent — Live Dashboard & Logs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0c10;
      --panel-bg: rgba(18, 22, 31, 0.75);
      --panel-border: rgba(255, 255, 255, 0.08);
      --accent-blue: #3b82f6;
      --accent-cyan: #06b6d4;
      --accent-green: #10b981;
      --accent-yellow: #f59e0b;
      --accent-red: #ef4444;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 10% 10%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
        radial-gradient(at 90% 90%, rgba(6, 182, 212, 0.12) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 24px;
    }

    .container { max-width: 1280px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--panel-border);
      margin-bottom: 24px;
    }

    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      width: 42px; height: 42px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 20px; color: white;
      box-shadow: 0 4px 15px rgba(6, 182, 212, 0.3);
    }
    .brand-title h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .brand-title p { font-size: 13px; color: var(--text-muted); }

    .status-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--accent-green);
      padding: 6px 14px; border-radius: 20px;
      font-size: 13px; font-weight: 600;
    }
    .dot { width: 8px; height: 8px; background: var(--accent-green); border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      backdrop-filter: blur(12px);
      border-radius: 14px;
      padding: 20px;
      transition: transform 0.2s;
    }
    .stat-card:hover { transform: translateY(-2px); }
    .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 500; }
    .stat-value { font-size: 30px; font-weight: 700; margin-top: 6px; color: var(--text-main); }
    .stat-sub { font-size: 12px; margin-top: 4px; color: var(--accent-cyan); }

    /* Controls Bar */
    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      backdrop-filter: blur(12px);
      padding: 14px 20px;
      border-radius: 14px;
    }

    .tabs { display: flex; gap: 8px; }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.4);
      color: white;
    }

    .actions { display: flex; align-items: center; gap: 10px; }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-primary { background: var(--accent-blue); color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text-main); border: 1px solid var(--panel-border); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }

    .search-input {
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--panel-border);
      color: white;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      width: 220px;
    }
    .search-input:focus { outline: none; border-color: var(--accent-cyan); }

    /* Content Views */
    .view-panel {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      backdrop-filter: blur(12px);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    /* Pretty View Table */
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: rgba(255,255,255,0.03);
      padding: 14px 18px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--panel-border);
    }
    td {
      padding: 14px 18px;
      font-size: 13px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      vertical-align: middle;
    }
    tr:hover { background: rgba(255,255,255,0.02); }

    .time-col { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); }
    
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-info { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .badge-warn { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .badge-error { background: rgba(239, 68, 68, 0.2); color: #f87171; }

    .cat-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--accent-cyan);
      background: rgba(6, 182, 212, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* JSON View */
    #jsonView {
      display: none;
      padding: 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #38bdf8;
      background: #05070a;
      max-height: 700px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-logo">QA</div>
        <div class="brand-title">
          <h1>AI Auto Job Agent — Live Dashboard</h1>
          <p>Quadri Adebisi • Automated Career Pipeline</p>
        </div>
      </div>
      <div class="status-badge">
        <span class="dot"></span>
        SYSTEM ONLINE & AGENT ACTIVE
      </div>
    </header>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Jobs Scanned Today</div>
        <div class="stat-value" id="statScanned">0</div>
        <div class="stat-sub">Across 7 Remote Feeds</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">High Matches (≥70%)</div>
        <div class="stat-value" id="statMatches" style="color: var(--accent-cyan)">0</div>
        <div class="stat-sub">Evaluated by DeepSeek AI</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Applied (Email / Web)</div>
        <div class="stat-value" id="statApplied" style="color: var(--accent-green)">0</div>
        <div class="stat-sub">Direct Recruiter Delivery</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Approval</div>
        <div class="stat-value" id="statQueued" style="color: var(--accent-yellow)">0</div>
        <div class="stat-sub">Waiting for Telegram Tap</div>
      </div>
    </div>

    <!-- Controls Bar -->
    <div class="controls-bar">
      <div class="tabs">
        <button class="tab-btn active" id="btnPretty" onclick="switchView('pretty')">🎨 Pretty View</button>
        <button class="tab-btn" id="btnJson" onclick="switchView('json')">📄 JSON View</button>
      </div>

      <div class="actions">
        <input type="text" id="searchInput" class="search-input" placeholder="Search logs..." onkeyup="filterLogs()">
        <button class="btn btn-primary" onclick="triggerScan()">⚡ Run Scan Now</button>
        <button class="btn btn-secondary" onclick="clearLogsUI()">🧹 Clear Logs</button>
      </div>
    </div>

    <!-- View Panels -->
    <div class="view-panel">
      <!-- Pretty View -->
      <div id="prettyView">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Category</th>
              <th>Event Message & Details</th>
            </tr>
          </thead>
          <tbody id="logsTableBody">
            <tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted)">Loading logs...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- JSON View -->
      <pre id="jsonView">Loading raw JSON logs...</pre>
    </div>
  </div>

  <script>
    let allLogs = [];
    let currentView = 'pretty';

    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('statScanned').innerText = data.totalScanned || 0;
        document.getElementById('statMatches').innerText = data.highMatch || 0;
        document.getElementById('statApplied').innerText = (data.emailApplied || 0) + (data.webFormApplied || 0);
        document.getElementById('statQueued').innerText = data.queued || 0;
      } catch (e) {
        console.error('Stats error:', e);
      }
    }

    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs');
        allLogs = await res.json();
        renderLogs();
      } catch (e) {
        console.error('Logs error:', e);
      }
    }

    function renderLogs() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const filtered = allLogs.filter(l => 
        l.message.toLowerCase().includes(search) || 
        l.category.toLowerCase().includes(search) ||
        JSON.stringify(l.details).toLowerCase().includes(search)
      );

      // Render Pretty View Table
      const tbody = document.getElementById('logsTableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted)">No logs found.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(l => {
          const time = l.timestamp ? l.timestamp.slice(11, 19) : '--:--:--';
          let levelClass = 'badge-info';
          if (l.level === 'SUCCESS') levelClass = 'badge-success';
          if (l.level === 'WARN') levelClass = 'badge-warn';
          if (l.level === 'ERROR') levelClass = 'badge-error';

          const detailsStr = Object.keys(l.details || {}).length ? \`<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-family:'JetBrains Mono',monospace">\${JSON.stringify(l.details)}</div>\` : '';

          return \`
            <tr>
              <td class="time-col">\${time}</td>
              <td><span class="badge \${levelClass}">\${l.level}</span></td>
              <td><span class="cat-badge">\${l.category}</span></td>
              <td>
                <div style="font-weight:500">\${l.message}</div>
                \${detailsStr}
              </td>
            </tr>
          \`;
        }).join('');
      }

      // Render JSON View
      document.getElementById('jsonView').textContent = JSON.stringify(filtered, null, 2);
    }

    function switchView(view) {
      currentView = view;
      document.getElementById('btnPretty').classList.toggle('active', view === 'pretty');
      document.getElementById('btnJson').classList.toggle('active', view === 'json');
      document.getElementById('prettyView').style.display = view === 'pretty' ? 'block' : 'none';
      document.getElementById('jsonView').style.display = view === 'json' ? 'block' : 'none';
    }

    function filterLogs() {
      renderLogs();
    }

    async function triggerScan() {
      if (confirm('Start a manual job scan now?')) {
        await fetch('/api/trigger-scan', { method: 'POST' });
        alert('Job scan triggered! Check logs below in a few seconds.');
        fetchLogs();
      }
    }

    async function clearLogsUI() {
      if (confirm('Clear all log entries?')) {
        await fetch('/api/clear-logs', { method: 'POST' });
        fetchLogs();
      }
    }

    // Initial Load & Auto Refresh
    fetchStats();
    fetchLogs();
    setInterval(() => {
      fetchStats();
      fetchLogs();
    }, 5000);
  </script>
</body>
</html>
`;

app.get(['/', '/logs'], (req, res) => {
  res.send(DASHBOARD_HTML);
});

export function startDashboardServer() {
  app.listen(PORT, () => {
    console.log(`[Dashboard] Web dashboard running at http://localhost:${PORT} or /logs on Railway`);
    logEvent('INFO', 'SYSTEM', `Web Dashboard initialized on port ${PORT}`);
  });
}
