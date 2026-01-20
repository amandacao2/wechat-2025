# 第一阶段：构建阶段（保留前端仓库.docx 原有逻辑，仅修改构建命令适配 export 模式）
FROM node:22 AS builder
# 安装 pnpm（保留原有）
RUN npm install -g pnpm
# 设置工作目录（保留原有）
WORKDIR /app
# 复制包管理文件（保留原有）
COPY package.json pnpm-lock.yaml* ./
# 设置 pnpm 镜像源（保留原有）
RUN pnpm config set registry https://npm-cache-sepi.app.secoder.net/
# 安装依赖（保留原有）
RUN pnpm install --frozen-lockfile
# 复制源代码（保留原有）
COPY . .
# 关键修改：执行 next build（output: 'export' 模式会自动生成 out 目录）
RUN pnpm build

# 第二阶段：运行阶段（关键修改：复制 out 目录，使用静态文件服务）
FROM node:22-alpine
# 安装静态文件服务（新增，用于部署 export 模式生成的静态文件）
RUN npm install -g serve
# 设置工作目录（保留原有）
WORKDIR /app
# 关键修改：从 builder 阶段复制 out 目录（而非 standalone）
COPY --from=builder /app/out ./out
# 暴露 80 端口（保留原有）
EXPOSE 80
# 关键修改：使用 serve 启动静态文件服务，指向 out 目录
CMD ["serve", "-s", "out", "-l", "80"]