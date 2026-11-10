import { patronDe } from "./parsersExtracto.js";

// Núcleo puro de la conciliación (sin Prisma ni alias «@/»): lo usan lib/tesoreria/conciliacion.js y
// scripts/tesoreria/importarFlujoCaja.mjs, así los dos enlazan con la misma regla.

const num = (d) => (d == null ? 0 : Number(d));
export const dias = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

// Lo que el movimiento hace en ESA cuenta: + entra, − sale (un traslado sale de una y entra a la otra).
export function signoEnCuenta(mv, cuentaId) {
  const v = num(mv.valor);
  if (mv.tipo === "ingreso") return v;
  if (mv.tipo === "egreso") return -v;
  return mv.cuentaId === cuentaId ? -v : mv.cuentaDestinoId === cuentaId ? v : 0;
}

export function reglaPara(reglas, descripcion) {
  const p = patronDe(descripcion);
  if (!p) return null;
  return reglas.find((r) => r.patron === p) || reglas.find((r) => r.patron.length >= 6 && p.startsWith(r.patron)) || null;
}

// lineas: sin enlazar, de una cuenta. movs: ejecutados de esa cuenta sin línea de esa cuenta. Devuelve
// [{ lineaIds, movimientoId, como }]: solo lo que coincide SIN dudas.
//  1) Uno a uno: mismo valor con signo y fecha a ±3 días (o el mismo mes si el movimiento tiene fecha aproximada),
//     con un único candidato más cercano.
//  2) Grupos: las líneas de un mes con la misma regla cuyo total es exactamente un movimiento de ese concepto y mes.
export function emparejar({ cuentaId, lineas, movs, reglas }) {
  const usados = new Set();
  const enlazadas = new Set();
  const out = [];
  for (const l of lineas) {
    const v = num(l.valor);
    const cands = movs
      .filter((m) => !usados.has(m.id) && Math.abs(signoEnCuenta(m, cuentaId) - v) < 0.5 && (m.fechaAproximada ? m.fecha.slice(0, 7) === l.fecha.slice(0, 7) : dias(m.fecha, l.fecha) <= 3))
      .map((m) => ({ m, d: m.fechaAproximada ? 0 : dias(m.fecha, l.fecha) }))
      .sort((a, b) => a.d - b.d);
    if (!cands.length || (cands.length > 1 && cands[0].d === cands[1].d)) continue;
    usados.add(cands[0].m.id);
    enlazadas.add(l.id);
    out.push({ lineaIds: [l.id], movimientoId: cands[0].m.id, como: "exacto" });
  }
  const grupos = new Map();
  for (const l of lineas) {
    if (enlazadas.has(l.id)) continue;
    const r = reglaPara(reglas, l.descripcion);
    if (!r) continue;
    const k = `${l.fecha.slice(0, 7)}|${r.conceptoId}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  for (const [k, grupo] of grupos) {
    if (grupo.length < 2) continue;
    const [mes, conceptoId] = k.split("|");
    const total = grupo.reduce((a, l) => a + num(l.valor), 0);
    const m = movs.find((x) => !usados.has(x.id) && x.conceptoId === Number(conceptoId) && x.fecha.slice(0, 7) === mes && Math.abs(signoEnCuenta(x, cuentaId) - total) < 1);
    if (!m) continue;
    usados.add(m.id);
    out.push({ lineaIds: grupo.map((l) => l.id), movimientoId: m.id, como: "agrupado" });
  }
  return out;
}
