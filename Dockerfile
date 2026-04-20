# EcomClawwhattosellReport — 生产镜像（Railway / Linux 服务器）
#
# 此 Dockerfile 将 Crawlee/Playwright 爬虫与 FastAPI 后端合并为单一镜像，
# 无需 Docker-in-Docker，适用于 Railway 等无 Docker Socket 的平台。
#
# 本地构建测试：
#   docker build --platform linux/amd64 -t ecomclawwhattosellreport-api .
#   docker run --rm -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... ecomclawwhattosellreport-api
#
# 本地 Mac 开发（继续用 docker run 模式）：
#   docker build -t clawd-crawlee ./crawlee/
#   cd backend && python3 -m uvicorn main:app --reload --port 8000

# ── Stage 1: Crawlee/Playwright 层（基于 Apify 公开镜像）────────────────────
FROM apify/actor-node-playwright-chrome:20 AS crawlee-base

WORKDIR /usr/src/app
COPY crawlee/package.json ./package.json
RUN npm install --include=dev

# ── Stage 2: 最终镜像（合并 Crawlee + Python/FastAPI）──────────────────────
FROM apify/actor-node-playwright-chrome:20

# 复制已安装好依赖的 node_modules
COPY --from=crawlee-base /usr/src/app/node_modules /usr/src/app/node_modules

# 放入 patched handler（覆盖掉任何默认 handler）
COPY backend/amazon_handler_patched.js /usr/src/app/assets/amazon_handler.js

# 安装 Python（Apify 基础镜像是 Debian，有 apt）
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN python3 -m venv /opt/ecomclawwhattosellreport \
    && /opt/ecomclawwhattosellreport/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/ecomclawwhattosellreport/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/opt/ecomclawwhattosellreport/bin:${PATH}"

# 告诉 scraper.py 使用 node 内联模式（无需 docker socket）
ENV ECOMCLAW_USE_NODE_SCRAPER=1
ENV ECOMCLAW_SCRAPER_NODE_CWD=/usr/src/app

# 复制后端代码
COPY backend/ .

# 清除父镜像的 entrypoint，直接用 uvicorn
ENTRYPOINT []

EXPOSE 8000

# Railway 会注入 PORT 环境变量；本地默认 8000
CMD ["/bin/sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
