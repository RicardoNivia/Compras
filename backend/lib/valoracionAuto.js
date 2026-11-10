import { prisma } from "@/lib/prisma";
import { valorarPendientes } from "@/lib/valoracionIA";
import { logValoracionMasiva } from "@/lib/audit";

// Valoración automática de las compras radicadas que todavía no tienen valoración con IA.
//
// Al publicar/arrancar el backend (ver instrumentation.js) revisa en segundo plano cuáles compras
// radicadas no tienen valoración y las valora una por una (cada proveedor en orden cronológico, para
// apoyarse en sus compras anteriores). Así, al llevar esta versión a producción los registros existentes
// quedan valorados solos, sin correr nada a mano. Después repite la revisión cada cierto tiempo para
// recoger las que fallaron o las que se radiquen sin que el modal de valoración alcance a guardarlas.
//
//   · Idempotente: lo que ya tiene valoración se omite, así que reiniciar el backend no repite trabajo.
//   · Usa la API key del servidor (ANTHROPIC_API_KEY); si no está configurada, no hace nada.
//   · VALORACION_AUTO=0 la desactiva.
//   · Un registro que falla 3 veces en esta ejecución se deja de reintentar hasta el próximo reinicio.

const ESPERA_INICIAL_MS = 45 * 1000; // deja que el backend termine de arrancar antes de empezar
const REVISION_CADA_MS = 30 * 60 * 1000;
const MAX_FALLAS = 3;

let iniciado = false;
let ocupado = false;
const fallas = new Map(); // recordId -> veces que falló

function hayApiKey() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTROPIC_API_KEY);
}

async function pasada() {
  if (ocupado) return;
  ocupado = true;
  try {
    const omitir = new Set([...fallas].filter(([, n]) => n >= MAX_FALLAS).map(([id]) => id));
    const r = await valorarPendientes(prisma, {
      concurrencia: 2,
      omitir,
      log: (m) => console.log(`[valoración IA] ${m}`),
    });
    if (!r.pendientes) return;
    for (const e of r.errores) fallas.set(e.id, (fallas.get(e.id) || 0) + 1);
    console.log(`[valoración IA] pasada terminada: ${r.hechos} valoradas, ${r.errores.length} con error.`);
    if (r.hechos || r.errores.length) await logValoracionMasiva(r.hechos, r.errores.length, r.hechos ? r.sumaCompra / r.hechos : null).catch(() => {});
  } catch (err) {
    console.error("[valoración IA] no se pudo completar la pasada:", err.message);
  } finally {
    ocupado = false;
  }
}

export function startValoracionAutomatica() {
  if (iniciado) return;
  iniciado = true;
  if (process.env.VALORACION_AUTO === "0") {
    console.log("[valoración IA] automática desactivada (VALORACION_AUTO=0).");
    return;
  }
  if (!hayApiKey()) {
    console.log("[valoración IA] sin ANTHROPIC_API_KEY: no se valoran compras automáticamente.");
    return;
  }
  setTimeout(() => {
    pasada();
    setInterval(pasada, REVISION_CADA_MS).unref?.();
  }, ESPERA_INICIAL_MS).unref?.();
}
