// Migración de una sola vez: copia todos los datos de la base SQLite anterior
// (compras.db) a PostgreSQL. Reemplaza por completo el contenido de Postgres
// (incluidos los admins y maestros que siembra la migración inicial).
//
// Requiere Node 22.13+ (usa el módulo integrado node:sqlite, sin dependencias).
// Uso, desde backend/ y con el Prisma Client ya generado para PostgreSQL:
//   DATABASE_URL="postgresql://compras:<clave>@<host>:5432/compras" \
//     node prisma/migrar-sqlite-a-postgres.mjs ruta/a/compras.db
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const sqlitePath = process.argv[2];
if (!sqlitePath) {
  console.error("Uso: node prisma/migrar-sqlite-a-postgres.mjs <ruta a compras.db>");
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const prisma = new PrismaClient();

// Prisma guarda DateTime en SQLite como milisegundos (número); las filas
// insertadas por SQL a mano usan CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC).
function toDate(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === "number" || typeof v === "bigint") return new Date(Number(v));
  if (/^\d+$/.test(v)) return new Date(Number(v));
  const iso = v.includes("T") ? v : v.replace(" ", "T");
  return new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

const toBool = (v) => (v === null || v === undefined ? v : Boolean(Number(v)));

// Orden de inserción respetando las FK (conversations → users, messages → conversations).
const TABLES = [
  { table: "users", model: "user", dates: ["createdAt", "updatedAt"], bools: ["activo"] },
  { table: "meta", model: "meta", dates: ["updatedAt"], bools: [] },
  { table: "records", model: "record", dates: ["createdAt", "updatedAt"], bools: ["radicado"] },
  { table: "audit_logs", model: "auditLog", dates: ["createdAt"], bools: [] },
  { table: "agent_conversations", model: "conversation", dates: ["createdAt", "updatedAt"], bools: [] },
  { table: "agent_messages", model: "message", dates: ["createdAt"], bools: [] },
  { table: "maestros", model: "maestro", dates: ["createdAt", "updatedAt"], bools: ["activo"] },
];

function readTable({ table, dates, bools }) {
  const exists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!exists) return [];
  return sqlite.prepare(`SELECT * FROM "${table}"`).all().map((row) => {
    const out = { ...row };
    for (const f of dates) if (f in out) out[f] = toDate(out[f]);
    for (const f of bools) if (f in out) out[f] = toBool(out[f]);
    return out;
  });
}

async function main() {
  const data = TABLES.map((t) => ({ ...t, rows: readTable(t) }));

  await prisma.$transaction(
    async (tx) => {
      for (const { model } of [...data].reverse()) {
        await tx[model].deleteMany();
      }
      for (const { model, table, rows } of data) {
        if (rows.length) await tx[model].createMany({ data: rows });
        console.log(`${table}: ${rows.length} filas`);
      }
    },
    { timeout: 120_000 }
  );

  console.log("Migración completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
