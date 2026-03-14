// backend/src/routes/xbox.js
import { XboxDiscoveryService } from '../services/discovery.js';
import { xboxController } from '../controllers/xbox.js';

const discoveryService = new XboxDiscoveryService();

export async function xboxRoutes(fastify, { io, rooms }) {
  
  // 发现 Xbox 主机
  fastify.get('/api/xbox/discover', async (request, reply) => {
    try {
      const consoles = await discoveryService.discover_and_check(5);
      return { success: true, consoles };
    } catch (error) {
      fastify.log.error(error);
      return { success: false, error: error.message };
    }
  });

  // 获取特定主机状态
  fastify.get('/api/xbox/:ip/status', async (request, reply) => {
    const { ip } = request.params;
    try {
      const status = await discoveryService. ssdp.get_device_info(ip);
      return { success: true, status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取所有房间列表
  fastify.get('/api/rooms', async (request, reply) => {
    const roomList = [];
    for (const [roomId, room] of rooms.entries()) {
      roomList.push({
        roomId,
        host: room.host,
        viewerCount: room.viewers.size,
        streamActive: room. streamActive,
        xboxIp: room.xboxIp
      });
    }
    return { success: true, rooms: roomList };
  });

  // 获取特定房间信息
  fastify.get('/api/rooms/:roomId', async (request, reply) => {
    const { roomId } = request.params;
    const room = rooms.get(roomId);
    
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    return {
      success: true,
      room: {
        roomId,
        host: room.host,
        viewerCount: room.viewers.size,
        viewers: Array.from(room.viewers),
        streamActive: room.streamActive,
        xboxIp: room.xboxIp
      }
    };
  });

  // Xbox 控制 API (转发给主机)
  fastify.post('/api/xbox/:roomId/command', async (request, reply) => {
    const { roomId } = request.params;
    const { command } = request.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    // 通过 Socket. io 转发命令给主机
    io. to(room.host).emit('xbox-command', command);
    
    return { success: true };
  });

  // WebRTC 信令端点 (备用 HTTP 接口)
  fastify.post('/api/signaling/offer', async (request, reply) => {
    const { roomId, sdp } = request.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    // 转发给房间内的其他人
    io. to(roomId).emit('offer', { from: 'server', sdp });
    
    return { success: true };
  });
}