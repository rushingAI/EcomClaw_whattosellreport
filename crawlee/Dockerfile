# clawd-crawlee 本地构建用 Dockerfile
# 在另一台 Mac 上克隆仓库后执行：
#   docker build -t clawd-crawlee ./crawlee/
# 之后本地开发与原来完全一样（scraper.py 会自动走 docker run clawd-crawlee）

FROM apify/actor-node-playwright-chrome:20

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install --include=dev

# handler 在 scraper.py 运行时通过 -v 挂载，无需在镜像里预置
CMD ["node", "assets/amazon_handler.js"]
