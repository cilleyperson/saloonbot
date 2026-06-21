# Saloon Bot - Docker Image
# Multi-stage build for optimized production image
#
# Base image is glibc (Debian bookworm-slim), NOT Alpine/musl: onnxruntime-node
# only ships glibc prebuilts, so object detection cannot load on musl. sharp,
# better-sqlite3, and bcrypt all have glibc builds too.

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:24-bookworm-slim AS builder

# Install build dependencies for native modules (better-sqlite3, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:24-bookworm-slim AS production

# Install build deps for the production native module rebuild
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 botuser && \
    useradd -r -u 1001 -g botuser botuser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy application code from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/index.js ./

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs && \
    chown -R botuser:botuser /app

# Switch to non-root user
USER botuser

# Expose web server port
EXPOSE 3000

# Health check - hits the unauthenticated /healthz liveness route on the
# configured HTTP port (PORT, default 3000), not GET / which is behind auth
# and 302-redirects to /auth/login (false "unhealthy").
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;require('http').get('http://127.0.0.1:'+p+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

# Default command
CMD ["node", "index.js"]
