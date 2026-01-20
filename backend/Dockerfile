# TODO Start: [Student] Complete Dockerfile
# TODO Start: [Student] Complete Dockerfile
# 使用 Python 3.11 作为基础镜像
FROM python:3.11

# 设置 DEPLOY 环境变量为 1
ENV DEPLOY=1

# 设置工作目录为 /app
WORKDIR /app

# 复制 requirements.txt 文件到工作目录
COPY requirements.txt .

# 安装依赖并使用 SECoder 镜像源加速下载
RUN pip install -r requirements.txt -i https://pypi-cache-sepi.app.secoder.net/simple

# 将源代码复制到工作目录
COPY . .

# 对外暴露 80 端口
EXPOSE 80

# 容器运行时执行 start.sh 脚本
CMD ["sh", "start.sh"]
# TODO End: [Student] Complete Dockerfile
# TODO End: [Student] Complete Dockerfile
