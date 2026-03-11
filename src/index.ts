import Fastify from 'fastify'
import cors from '@fastify/cors'
import { xboxRoutes } from './controllers/xboxController.js'
import { webrtcRoutes } from './controllers/webrtcController.js'

const fastify = Fastify({
  logger: true,
})

// 注册CORS
await fastify.register(cors, {
  origin: true,
  credentials: true,
})

// 注册路由
fastify.register(xboxRoutes, { prefix: '/api/xbox' })
fastify.register(webrtcRoutes, { prefix: '/api/webrtc' })

// 健康检查
fastify.get('/api/health', async () => ({ status: 'ok', timestamp: Date.now() }))

// 启动服务
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' })
    console.log('Server running at http://localhost:3001')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()