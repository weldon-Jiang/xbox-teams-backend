// backend/src/handlers/signaling. js
// WebRTC 信令处理逻辑

export function signalingHandler(io, rooms) {
  return {
    // 处理 SDP Offer
    handleOffer: (socket, { roomId, sdp }) => {
      const room = rooms.get(roomId);
      if (room) {
        socket.to(roomId).emit('offer', { from: socket.id, sdp });
      }
    },

    // 处理 SDP Answer
    handleAnswer: (socket, { roomId, sdp }) => {
      const room = rooms.get(roomId);
      if (room) {
        socket.to(roomId).emit('answer', { from: socket.id, sdp });
      }
    },

    // 处理 ICE Candidate
    handleIceCandidate: (socket, { roomId, candidate }) => {
      const room = rooms.get(roomId);
      if (room) {
        socket.to(roomId).emit('ice-candidate', { 
          from: socket.id, 
          candidate 
        });
      }
    },

    // 创建 WebRTC Peer 连接 (作为主机)
    createStreamerPeer: (socket, roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) {
        return null;
      }
      // 这里可以集成 simple-peer
      // 返回 peer 实例供外部调用
      return { initialized: true };
    },

    // 创建观看者 Peer 连接
    createViewerPeer: (socket, roomId) => {
      const room = rooms.get(roomId);
      if (!room) {
        return null;
      }
      return { initialized: true };
    }
  };
}