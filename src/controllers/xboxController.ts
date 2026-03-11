import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Xbox主机类型
interface XboxHost {
  id: string
  name: string
  ipAddress: string
  macAddress?: string
  status: 'online' | 'offline' | 'in_use' | 'error'
  currentUser?: string | null
  createdAt: Date
  updatedAt: Date
}

export async function xboxRoutes(fastify: FastifyInstance) {
  // 获取所有Xbox主机
  fastify.get<{ Reply: XboxHost[] }>('/hosts', async (req, reply) => {
    try {
      const hosts = await prisma.xboxHost.findMany()
      return hosts
    } catch (error) {
      // 如果数据库未初始化，返回空数组
      return []
    }
  })

  // 添加Xbox主机
  fastify.post<{ Body: { name: string; ipAddress: string; macAddress?: string } }>(
    '/hosts',
    async (req, reply) => {
      const { name, ipAddress, macAddress } = req.body
      try {
        const host = await prisma.xboxHost.create({
          data: { name, ipAddress, macAddress, status: 'offline' },
        })
        return host
      } catch (error) {
        reply.code(500).send({ error: 'Failed to create host' })
      }
    }
  )

  // 更新Xbox主机
  fastify.patch<{ Params: { id: string }; Body: Partial<XboxHost> }>(
    '/hosts/:id',
    async (req, reply) => {
      const { id } = req.params
      const data = req.body
      try {
        const host = await prisma.xboxHost.update({
          where: { id },
          data,
        })
        return host
      } catch (error) {
        reply.code(404).send({ error: 'Host not found' })
      }
    }
  )

  // 删除Xbox主机
  fastify.delete<{ Params: { id: string } }>('/hosts/:id', async (req, reply) => {
    const { id } = req.params
    try {
      await prisma.xboxHost.delete({ where: { id } })
      return { success: true }
    } catch (error) {
      reply.code(404).send({ error: 'Host not found' })
    }
  })

  // 连接Xbox主机（创建会话）
  fastify.post<{ Params: { id: string }; Body: { userId?: string } }>(
    '/hosts/:id/connect',
    async (req, reply) => {
      const { id } = req.params
      const { userId = 'guest' } = req.body
      
      try {
        // 更新主机状态为使用中
        const host = await prisma.xboxHost.update({
          where: { id },
          data: { status: 'in_use', currentUser: userId },
        })
        
        // 创建游戏会话
        const session = await prisma.session.create({
          data: {
            userId,
            xboxHostId: id,
            status: 'active',
          },
        })
        
        return { host, session }
      } catch (error) {
        reply.code(500).send({ error: 'Failed to connect to host' })
      }
    }
  )

  // 断开Xbox主机
  fastify.post<{ Params: { id: string } }>('/hosts/:id/disconnect', async (req, reply) => {
    const { id } = req.params
    try {
      // 查找当前活跃会话
      const activeSession = await prisma.session.findFirst({
        where: { xboxHostId: id, status: 'active' },
      })
      
      if (activeSession) {
        await prisma.session.update({
          where: { id: activeSession.id },
          data: { status: 'ended', endTime: new Date() },
        })
      }
      
      // 更新主机状态为在线
      const host = await prisma.xboxHost.update({
        where: { id },
        data: { status: 'online', currentUser: null },
      })
      
      return host
    } catch (error) {
      reply.code(500).send({ error: 'Failed to disconnect from host' })
    }
  })

  // 扫描局域网Xbox主机
  fastify.post('/hosts/scan', async (req, reply) => {
    // TODO: 实现局域网Xbox主机发现
    // 使用 mDNS/SSDP 或 Xbox Live API
    return { hosts: [], message: 'Scan not implemented yet' }
  })
}