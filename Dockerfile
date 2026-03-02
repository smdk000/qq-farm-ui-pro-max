# 第一阶段：构建前端并且做一些运行前准备
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

COPY package*.json pnpm-*-* ./
COPY pnpm-workspace.yaml ./
COPY core/package.json core/
COPY web/package.json web/

RUN pnpm install

# 复制全部文件（.dockerignore 将屏蔽无关文件如 .git 或直接依赖）
COPY . .

# 构建前端
RUN cd web && pnpm build || echo "Web build skipped"

# 第二阶段：最终生产镜像
FROM node:22-alpine

# 安装必要的系统级软件（时区），多架构兼容
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY package*.json pnpm-*-* ./
COPY pnpm-workspace.yaml ./
COPY core/package.json core/
COPY web/package.json web/

RUN npm install -g pnpm && pnpm install --prod

# 从 builder 抓取全部已构建好的应用文件
COPY --from=builder /app/core ./core
COPY --from=builder /app/web ./web
COPY --from=builder /app/package.json ./

EXPOSE 3000

# 设定健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/sys/config || exit 1

# 启动应用程序 (调用 /core/client.js 作为最新入口)
CMD ["pnpm", "start"]
