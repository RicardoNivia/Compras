import { prisma } from "@/lib/prisma";
import { logMaestroCreate } from "@/lib/audit";

// Maestros de Bienestar que usan los participantes y el inventario (ver lib/maestros.js, módulo "Bienestar"): se guarda
// el id del maestro más el texto. Un valor en uso no se puede renombrar, así que el texto nunca queda desactualizado.
//   · Lo que se escribe a mano o llega del formulario público debe estar en el catálogo.
//   · En una importación, los Excel traen el área escrita de mil formas: se compara sin tildes ni signos ("M&E" = "MYE")
//     y lo que no exista se crea en el maestro, para no perder a nadie.

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export const claveDe = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/&/g, "Y").replace(/[^A-Z0-9Ñ]/g, "");

export async function valoresActivos(tipo) {
  const rows = await prisma.maestro.findMany({ where: { tipo, activo: true }, select: { valor: true }, orderBy: { valor: "asc" } });
  return rows.map((r) => r.valor);
}

// Motivos en el orden de su uso habitual: "Otro" y "Sin justificación" al final.
export async function motivosActivos() {
  const valores = await valoresActivos("motivoInasistencia");
  const alFinal = ["Sin justificación", "Otro"];
  return [...valores.filter((v) => !alFinal.includes(v)), ...alFinal.filter((v) => valores.includes(v))];
}

async function delCatalogo(tipo, texto, etiqueta) {
  if (!String(texto ?? "").trim()) return { valor: null, id: null };
  const rows = await prisma.maestro.findMany({ where: { tipo, activo: true }, select: { id: true, valor: true } });
  const hit = rows.find((r) => claveDe(r.valor) === claveDe(texto));
  if (!hit) throw badRequest(`${etiqueta} no está en los maestros de Bienestar. Elige una de la lista.`);
  return { valor: hit.valor, id: hit.id };
}

export async function areaDelCatalogo(texto) {
  const r = await delCatalogo("areaParticipante", texto, "Esa área");
  return { area: r.valor, areaId: r.id };
}

export async function motivoDelCatalogo(texto) {
  const r = await delCatalogo("motivoInasistencia", texto, "Ese motivo");
  return { motivoInasistencia: r.valor, motivoInasistenciaId: r.id };
}

export async function unidadDelCatalogo(texto) {
  const r = await delCatalogo("unidadInventario", texto, "Esa unidad");
  return { unidad: r.valor, unidadId: r.id };
}

// Para importar: con crear=false (vista previa) no escribe nada en el maestro.
export async function resolvedoresImportacion({ crear = true, actor = null } = {}) {
  const rows = await prisma.maestro.findMany({ where: { tipo: { in: ["areaParticipante", "motivoInasistencia", "unidadInventario"] } }, select: { id: true, tipo: true, valor: true } });
  const mapa = new Map(rows.map((r) => [`${r.tipo}|${claveDe(r.valor)}`, r]));

  async function resolver(tipo, texto) {
    const valor = String(texto ?? "").replace(/\s+/g, " ").trim();
    if (!valor) return { valor: null, id: null };
    const k = `${tipo}|${claveDe(valor)}`;
    if (!mapa.has(k)) {
      if (!crear) return { valor, id: null };
      const nuevo = await prisma.maestro.create({ data: { tipo, valor, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || "Importación Excel" } });
      logMaestroCreate(actor, nuevo).catch(() => {});
      mapa.set(k, nuevo);
    }
    const hit = mapa.get(k);
    return { valor: hit.valor, id: hit.id };
  }

  return {
    area: async (t) => { const r = await resolver("areaParticipante", t); return { area: r.valor, areaId: r.id }; },
    unidad: async (t) => { const r = await resolver("unidadInventario", t); return { unidad: r.valor, unidadId: r.id }; },
    // Los motivos no se inventan desde un Excel: lo que no esté en el catálogo cuenta como "Otro".
    motivo: (t) => {
      if (!t) return { motivoInasistencia: null, motivoInasistenciaId: null };
      const hit = mapa.get(`motivoInasistencia|${claveDe(t)}`) || mapa.get(`motivoInasistencia|${claveDe("Otro")}`);
      return { motivoInasistencia: hit?.valor || String(t), motivoInasistenciaId: hit?.id || null };
    },
  };
}
