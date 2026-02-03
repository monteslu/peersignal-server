import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import rawr from 'rawr';
import { EventEmitter } from 'events';

import * as rooms from './rooms.js';
import { normalizeCode, validateCode } from './codes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// STUN servers (Google's public STUN)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

function createPeerSignalServer(httpServer, options = {}) {
  const io = new Server(httpServer, {
    cors: options.cors || { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log(`[connect] ${socket.id}`);

    // Create RAWR peer for this socket
    const transport = new EventEmitter();
    transport.send = (msg) => {
      socket.emit('rpc', typeof msg === 'string' ? msg : JSON.stringify(msg));
    };

    const methods = {
      // Create a new room (become host)
      createRoom: () => {
        const result = rooms.createRoom(socket);
        return { ...result, iceServers: ICE_SERVERS };
      },

      // Join existing room with code
      joinRoom: ({ code, name }) => {
        const normalized = normalizeCode(code);
        if (!validateCode(normalized)) {
          return { error: 'Invalid code format' };
        }
        const result = rooms.joinRoom(socket, normalized, name || 'Anonymous');
        if (result.success) {
          return { ...result, iceServers: ICE_SERVERS };
        }
        return result;
      },

      // Rejoin a room after disconnect
      rejoinRoom: ({ code, isHost, name }) => {
        const normalized = normalizeCode(code);
        return rooms.rejoinRoom(socket, normalized, isHost, name || 'Anonymous');
      },

      // Host approves/denies a peer
      approvePeer: ({ peerId, approved }) => {
        return rooms.approvePeer(socket, peerId, approved !== false);
      },

      // Send WebRTC signaling data
      signal: ({ to, payload }) => {
        return rooms.signal(socket, to, payload);
      },

      // Get ICE servers
      getIceServers: () => {
        return { iceServers: ICE_SERVERS };
      }
    };

    const peer = rawr({ transport, methods, timeout: 10000 });

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
      rooms.handleDisconnect(socket);
    });
  });

  return io;
}

// HTTP server with static file serving
const httpServer = createServer((req, res) => {
  if (req.url === '/peersignal-client.js') {
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
          <p>Client library: <a href="/peersignal-client.js">/peersignal-client.js</a></p>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const io = createPeerSignalServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🔗 PeerSignal server running on http://localhost:${PORT}`);
});

export { createPeerSignalServer };
