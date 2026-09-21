import { PrismaClient } from "@prisma/client";

// Patrón recomendado por Prisma para Next.js: reutiliza la misma
// instancia entre recargas en desarrollo para no agotar las conexiones
// a SQL Server. https://pris.ly/d/help/next-js-best-practices
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
