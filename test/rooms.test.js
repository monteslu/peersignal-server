import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket
function createMockSocket(id) {
  return {
    id,
    connected: true,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn()
  };
}

// Import after mocking
const rooms = await import('../server/rooms.js');

describe('rooms', () => {
  beforeEach(() => {
    // Reset module state between tests - reimport if needed
  });

  describe('createRoom', () => {
    it('should create room and return code', () => {
      const socket = createMockSocket('host-123');
      const result = rooms.createRoom(socket);
      
      expect(result.code).toMatch(/^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/);
      expect(socket.join).toHaveBeenCalledWith(result.code);
    });
  });

  describe('joinRoom', () => {
    it('should return error for non-existent room', () => {
      const socket = createMockSocket('peer-456');
      const result = rooms.joinRoom(socket, 'xxx-xxx-xxx', 'TestPeer');
      
      expect(result.error).toBe('Room not found');
    });

    it('should join existing room and notify host', () => {
      const hostSocket = createMockSocket('host-123');
      const peerSocket = createMockSocket('peer-456');
      
      const { code } = rooms.createRoom(hostSocket);
      const result = rooms.joinRoom(peerSocket, code, 'TestPeer');
      
      expect(result.success).toBe(true);
      expect(result.peerId).toBe('peer-456');
      expect(hostSocket.emit).toHaveBeenCalledWith('peer:request', {
        peerId: 'peer-456',
        name: 'TestPeer'
      });
    });
  });
});
