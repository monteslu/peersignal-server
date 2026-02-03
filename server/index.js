import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import rawr from 'rawr';
import { EventEmitter } from 'events';

import * as rooms from './rooms.js';
import { normalizeCode, validateCode } from './codes.js';
import { 
  connectionLimiter, 
  roomCreationLimiter, 
  joinLimiter, 
  signalLimiter 
} from './rate-limit.js';
import { handleAdminRequest, isAdminEnabled, logActivity, incrementStat } from './admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
  maxPendingPerRoom: parseInt(process.env.MAX_PENDING_PER_ROOM) || 10,
  maxRoomsPerIp: parseInt(process.env.MAX_ROOMS_PER_IP) || 5,
  idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS) || 5 * 60 * 1000, // 5 min
  maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE) || 16 * 1024, // 16KB
};

// STUN servers (Google's public STUN)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Track rooms per IP
const roomsPerIp = new Map();

function getClientIp(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || socket.handshake.address 
    || 'unknown';
}

function createPeerSignalServer(httpServer, options = {}) {
  const io = new Server(httpServer, {
    cors: options.cors || { origin: '*' },
    maxHttpBufferSize: CONFIG.maxPayloadSize,
  });

  // Connection rate limiting middleware
  io.use((socket, next) => {
    const ip = getClientIp(socket);
    
    if (!connectionLimiter.isAllowed(ip)) {
      console.log(`[rate-limit] Connection rejected for IP: ${ip}`);
      return next(new Error('Too many connections. Please try again later.'));
    }
    
    socket.clientIp = ip;
    next();
  });

  io.on('connection', (socket) => {
    const ip = socket.clientIp;
    console.log(`[connect] ${socket.id} from ${ip}`);
    incrementStat('totalConnections');
    logActivity('connect', `Socket ${socket.id.slice(0, 8)}... from ${ip}`);

    // Idle timeout
    let idleTimer = setTimeout(() => {
      console.log(`[idle] Disconnecting idle socket: ${socket.id}`);
      socket.disconnect(true);
    }, CONFIG.idleTimeoutMs);

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log(`[idle] Disconnecting idle socket: ${socket.id}`);
        socket.disconnect(true);
      }, CONFIG.idleTimeoutMs);
    };

    // Create RAWR peer for this socket
    const transport = new EventEmitter();
    transport.send = (msg) => {
      socket.emit('rpc', typeof msg === 'string' ? msg : JSON.stringify(msg));
    };

    const methods = {
      // Create a new room (become host)
      createRoom: () => {
        resetIdleTimer();
        
        // Rate limit room creation
        if (!roomCreationLimiter.isAllowed(ip)) {
          return { error: 'Too many rooms created. Please try again later.' };
        }

        // Check max rooms per IP
        const ipRoomCount = roomsPerIp.get(ip) || 0;
        if (ipRoomCount >= CONFIG.maxRoomsPerIp) {
          return { error: `Maximum ${CONFIG.maxRoomsPerIp} rooms per IP reached.` };
        }

        const result = rooms.createRoom(socket);
        roomsPerIp.set(ip, ipRoomCount + 1);
        incrementStat('totalRoomsCreated');
        logActivity('room:create', `Room ${result.code} created by ${ip}`);
        
        return { ...result, iceServers: ICE_SERVERS };
      },

      // Join existing room with code
      joinRoom: ({ code, name }) => {
        resetIdleTimer();
        
        // Rate limit join attempts
        if (!joinLimiter.isAllowed(ip)) {
          return { error: 'Too many join attempts. Please try again later.' };
        }

        const normalized = normalizeCode(code);
        if (!validateCode(normalized)) {
          return { error: 'Invalid code format' };
        }

        // Check pending limit
        const room = rooms.getRoom(normalized);
        if (room && room.pendingPeers.size >= CONFIG.maxPendingPerRoom) {
          return { error: 'Room has too many pending requests. Please try again later.' };
        }

        const result = rooms.joinRoom(socket, normalized, name || 'Anonymous');
        if (result.success) {
          incrementStat('totalJoinRequests');
          logActivity('room:join', `${name || 'Anonymous'} joining ${normalized}`);
          return { ...result, iceServers: ICE_SERVERS };
        }
        return result;
      },

      // Rejoin a room after disconnect
      rejoinRoom: ({ code, isHost, name }) => {
        resetIdleTimer();
        const normalized = normalizeCode(code);
        return rooms.rejoinRoom(socket, normalized, isHost, name || 'Anonymous');
      },

      // Host approves/denies a peer
      approvePeer: ({ peerId, approved }) => {
        resetIdleTimer();
        const result = rooms.approvePeer(socket, peerId, approved !== false);
        if (result.success) {
          logActivity('peer:approve', `Peer ${peerId.slice(0, 8)}... ${approved !== false ? 'approved' : 'denied'}`);
        }
        return result;
      },

      // Send WebRTC signaling data
      signal: ({ to, payload }) => {
        resetIdleTimer();
        
        // Rate limit signaling
        if (!signalLimiter.isAllowed(socket.id)) {
          return { error: 'Too many signals. Please slow down.' };
        }

        // Validate payload size
        const payloadSize = JSON.stringify(payload).length;
        if (payloadSize > CONFIG.maxPayloadSize) {
          return { error: 'Payload too large.' };
        }

        return rooms.signal(socket, to, payload);
      },

      // Get ICE servers
      getIceServers: () => {
        return { iceServers: ICE_SERVERS };
      }
    };

    const _peer = rawr({ transport, methods, timeout: 10000 });

    socket.on('rpc', (msg) => {
      try {
        const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
        transport.emit('rpc', data);
      } catch (e) {
        console.error('[rpc] parse error:', e);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[disconnect] ${socket.id}`);
      clearTimeout(idleTimer);
      logActivity('disconnect', `Socket ${socket.id.slice(0, 8)}...`);
      
      // Update room count for IP
      const roomInfo = rooms.getRoomBySocket(socket);
      if (roomInfo?.isHost) {
        const count = roomsPerIp.get(ip) || 1;
        if (count <= 1) {
          roomsPerIp.delete(ip);
        } else {
          roomsPerIp.set(ip, count - 1);
        }
      }
      
      rooms.handleDisconnect(socket);
    });
  });

  return io;
}

// HTTP server with static file serving
const httpServer = createServer((req, res) => {
  // Handle admin routes first
  if (handleAdminRequest(req, res)) {
    return;
  }

  if (req.url === '/peersignal.js' || req.url === '/peersignal-client.js') {
    const clientPath = join(__dirname, '..', 'dist', 'peersignal-client.js');
    if (existsSync(clientPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(readFileSync(clientPath));
    } else {
      res.writeHead(404);
      res.end('Client not built. Run: npm run build:client');
    }
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>PeerSignal Server</title></head>
        <body>
          <h1>🔗 PeerSignal Server</h1>
          <p>WebRTC signaling server running.</p>
          <p>Client library: <a href="/peersignal.js">/peersignal.js</a></p>
          ${isAdminEnabled() ? '<p>Admin dashboard: <a href="/admin">/admin</a></p>' : ''}
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const _io = createPeerSignalServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🔗 PeerSignal server running on http://localhost:${PORT}`);
  console.log(`   Max pending per room: ${CONFIG.maxPendingPerRoom}`);
  console.log(`   Max rooms per IP: ${CONFIG.maxRoomsPerIp}`);
  console.log(`   Idle timeout: ${CONFIG.idleTimeoutMs / 1000}s`);
  if (isAdminEnabled()) {
    console.log(`   Admin dashboard: http://localhost:${PORT}/admin`);
  }
});

export { createPeerSignalServer };
