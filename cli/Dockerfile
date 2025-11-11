FROM node:18-alpine

WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    curl \
    bash \
    jq

# 创建非root用户
RUN addgroup -g 1001 -S cli && \
    adduser -S cli -u 1001

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production && npm cache clean --force

# 复制源代码
COPY . .

# 创建历史目录
RUN mkdir -p /app/history && \
    chown -R cli:cli /app

# 切换到非root用户
USER cli

# 设置环境变量
ENV NODE_ENV=production

# 默认命令
CMD ["npm", "start"]