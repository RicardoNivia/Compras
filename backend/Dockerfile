# Imagen de producción del backend de Panel de Compras y Bienestar (Next.js API-only + Prisma/PostgreSQL).
# Build context: backend/ (docker build -f backend/Dockerfile backend)
FROM node:20-alpine AS base
# Prisma necesita OpenSSL en Alpine para elegir el query engine correcto.
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# El "postinstall" ejecuta "prisma generate", que necesita el schema.
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3001

# Aplica migraciones pendientes contra PostgreSQL (servicio "db" del stack)
# antes de arrancar — mismo patrón que el "prisma db push" del API de bienestar.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
