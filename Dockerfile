FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 构建
COPY tsconfig.json ./
RUN npm run build || true

# 复制源码
COPY src ./src
COPY prisma ./prisma

# 生成Prisma客户端
RUN npx prisma generate

# 暴露端口
EXPOSE 3001

CMD ["npm", "start"]