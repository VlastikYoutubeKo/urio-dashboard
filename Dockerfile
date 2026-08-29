# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    INSTANCE_DIR=/data/instance \
    DATABASE_URL=sqlite:////data/transfer_stats.db \
    URIO_ENV_FILE=/data/.env
WORKDIR /app

RUN groupadd --system urio && useradd --system --gid urio --create-home urio
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY main.py ./
COPY --from=frontend-build /build/frontend/dist ./frontend/dist/

RUN mkdir -p /data && chown -R urio:urio /app /data
USER urio
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).read()"

# The in-process scheduler requires exactly one enabled web worker. Run extra
# web workers with RUN_SCHEDULER=false, or put scheduling in a separate service.
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-", "main:app"]
