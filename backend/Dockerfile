# Imagen de producción del backend de Panel de Compras y Bienestar (Next.js API-only + Prisma/PostgreSQL).
# Build context: backend/ (docker build -f backend/Dockerfile backend)
# Node 22: pdfjs-dist 6 (lectura de extractos en PDF, lib/tesoreria/extractoPdf.js) exige Node >= 22.13; con Node 20
# el texto del PDF no se podía leer en producción.
FROM node:22-alpine AS base
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
# Tras las migraciones corre la carga inicial de Consumo (prisma/consumo-inicial/cargar.mjs): solo actúa la primera vez
# por versión de datos y, si falla, no impide que la app arranque.
CMD ["sh", "-c", "npx prisma migrate deploy && (node prisma/consumo-inicial/cargar.mjs || echo 'La carga inicial de Consumo fallo: la app arranca igual.') && npm start"]
