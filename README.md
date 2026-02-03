# peersignal-server

[![npm version](https://img.shields.io/npm/v/peersignal-server.svg)](https://www.npmjs.com/package/peersignal-server)
[![CI](https://github.com/monteslu/peersignal-server/actions/workflows/ci.yml/badge.svg)](https://github.com/monteslu/peersignal-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Simple WebRTC signaling server with code-based P2P pairing. Works with the [peersignal](https://github.com/monteslu/peersignal) client.

## Install

```bash
npm install peersignal-server
```

## Usage

```bash
npx peersignal-server
# Server running on http://localhost:3000
```

Or programmatically:

```js
import { createServer } from 'http';
import { createPeerSignalServer } from 'peersignal-server';

const httpServer = createServer();
const io = createPeerSignalServer(httpServer);

httpServer.listen(3000);
```

## How It Works

1. **Peer A** creates room → gets code like `k7m-p2x-9nf`
2. **Peer A** shares code out-of-band (text, DM, etc.)
3. **Peer B** joins with code
4. **WebRTC** P2P connection established (auto-approved by default)

```
┌──────────┐                      ┌──────────┐
│  Peer A  │◄── P2P DataChannel ──►│  Peer B  │
└────┬─────┘                      └────┬─────┘
     │                                  │
     └───── Signaling via Server ───────┘
```

The server only helps establish the connection - all data flows directly between peers.

## CORS

CORS is enabled by default (`origin: '*'`). Override via options:

```js
createPeerSignalServer(httpServer, {
  cors: { origin: 'https://yourdomain.com' }
});
```

## Code Format

- 9 characters: `xxx-xxx-xxx`
- Safe charset: `a-z` (no i,l,o) + `2-9` (no 0,1)
- Case-insensitive

## DDoS Protection

Built-in rate limiting and abuse prevention:

| Protection | Default | Env Var |
|------------|---------|---------|
| Connections per IP | 20/min | - |
| Room creation per IP | 5/min | - |
| Join attempts per IP | 30/min | - |
| Signals per socket | 50/sec | - |
| Max pending peers/room | 10 | `MAX_PENDING_PER_ROOM` |
| Max rooms per IP | 5 | `MAX_ROOMS_PER_IP` |
| Idle timeout | 5 min | `IDLE_TIMEOUT_MS` |
| Max payload size | 16KB | `MAX_PAYLOAD_SIZE` |

## Admin Dashboard

Optional admin dashboard for monitoring server activity.

### Enabling

Set the `ADMIN_PASSWORD` environment variable:

```bash
ADMIN_PASSWORD=mysecretpassword npx peersignal-server
```

### Accessing

Navigate to `/admin` and authenticate with:
- **Username:** `admin`
- **Password:** Your `ADMIN_PASSWORD` value

### Features

- **Real-time stats:** Active rooms, connected peers, pending requests
- **Room list:** View all active rooms with their connection status
- **Activity log:** Recent connections, room creations, and peer approvals
- **JSON API:** `GET /admin/api/stats` for programmatic access
- **Auto-refresh:** Dashboard refreshes every 10 seconds

### Security Notes

- Dashboard is completely disabled if `ADMIN_PASSWORD` is not set
- Uses HTTP Basic Authentication
- Recommended: Use HTTPS in production
- Keep your admin password secure

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | 3000 | Server port |
| `ADMIN_PASSWORD` | - | Enable admin dashboard (disabled if not set) |
| `MAX_PENDING_PER_ROOM` | 10 | Max pending join requests per room |
| `MAX_ROOMS_PER_IP` | 5 | Max rooms one IP can create |
| `IDLE_TIMEOUT_MS` | 300000 | Disconnect idle sockets (5 min) |
| `MAX_PAYLOAD_SIZE` | 16384 | Max signaling payload size (16KB) |

## Client

Use the [peersignal](https://github.com/monteslu/peersignal) client:

```bash
npm install peersignal
```

Or via CDN:

```html
<script src="https://unpkg.com/peersignal"></script>
```

## License

MIT
