// server.js
// Express Web Dashboard for AI Auto Job Agent.
// Strictly monochrome, zero-radius executive design. Serves / and /logs with Pretty View & JSON View.

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
  const limit = parseInt(req.query.limit) || 200;
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
  res.json({ success: true, message: 'Logs cleared' });
});

app.post('/api/trigger-scan', async (req, res) => {
  logEvent('INFO', 'SCAN', 'Manual scan triggered from Web Dashboard');
  res.json({ success: true, message: 'Job scan started' });
  
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

// Serve Monochrome Zero-Radius Dashboard HTML
const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quadri AI Job Agent — Executive Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #000000;
      --panel: #09090b;
      --border: #27272a;
      --border-bright: #3f3f46;
      --text: #ffffff;
      --muted: #a1a1aa;
      --subtle: #71717a;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; border-radius: 0px !important; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 24px;
      line-height: 1.5;
    }

    .container { max-width: 1300px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }

    .brand h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; text-transform: uppercase; }
    .brand p { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 4px; }

    .status-box {
      display: flex; align-items: center; gap: 10px;
      border: 1px solid var(--border-bright);
      padding: 6px 14px;
      font-size: 11px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.5px;
      background: var(--panel);
    }
    .indicator { width: 6px; height: 6px; background: #ffffff; }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
      margin-bottom: 32px;
    }

    .metric-card {
      background: var(--panel);
      padding: 24px;
    }
    .metric-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .metric-value { font-size: 32px; font-weight: 700; margin-top: 8px; font-family: 'JetBrains Mono', monospace; }
    .metric-sub { font-size: 11px; color: var(--subtle); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

    /* Controls Bar */
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }

    .nav-tabs { display: flex; gap: 0px; border: 1px solid var(--border); }
    .tab-btn {
      background: transparent;
      border: none;
      border-right: 1px solid var(--border);
      color: var(--muted);
      padding: 10px 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .tab-btn:last-child { border-right: none; }
    .tab-btn.active { background: #ffffff; color: #000000; font-weight: 700; }

    .action-group { display: flex; align-items: center; gap: 12px; }
    .search-field {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      width: 260px;
    }
    .search-field:focus { outline: none; border-color: var(--text); }

    .btn {
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: pointer;
      border: 1px solid var(--border-bright);
      background: var(--panel);
      color: var(--text);
    }
    .btn:hover { background: #ffffff; color: #000000; }
    .btn-primary { background: #ffffff; color: #000000; border: 1px solid #ffffff; }
    .btn-primary:hover { background: #e4e4e7; color: #000000; }

    /* Data Table */
    .table-container {
      background: var(--panel);
      border: 1px solid var(--border);
    }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: #121215;
      padding: 14px 18px;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace;
    }
    td {
      padding: 14px 18px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #121215; }

    .time-cell { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--subtle); }
    
    .tag {
      display: inline-block;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      border: 1px solid var(--border-bright);
      background: #18181b;
      color: var(--text);
    }
    .tag-error { background: #ffffff; color: #000000; font-weight: 700; }
    .tag-warn { border-color: #a1a1aa; color: #e4e4e7; }
    .tag-success { border-color: #ffffff; color: #ffffff; }

    .cat-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
    }

    .details-box {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
      word-break: break-all;
    }

    /* JSON View */
    #jsonView {
      display: none;
      padding: 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #e4e4e7;
      background: var(--panel);
      border: 1px solid var(--border);
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
        <h1>AI Auto Job Agent — System Logs</h1>
        <p>QUADRI ADEBISI • AUTOMATED CAREER PIPELINE</p>
      </div>
      <div class="status-box">
        <div class="indicator"></div>
        SYSTEM ACTIVE • DAEMON RUNNING
      </div>
    </header>

    <!-- Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Scanned Jobs</div>
        <div class="metric-value" id="statScanned">0</div>
        <div class="metric-sub">Across 7 Platforms</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">High Matches (≥70%)</div>
        <div class="metric-value" id="statMatches">0</div>
        <div class="metric-sub">Evaluated by AI</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Daily Apply Limit</div>
        <div class="metric-value" id="statApplied">0 / 5</div>
        <div class="metric-sub">2 Web Form • 3 Email</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pending Approval</div>
        <div class="metric-value" id="statQueued">0</div>
        <div class="metric-sub">Telegram Queue</div>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <div class="nav-tabs">
        <button class="tab-btn active" id="btnPretty" onclick="switchView('pretty')">Pretty View</button>
        <button class="tab-btn" id="btnJson" onclick="switchView('json')">JSON View</button>
      </div>

      <div class="action-group">
        <input type="text" id="searchInput" class="search-field" placeholder="Search logs..." onkeyup="filterLogs()">
        <button class="btn btn-primary" onclick="triggerScan()">Run Scan Now</button>
        <button class="btn" onclick="clearLogsUI()">Clear Logs</button>
      </div>
    </div>

    <!-- Pretty View -->
    <div class="table-container" id="prettyView">
      <table>
        <thead>
          <tr>
            <th style="width: 100px;">Time</th>
            <th style="width: 100px;">Level</th>
            <th style="width: 120px;">Category</th>
            <th>Event Message & Details</th>
          </tr>
        </thead>
        <tbody id="logsTableBody">
          <tr><td colspan="4" style="text-align:center; padding:30px; color:var(--muted); font-family:'JetBrains Mono'">Loading system logs...</td></tr>
        </tbody>
      </table>
    </div>

    <!-- JSON View -->
    <pre id="jsonView">Loading raw JSON logs...</pre>
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
        const appliedTotal = (data.emailApplied || 0) + (data.webFormApplied || 0);
        document.getElementById('statApplied').innerText = appliedTotal + ' / 5';
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

      const tbody = document.getElementById('logsTableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--muted); font-family:\'JetBrains Mono\'">No log records found.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(l => {
          const time = l.timestamp ? l.timestamp.slice(11, 19) : '--:--:--';
          let tagClass = '';
          if (l.level === 'SUCCESS') tagClass = 'tag-success';
          if (l.level === 'WARN') tagClass = 'tag-warn';
          if (l.level === 'ERROR') tagClass = 'tag-error';

          const detailsStr = Object.keys(l.details || {}).length 
            ? \`<div class="details-box">\${JSON.stringify(l.details)}</div>\` 
            : '';

          return \`
            <tr>
              <td class="time-cell">\${time}</td>
              <td><span class="tag \${tagClass}">\${l.level}</span></td>
              <td><span class="cat-tag">\${l.category}</span></td>
              <td>
                <div style="font-weight:500">\${l.message}</div>
                \${detailsStr}
              </td>
            </tr>
          \`;
        }).join('');
      }

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
      if (confirm('Execute immediate job scan?')) {
        await fetch('/api/trigger-scan', { method: 'POST' });
        fetchLogs();
      }
    }

    async function clearLogsUI() {
      if (confirm('Clear all stored log records?')) {
        await fetch('/api/clear-logs', { method: 'POST' });
        fetchLogs();
      }
    }

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
    console.log(`[Dashboard] Executive web dashboard running at http://localhost:${PORT}`);
    logEvent('INFO', 'SYSTEM', `Executive Dashboard active on port ${PORT}`);
  });
}
