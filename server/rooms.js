import { generateCode } from './codes.js';

// Room structure:
// {
//   code: 'xxx-xxx-xxx',
//   hostSocket: socket,
//   hostId: string,
//   pendingPeers: Map<peerId, { socket, name }>,
//   approvedPeers: Map<peerId, { socket, name }>,
//   createdAt: timestamp
// }

const rooms = new Map();
const socketToRoom = new Map(); // socket.id -> { code, isHost }

export function createRoom(socket) {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));
  
  const room = {
    code,
    hostSocket: socket,
    hostId: socket.id,
    pendingPeers: new Map(),
    approvedPeers: new Map(),
    createdAt: Date.now()
  };
  
  rooms.set(code, room);
  socketToRoom.set(socket.id, { code, isHost: true });
  socket.join(code);
  
  return { code };
}

export function joinRoom(socket, code, name) {
  const room = rooms.get(code);
  if (!room) {
    return { error: 'Room not found' };
  }
  
  const peerId = socket.id;
  room.pendingPeers.set(peerId, { socket, name });
  socketToRoom.set(socket.id, { code, isHost: false, peerId });
  socket.join(code);
  
  // Notify host
  room.hostSocket.emit('peer:request', { peerId, name });
  
  return { 
    success: true, 
    peerId,
    hostConnected: room.hostSocket.connected 
  };
}

export function approvePeer(hostSocket, peerId, approved) {
  const roomInfo = socketToRoom.get(hostSocket.id);
  if (!roomInfo || !roomInfo.isHost) {
    return { error: 'Not a host' };
  }
  
  const room = rooms.get(roomInfo.code);
  if (!room) {
    return { error: 'Room not found' };
  }
  
  const pending = room.pendingPeers.get(peerId);
  if (!pending) {
    return { error: 'Peer not found in pending' };
  }
  
  room.pendingPeers.delete(peerId);
  
  if (approved) {
    room.approvedPeers.set(peerId, pending);
    pending.socket.emit('peer:approved', { hostId: room.hostId });
    return { success: true };
  } else {
    pending.socket.emit('peer:denied', {});
    socketToRoom.delete(pending.socket.id);
    pending.socket.leave(roomInfo.code);
    return { success: true, denied: true };
  }
}

export function signal(fromSocket, toId, payload) {
  const roomInfo = socketToRoom.get(fromSocket.id);
  if (!roomInfo) {
    return { error: 'Not in a room' };
  }
  
  const room = rooms.get(roomInfo.code);
  if (!room) {
    return { error: 'Room not found' };
  }
  
  // Verify sender is host or approved peer
  const isHost = room.hostId === fromSocket.id;
  const isApproved = room.approvedPeers.has(fromSocket.id);
  
  if (!isHost && !isApproved) {
    return { error: 'Not authorized to signal' };
  }
  
  // Find target socket
  let targetSocket;
  if (toId === room.hostId) {
    targetSocket = room.hostSocket;
  } else {
    const peer = room.approvedPeers.get(toId);
    if (peer) targetSocket = peer.socket;
  }
  
  if (!targetSocket) {
    return { error: 'Target not found' };
  }
  
  targetSocket.emit('signal', { from: fromSocket.id, payload });
  return { success: true };
}

export function handleDisconnect(socket) {
  const roomInfo = socketToRoom.get(socket.id);
  if (!roomInfo) return;
  
  const room = rooms.get(roomInfo.code);
  if (!room) return;
  
  if (roomInfo.isHost) {
    // Host disconnected - notify all peers and clean up
    for (const [peerId, peer] of room.approvedPeers) {
      peer.socket.emit('host:disconnected', {});
      socketToRoom.delete(peerId);
    }
    for (const [peerId, peer] of room.pendingPeers) {
      peer.socket.emit('host:disconnected', {});
      socketToRoom.delete(peerId);
    }
    rooms.delete(roomInfo.code);
  } else {
    // Peer disconnected - notify host
    room.pendingPeers.delete(socket.id);
    room.approvedPeers.delete(socket.id);
    room.hostSocket.emit('peer:disconnected', { peerId: socket.id });
  }
  
  socketToRoom.delete(socket.id);
}

export function rejoinRoom(socket, code, isHost, name) {
  const room = rooms.get(code);
  if (!room) {
    return { error: 'Room not found' };
  }
  
  if (isHost) {
    // Reconnecting host
    room.hostSocket = socket;
    room.hostId = socket.id;
    socketToRoom.set(socket.id, { code, isHost: true });
    socket.join(code);
    
    // Notify peers host is back
    for (const [_peerId, peer] of room.approvedPeers) {
      peer.socket.emit('host:reconnected', { hostId: socket.id });
    }
    
    return { 
      success: true, 
      code,
      peers: Array.from(room.approvedPeers.entries()).map(([id, p]) => ({ id, name: p.name }))
    };
  } else {
    // Reconnecting peer - need approval again
    return joinRoom(socket, code, name);
  }
}

export function getRoom(code) {
  return rooms.get(code);
}

export function getRoomBySocket(socket) {
  const info = socketToRoom.get(socket.id);
  return info ? { room: rooms.get(info.code), ...info } : null;
}
