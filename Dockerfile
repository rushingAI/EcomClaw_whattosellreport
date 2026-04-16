# EcomClaw backend: FastAPI + Crawlee/Playwright (from clawd-crawlee base image).
# Railway / 生产环境：同一镜像内用 node 跑爬虫，无需 Docker-in-Docker。
#
# 本地构建（Apple Silicon 部署到 Railway 时建议指定平台）:
#   docker build --platform linux/amd64 -t ecomclaw-api .
#   docker run --rm -p 8000:8000 -e ANTHROPIC_API_KEY=... ecomclaw-api
#
# 本地继续用「宿主机 docker run clawd-crawlee」调试：不要设置 ECOMCLAW_USE_NODE_SCRAPER，
# 或显式 ECOMCLAW_USE_NODE_SCRAPER=0（见 scraper.py）。

FROM clawd-crawlee

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 使用项目内 patched handler（与本地 docker -v 挂载等价）
COPY backend/amazon_handler_patched.js /usr/src/app/assets/amazon_handler.js

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt

RUN python3 -m venv /opt/ecomclaw \
    && /opt/ecomclaw/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/ecomclaw/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/opt/ecomclaw/bin:${PATH}"
ENV ECOMCLAW_USE_NODE_SCRAPER=1
ENV ECOMCLAW_SCRAPER_NODE_CWD=/usr/src/app

COPY backend/ ./

# 父镜像可能带有 xvfb entrypoint，避免影响 uvicorn
ENTRYPOINT []

EXPOSE 8000

# Railway 注入 PORT；本地默认 8000
CMD ["/bin/sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
