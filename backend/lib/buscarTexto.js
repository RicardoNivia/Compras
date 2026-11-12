import { prisma } from "@/lib/prisma";

// Búsquedas por texto del servidor: no distinguen mayúsculas, minúsculas ni tildes (á = a, ñ = n, ü = u) y tratan
// varios espacios como uno. Mismo criterio que frontend/lib/buscar.js (convención en CLAUDE.md).
export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// true si la búsqueda está vacía o aparece en alguno de los campos (textos, números o null).
export function coincide(q, ...campos) {
  const n = normalizar(q);
  if (!n) return true;
  return campos.some((c) => c != null && normalizar(c).includes(n));
}

// Postgres: ILIKE ignora mayúsculas pero no tildes. translate() las quita sin extensiones (unaccent no hace falta).
const CON = "áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const SIN = "aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc";
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sqlNormalizado = (col) => `regexp_replace(translate(lower(coalesce("${col}"::text, '')), '${CON}', '${SIN}'), '\\s+', ' ', 'g')`;

// Ids de las filas de `tabla` (nombre real en la BD, @@map) en las que el texto aparece en alguna de `columnas`, sin
// importar mayúsculas ni tildes. Tabla y columnas son constantes del código (nunca vienen del usuario): se validan
// igual. El texto va como parámetro. Se usa junto con Prisma: `where: { id: { in: await idsQueCoinciden(...) } }`.
export async function idsQueCoinciden(tabla, columnas, q, { idColumn = "id" } = {}) {
  for (const x of [tabla, idColumn, ...columnas]) if (!IDENT.test(x)) throw new Error(`Identificador SQL inválido: ${x}`);
  const n = normalizar(q);
  if (!n) return [];
  const patron = `%${n.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const sql = `SELECT "${idColumn}" AS id FROM "${tabla}" WHERE ${columnas.map((c) => `${sqlNormalizado(c)} LIKE $1`).join(" OR ")}`;
  const filas = await prisma.$queryRawUnsafe(sql, patron);
  return filas.map((f) => f.id);
}
