import { prisma } from "@/lib/prisma";
import { LINEAS } from "@/lib/actividadesBienestar";
import { clasificarComentarios } from "@/lib/sentimientoComentarios";
import { iniciarTrabajo } from "@/lib/agenteEvaluacion";

// Una vez por despliegue: al arrancar el backend nuevo, Nova termina de poner la manito a todos los comentarios y
// después el agente de evaluación recalifica TODAS las actividades realizadas y sus dashboards, para que las
// calificaciones tengan en cuenta el tono de los comentarios. La marca queda en Auditoría con un id fijo, así solo lo
// hace una instancia y una sola vez; para repetirlo en un despliegue futuro, cambiar MARCA.
// AGENTE_AL_DESPLEGAR=0 lo desactiva (por ejemplo, en local).
const MARCA = "agente-despliegue-2026-11-sentimientos";
const ESPERA_MS = 2 * 60 * 1000; // después de la primera pasada de la manito (lib/sentimientoComentarios.js)
const ACTOR = { nombre: "Nova (al desplegar)" };

async function correr() {
  try {
    await prisma.auditLog.create({
      data: { id: MARCA, action: "desplegar", entityType: "agenteEvaluacion", recordId: MARCA, recordInfo: "Agente de evaluación de actividades", userNombre: ACTOR.nombre, changes: JSON.stringify([{ field: "detalle", label: "Detalle", before: null, after: "Al desplegar: manito de los comentarios y recalificación de todas las actividades" }]) },
    });
  } catch {
    return; // ya se hizo (o lo está haciendo otra instancia)
  }
  try {
    // Hasta que no quede ningún comentario sin manito (cada pasada clasifica hasta 600).
    for (let i = 0; i < 20; i++) {
      const r = await clasificarComentarios();
      if (!r.pendientes || !r.clasificados) break;
    }
    await iniciarTrabajo(LINEAS, { confirmar: true, todas: true }, ACTOR);
  } catch (e) {
    // Si no arrancó, se quita la marca para intentarlo en el próximo reinicio.
    await prisma.auditLog.delete({ where: { id: MARCA } }).catch(() => {});
    throw e;
  }
}

export function startAgenteAlDesplegar() {
  if (process.env.AGENTE_AL_DESPLEGAR === "0" || globalThis.__agenteAlDesplegar) return;
  globalThis.__agenteAlDesplegar = setTimeout(() => {
    correr().catch((e) => console.error("[agente al desplegar]", e.message));
  }, ESPERA_MS);
}
