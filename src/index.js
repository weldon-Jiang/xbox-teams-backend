import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import { xboxRoutes } from './routes/xbox.js';
import { signalingHandler } from './handlers/signaling.js';

dotenv.config();

const fastify = Fastify({
  logger: true
});

// 注册插件
await fastify.register(cors, { 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
});

await fastify.register(websocket);

// 启动 Socket.io
const io = new Server(fastify.server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 房间管理
const rooms = new Map(); // roomId -> { host, viewers: Set, streamActive: boolean }

// Socket.io 事件处理
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // 创建/加入房间
  socket.on('create-room', (callback) => {
    const roomId = uuidv4();
    rooms.set(roomId, {
      host: socket.id,
      viewers: new Set(),
      streamActive: false,
      xboxIp: null
    });
    socket.join(roomId);
    callback({ roomId });
  });

  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }
    
    room.viewers.add(socket.id);
    socket.join(roomId);
    
    // 通知主机有新观众
    socket.to(roomId).emit('viewer-joined', socket.id);
    callback({ success: true, hasStream: room.streamActive });
  });

  // 信令处理
  socket.on('signal', ({ roomId, targetId, data }) => {
    io.to(targetId).emit('signal', {
      from: socket.id,
      data
    });
  });

  // 主机开始推流
  socket.on('stream-started', ({ roomId, xboxIp }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.streamActive = true;
      room.xboxIp = xboxIp;
      socket.to(roomId).emit('stream-status', { active: true });
    }
  });

  // 主机停止推流
  socket.on('stream-stopped', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.streamActive = false;
      socket.to(roomId).emit('stream-status', { active: false });
    }
  });

  // Xbox 控制命令
  socket.on('xbox-command', ({ roomId, command }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id) {
      // 转发给所有观众（用于同步状态）
      socket.to(roomId).emit('xbox-command', command);
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // 清理房间
    for (const [roomId, room] of rooms.entries()) {
      if (room.host === socket.id) {
        // 主机离开，通知所有观众
        io.to(roomId).emit('host-disconnected');
        rooms.delete(roomId);
      } else if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        io.to(roomId).emit('viewer-left', socket.id);
      }
    }
  });
});

// 注册 API 路由
fastify.register(xboxRoutes, { io, rooms });

// 健康检查
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// 启动服务器
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();