# peersignal-server

Simple WebRTC signaling server with code-based P2P pairing.

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

1. **Host** creates room → gets code like `k7m-p2x-9nf`
2. **Host** shares code out-of-band (text, DM, etc.)
3. **Peer** joins with code + name
4. **Host** approves/denies peer
5. **WebRTC** P2P connection established

```
┌─────────┐                     ┌─────────┐
│  Host   │◄── P2P DataChannel ─►│  Peer   │
└────┬────┘                     └────┬────┘
     │                               │
     └───── Signaling via Server ────┘
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

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | 3000 | Server port |
| `MAX_PENDING_PER_ROOM` | 10 | Max pending join requests per room |
| `MAX_ROOMS_PER_IP` | 5 | Max rooms one IP can create |
| `IDLE_TIMEOUT_MS` | 300000 | Disconnect idle sockets (5 min) |
| `MAX_PAYLOAD_SIZE` | 16384 | Max signaling payload size (16KB) |

## Client

The server serves the client library at `/peersignal.js`.

Or install separately: [peersignal](https://github.com/monteslu/peersignal)

## License

MIT
