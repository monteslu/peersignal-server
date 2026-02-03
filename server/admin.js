// Admin dashboard for peersignal-server
// Protected by ADMIN_PASSWORD env var with cookie-based sessions

import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import * as rooms from './rooms.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const COOKIE_NAME = 'peersignal_admin';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

// Simple HMAC-based token for cookie
function generateToken() {
  const secret = ADMIN_PASSWORD || randomBytes(32).toString('hex');
  const timestamp = Date.now().toString();
  const hmac = createHmac('sha256', secret).update(timestamp).digest('hex');
  return `${timestamp}.${hmac}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_PASSWORD) return false;
  const [timestamp, hmac] = token.split('.');
  if (!timestamp || !hmac) return false;
  
  // Check token age (24 hours)
  const age = Date.now() - parseInt(timestamp, 10);
  if (age > COOKIE_MAX_AGE * 1000) return false;
  
  const expectedHmac = createHmac('sha256', ADMIN_PASSWORD).update(timestamp).digest('hex');
  return hmac === expectedHmac;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = rest.join('=');
  });
  return cookies;
}

// Get rooms data for dashboard
function getRoomsData() {
  const roomsData = [];
  const allRooms = rooms.getAllRooms ? rooms.getAllRooms() : new Map();
  
  for (const [code, room] of allRooms) {
    roomsData.push({
      code,
      hostConnected: room.hostSocket?.connected ?? false,
      pendingCount: room.pendingPeers?.size ?? 0,
      approvedCount: room.approvedPeers?.size ?? 0,
      createdAt: room.createdAt,
      age: Math.floor((Date.now() - (room.createdAt || Date.now())) / 1000),
    });
  }
  
  return roomsData;
}

// Get stats
function getStats() {
  if (rooms.getStats) {
    return rooms.getStats();
  }
  const roomsData = getRoomsData();
  return {
    totalRooms: roomsData.length,
    totalPending: roomsData.reduce((sum, r) => sum + r.pendingCount, 0),
    totalApproved: roomsData.reduce((sum, r) => sum + r.approvedCount, 0),
  };
}

// Login page HTML
function renderLoginPage(error = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <title>PeerSignal Admin - Login</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }
    .login-box {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      margin: 0 0 8px;
      color: #2c3e50;
      font-size: 24px;
    }
    .subtitle {
      color: #666;
      margin: 0 0 24px;
      font-size: 14px;
    }
    .error {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      color: #333;
      font-weight: 500;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #3498db;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
      transition: background 0.2s;
    }
    button:hover {
      background: #2980b9;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>🔗 PeerSignal Admin</h1>
    <p class="subtitle">Enter admin password to continue</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

// Dashboard HTML
function renderDashboard() {
  const roomsData = getRoomsData();
  const stats = getStats();

  const roomRows = roomsData.length > 0
    ? roomsData.map(r => `
        <tr>
          <td><code>${r.code}</code></td>
          <td>${r.hostConnected ? '🟢 Connected' : '🔴 Disconnected'}</td>
          <td>${r.pendingCount}</td>
          <td>${r.approvedCount}</td>
          <td>${r.age}s</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="empty">No active rooms</td></tr>';

  return `<!DOCTYPE html>
<html>
<head>
  <title>PeerSignal Admin</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f7fa;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    h1 { margin: 0; color: #2c3e50; }
    .logout {
      color: #666;
      text-decoration: none;
      padding: 8px 16px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      transition: all 0.2s;
    }
    .logout:hover {
      background: #fee;
      border-color: #fcc;
      color: #c00;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .stat-value {
      font-size: 2.5em;
      font-weight: 700;
      color: #3498db;
      line-height: 1;
    }
    .stat-label {
      color: #666;
      font-size: 14px;
      margin-top: 8px;
    }
    h2 {
      margin: 24px 0 12px;
      color: #2c3e50;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    th, td {
      padding: 14px 16px;
      text-align: left;
    }
    th {
      background: #34495e;
      color: white;
      font-weight: 600;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      border-bottom: 1px solid #eee;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: #f8f9fa;
    }
    code {
      background: #e8f4fc;
      color: #2980b9;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
    }
    .empty {
      text-align: center;
      color: #999;
      padding: 40px !important;
    }
    .refresh-note {
      color: #999;
      font-size: 12px;
      margin-top: 16px;
    }
  </style>
  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);
  </script>
</head>
<body>
  <div class="header">
    <h1>🔗 PeerSignal Admin</h1>
    <a href="/admin/logout" class="logout">Sign Out</a>
  </div>
  
  <div class="stats">
    <div class="stat">
      <div class="stat-value">${stats.totalRooms}</div>
      <div class="stat-label">Active Rooms</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.totalApproved}</div>
      <div class="stat-label">Connected Peers</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.totalPending}</div>
      <div class="stat-label">Pending Requests</div>
    </div>
  </div>

  <h2>Active Rooms</h2>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Host</th>
        <th>Pending</th>
        <th>Approved</th>
        <th>Age</th>
      </tr>
    </thead>
    <tbody>${roomRows}</tbody>
  </table>
  
  <p class="refresh-note">Auto-refreshes every 5 seconds</p>
</body>
</html>`;
}

// JSON API endpoint
function getStatsJson() {
  const roomsData = getRoomsData();
  const stats = getStats();
  return {
    ...stats,
    rooms: roomsData,
  };
}

// Parse POST body
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params));
    });
  });
}

// Route handler
export async function handleAdminRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (!url.pathname.startsWith('/admin')) {
    return false;
  }

  // Admin disabled if no password set
  if (!ADMIN_PASSWORD) {
    res.writeHead(404);
    res.end('Not found');
    return true;
  }

  const cookies = parseCookies(req.headers.cookie);
  const isAuthenticated = verifyToken(cookies[COOKIE_NAME]);

  // Login form submission
  if (url.pathname === '/admin/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if (body.password === ADMIN_PASSWORD) {
      const token = generateToken();
      res.writeHead(302, {
        'Location': '/admin',
        'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`,
      });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLoginPage('Invalid password'));
    }
    return true;
  }

  // Logout
  if (url.pathname === '/admin/logout') {
    res.writeHead(302, {
      'Location': '/admin',
      'Set-Cookie': `${COOKIE_NAME}=; Path=/admin; HttpOnly; Max-Age=0`,
    });
    res.end();
    return true;
  }

  // Require auth for everything else
  if (!isAuthenticated) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderLoginPage());
    return true;
  }

  // Dashboard
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderDashboard());
    return true;
  }

  // API endpoint
  if (url.pathname === '/admin/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatsJson(), null, 2));
    return true;
  }

  res.writeHead(404);
  res.end('Not found');
  return true;
}

export function isAdminEnabled() {
  return !!ADMIN_PASSWORD;
}
