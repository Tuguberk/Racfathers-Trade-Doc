# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm ci --only=development --legacy-peer-deps

# Copy source code and configuration
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma


# Generate Prisma client and build the application
RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set production environment
ENV NODE_ENV=production

# Install wget for health checks
RUN apk add --no-cache wget

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application with proper migration handling
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

