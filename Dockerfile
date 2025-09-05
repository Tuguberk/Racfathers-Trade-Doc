# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./
RUN npm install --legacy-peer-deps || npm install
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
COPY data ./data
RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./package.json

# Expect DATABASE_URL, REDIS_URL, OPENROUTER_API_KEY, AES_ENCRYPTION_KEY, etc.
CMD ["sh", "-c", "node -e 'try{require(\"@prisma/client\")}catch(e){}' && npx prisma migrate deploy && node dist/index.js"]

