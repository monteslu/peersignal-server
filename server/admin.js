// Admin dashboard for peersignal-server
// Protected by ADMIN_PASSWORD env var

import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import * as rooms from './rooms.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Track server stats
const stats = {
  startTime: Date.now(),
  totalConnections: 0,
  totalRoomsCreated: 0,
  totalJoinRequests: 0,
};

// Activity log (circular buffer)
const activityLog = [];
const MAX_LOG_SIZE = 100;

export function logActivity(type, details) {
  activityLog.push({
    time: new Date().toISOString(),
    type,
    details,
  });
  if (activityLog.length > MAX_LOG_SIZE) {
    activityLog.shift();
  }
}

export function incrementStat(stat) {
  if (stats[stat] !== undefined) {
    stats[stat]++;
  }
}

// Basic auth middleware
function checkAuth(req, res) {
  if (!ADMIN_PASSWORD) {
    res.writeHead(404);
    res.end('Not found');
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
      'Content-Type': 'text/plain',
    });
    res.end('Authentication required');
    return false;
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');

  if (user !== 'admin' || pass !== ADMIN_PASSWORD) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
      'Content-Type': 'text/plain',
    });
    res.end('Invalid credentials');
    return false;
  }

  return true;
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
      age: Math.floor((Date.now() - room.createdAt) / 1000),
    });
  }
  
  return roomsData;
}

// Dashboard HTML
function renderDashboard() {
  const roomsData = getRoomsData();
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;

  const roomRows = roomsData.length > 0
    ? roomsData.map(r => `
        <tr>
          <td><code>${r.code}</code></td>
          <td>${r.hostConnected ? '🟢 Yes' : '🔴 No'}</td>
          <td>${r.pendingCount}</td>
          <td>${r.approvedCount}</td>
          <td>${r.age}s</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#666">No active rooms</td></tr>';

  const recentActivity = activityLog.slice(-20).reverse().map(a => `
    <tr>
      <td>${a.time.slice(11, 19)}</td>
      <td>${a.type}</td>
      <td>${a.details}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:#666">No recent activity</td></tr>';

  return `<!DOCTYPE html>
<html>
<head>
  <title>PeerSignal Admin</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="10">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    h1 { margin: 0 0 20px; color: #2c3e50; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat {
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #3498db;
    }
    .stat-label { color: #666; font-size: 0.9em; }
    h2 { margin: 20px 0 10px; color: #2c3e50; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { background: #34495e; color: white; }
    tr:hover { background: #f9f9f9; }
    code {
      background: #e8e8e8;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
    .refresh { color: #666; font-size: 0.8em; }
  </style>
</head>
<body>
  <h1>🔗 PeerSignal Admin Dashboard</h1>
  <p class="refresh">Auto-refreshes every 10 seconds</p>
  
  <div class="stats">
    <div class="stat">
      <div class="stat-value">${uptimeStr}</div>
      <div class="stat-label">Uptime</div>
    </div>
    <div class="stat">
      <div class="stat-value">${roomsData.length}</div>
      <div class="stat-label">Active Rooms</div>
    </div>
    <div class="stat">
      <div class="stat-value">${roomsData.reduce((sum, r) => sum + r.approvedCount, 0)}</div>
      <div class="stat-label">Connected Peers</div>
    </div>
    <div class="stat">
      <div class="stat-value">${roomsData.reduce((sum, r) => sum + r.pendingCount, 0)}</div>
      <div class="stat-label">Pending Requests</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.totalConnections}</div>
      <div class="stat-label">Total Connections</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.totalRoomsCreated}</div>
      <div class="stat-label">Rooms Created</div>
    </div>
  </div>

  <h2>Active Rooms</h2>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Host Connected</th>
        <th>Pending</th>
        <th>Approved</th>
        <th>Age</th>
      </tr>
    </thead>
    <tbody>${roomRows}</tbody>
  </table>

  <h2>Recent Activity</h2>
  <table>
    <thead>
      <tr>
        <th style="width:80px">Time</th>
        <th style="width:120px">Type</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>${recentActivity}</tbody>
  </table>
</body>
</html>`;
}

// JSON API endpoint
function getStatsJson() {
  const roomsData = getRoomsData();
  return {
    uptime: Math.floor((Date.now() - stats.startTime) / 1000),
    activeRooms: roomsData.length,
    connectedPeers: roomsData.reduce((sum, r) => sum + r.approvedCount, 0),
    pendingRequests: roomsData.reduce((sum, r) => sum + r.pendingCount, 0),
    totalConnections: stats.totalConnections,
    totalRoomsCreated: stats.totalRoomsCreated,
    totalJoinRequests: stats.totalJoinRequests,
    rooms: roomsData,
    recentActivity: activityLog.slice(-20).reverse(),
  };
}

// Route handler
export function handleAdminRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (!url.pathname.startsWith('/admin')) {
    return false;
  }

  if (!checkAuth(req, res)) {
    return true;
  }

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderDashboard());
    return true;
  }

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
