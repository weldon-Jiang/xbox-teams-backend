import { FastifyInstance } from 'fastify'

export async function webrtcRoutes(fastify: FastifyInstance) {
  // WebRTC信令端点
  // 实际生产环境建议使用专门的WebSocket服务处理
  
  fastify.get('/config', async () => {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // 生产环境需要配置TURN服务器
        // { urls: 'turn:your-turn-server.com:3478', username: 'xxx', credential: 'xxx' }
      ],
      sdpSemantics: 'unified-plan',
    }
  })

  fastify.post('/offer', async (req, reply) => {
    // 处理WebRTC offer
    const { sdp, hostId } = req.body as { sdp: string; hostId: string }
    // TODO: 转发给对应的Xbox主机
    return { message: 'Offer received' }
  })

  fastify.post('/answer', async (req, reply) => {
    // 处理WebRTC answer
    const { sdp, hostId } = req.body as { sdp: string; hostId: string }
    return { message: 'Answer received' }
  })

  fastify.post('/ice-candidate', async (req, reply) => {
    // 处理ICE候选
    const { candidate, hostId } = req.body as { candidate: object; hostId: string }
    return { message: 'ICE candidate received' }
  })
}