# Imagen de producción del frontend de Panel de Compras y Bienestar (Next.js).
# Build context: frontend/ (docker build -f frontend/Dockerfile frontend)
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# URL del backend embebida en el build (usada por next.config.js rewrites()).
ARG BACKEND_URL=http://localhost:3001
ENV BACKEND_URL=${BACKEND_URL}
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "start"]
