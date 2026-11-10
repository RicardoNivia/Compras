// Verifica que la base de datos no tenga texto con caracteres dañados (U+FFFD, el rombo que reemplaza un acento o la ñ cuando la codificación es equivocada)
// y que TODAS las tablas estén protegidas por el trigger trg_texto_sin_danos (migración texto_sin_caracteres_danados).
//
// Uso: npm run db:verificar-texto     (termina con código 1 si encuentra algo — sirve en CI o antes de un despliegue)
//
// Si una tabla nueva aparece "sin proteger", agrega en su migración:  SELECT proteger_texto_tabla('nombre_de_la_tabla');
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let problemas = 0;

try {
  // 1) Tablas sin el trigger
  const tablas = await prisma.$queryRawUnsafe(
    `SELECT c.relname AS tabla,
            EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'trg_texto_sin_danos') AS protegida
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY 1`
  );
  const sinProteger = tablas.filter((t) => !t.protegida).map((t) => t.tabla);
  if (sinProteger.length) {
    problemas += sinProteger.length;
    console.log(`✗ Tablas SIN protección contra texto dañado: ${sinProteger.join(", ")}`);
    console.log("  Agrega en su migración: SELECT proteger_texto_tabla('<tabla>');");
  } else {
    console.log(`✓ Las ${tablas.length} tablas están protegidas por el trigger.`);
  }

  // 2) Datos ya dañados en cualquier columna de texto
  const columnas = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying') ORDER BY table_name, column_name`
  );
  let dañados = 0;
  for (const { table_name: t, column_name: c } of columnas) {
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}" WHERE "${c}" LIKE '%' || chr(65533) || '%'`);
    if (r[0].n > 0) {
      dañados += r[0].n;
      console.log(`✗ ${t}.${c}: ${r[0].n} fila(s) con caracteres dañados`);
    }
  }
  problemas += dañados;
  if (!dañados) console.log(`✓ Sin caracteres dañados en ${columnas.length} columnas de texto.`);
} finally {
  await prisma.$disconnect();
}

process.exit(problemas ? 1 : 0);
