# Xbox Teams Backend

> Xbox云游戏平台 - 后端API服务

## 技术栈

- Node.js 20 + TypeScript
- Fastify (Web框架)
- Prisma (ORM)
- PostgreSQL / SQLite
- WebSocket (实时通信)

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 环境变量

```env
DATABASE_URL=file:./data/ xbox-teams.db
NODE_ENV=development
PORT=3001
```

## API端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/xbox/hosts | 获取主机列表 |
| POST | /api/xbox/hosts | 添加主机 |
| POST | /api/xbox/hosts/:id/connect | 连接主机 |
| POST | /api/xbox/hosts/:id/disconnect | 断开主机 |

## 端口

- API: http://localhost:3001

## 相关项目

- [xbox-teams-frontend](https://github.com/your-team/xbox-teams-frontend) - 前端应用
- [xbox-teams-automation](https://github.com/your-team/xbox-teams-automation) - 自动化脚本