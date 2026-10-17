// Diagnóstico de notificaciones (solo lectura, BD local): últimos eventos, notificaciones y sus ejecuciones.
// Uso, desde backend/: node scripts/diagnosticoNotificaciones.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const eventos = await prisma.eventoNotificacion.findMany({ orderBy: { id: "desc" }, take: 8 });
  console.log("== Últimos eventos");
  for (const e of eventos) console.log(`  #${e.id} ${e.tipo} entidad=${e.entidadId} creado=${e.createdAt.toISOString()} procesado=${e.procesadoAt?.toISOString() || "NO"} por ${e.creadoPorNombre}`);

  const notifs = await prisma.notificacion.findMany({ include: { destinatarios: true, ejecuciones: { orderBy: { id: "desc" }, take: 3 } }, orderBy: { id: "asc" } });
  console.log("\n== Notificaciones");
  for (const n of notifs) {
    console.log(`  #${n.id} "${n.nombre}" ${n.estado} · ${n.disparador}${n.evento ? ` ${n.evento}/${n.agrupacion}` : ` ${n.frecuencia} ${n.hora}`} · creada ${n.createdAt.toISOString()} · parámetros ${n.parametros} · alcance ${n.alcance}`);
    console.log(`     para: ${n.destinatarios.map((d) => d.userNombre + (d.deBaja ? " (baja)" : "")).join(", ")}`);
    for (const e of n.ejecuciones) console.log(`     ejecución #${e.id} ${e.origen} ${e.estado} ${e.createdAt.toISOString()}${e.error ? ` error: ${e.error}` : ""}`);
  }
} finally {
  await prisma.$disconnect();
}
