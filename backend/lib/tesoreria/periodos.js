import { hoyColombia } from "@/lib/hoyColombia";

// Períodos de Tesorería en fechas de Colombia, calculados en el servidor (Nova y las notificaciones no hacen cuentas de
// fechas). Las semanas van de lunes a domingo; «este mes» y «esta semana» son completos (incluyen lo que viene).
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diaSemana = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
const lunesDe = (f) => masDias(f, -((diaSemana(f) + 6) % 7));
const finMes = (a, m) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
export const fechaLarga = (f) => { const d = new Date(`${f}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };
const corta = (f) => { const d = new Date(`${f}T12:00:00Z`); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };

export const PERIODOS_TESORERIA = {
  hoy: "Hoy", manana: "Mañana", ayer: "Ayer",
  esta_semana: "Esta semana (lunes a domingo)", proxima_semana: "La próxima semana (lunes a domingo)", semana_anterior: "La semana pasada",
  este_mes: "Este mes (completo)", mes_siguiente: "El mes que viene", mes_anterior: "El mes pasado",
  esta_semana_y_mes: "Esta semana y el resto del mes", pendientes_al_fin_de_mes: "Todo lo atrasado más lo que falta hasta fin de mes", anio_hasta_hoy: "Del 1 de enero a hoy", este_anio: "Todo este año",
  proximos_n_dias: "Los próximos N días", ultimos_n_dias: "Los últimos N días", vencidos: "Todo lo anterior a hoy", rango: "Entre dos fechas",
};

// { desde, hasta, label } (inclusive). opciones: { desde, hasta, dias, anio, mes }.
export function rangoTesoreria(periodo = "este_mes", opciones = {}, hoy = hoyColombia()) {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  const n = Math.min(Math.max(Number(opciones.dias) || 7, 1), 366);
  switch (periodo) {
    case "hoy": return { desde: hoy, hasta: hoy, label: `hoy ${fechaLarga(hoy)}` };
    case "manana": { const f = masDias(hoy, 1); return { desde: f, hasta: f, label: `mañana ${fechaLarga(f)}` }; }
    case "ayer": { const f = masDias(hoy, -1); return { desde: f, hasta: f, label: `ayer ${fechaLarga(f)}` }; }
    case "esta_semana": { const l = lunesDe(hoy); return { desde: l, hasta: masDias(l, 6), label: `esta semana, del ${corta(l)} al ${corta(masDias(l, 6))}` }; }
    case "proxima_semana": { const l = masDias(lunesDe(hoy), 7); return { desde: l, hasta: masDias(l, 6), label: `la próxima semana, del ${corta(l)} al ${corta(masDias(l, 6))}` }; }
    case "semana_anterior": { const l = masDias(lunesDe(hoy), -7); return { desde: l, hasta: masDias(l, 6), label: `la semana pasada, del ${corta(l)} al ${corta(masDias(l, 6))}` }; }
    case "mes_siguiente": { const a2 = m === 12 ? a + 1 : a; const m2 = m === 12 ? 1 : m + 1; return { desde: `${a2}-${String(m2).padStart(2, "0")}-01`, hasta: finMes(a2, m2), label: `${MESES[m2 - 1]} de ${a2}` }; }
    case "mes_anterior": { const a2 = m === 1 ? a - 1 : a; const m2 = m === 1 ? 12 : m - 1; return { desde: `${a2}-${String(m2).padStart(2, "0")}-01`, hasta: finMes(a2, m2), label: `${MESES[m2 - 1]} de ${a2}` }; }
    case "esta_semana_y_mes": { const l = lunesDe(hoy); const f = finMes(a, m) > masDias(l, 6) ? finMes(a, m) : masDias(l, 6); return { desde: l, hasta: f, label: `desde esta semana (lunes ${corta(l)}) hasta el ${corta(f)}` }; }
    case "pendientes_al_fin_de_mes": return { desde: "2000-01-01", hasta: finMes(a, m), label: `lo atrasado y lo que vence hasta el ${corta(finMes(a, m))}` };
    case "anio_hasta_hoy": return { desde: `${a}-01-01`, hasta: hoy, label: `del 1 de enero al ${corta(hoy)} de ${a}` };
    case "este_anio": return { desde: `${a}-01-01`, hasta: `${a}-12-31`, label: `todo ${a}` };
    case "proximos_n_dias": return { desde: hoy, hasta: masDias(hoy, n - 1), label: `los próximos ${n} días (hasta el ${corta(masDias(hoy, n - 1))})` };
    case "ultimos_n_dias": return { desde: masDias(hoy, -(n - 1)), hasta: hoy, label: `los últimos ${n} días` };
    case "vencidos": return { desde: "2000-01-01", hasta: masDias(hoy, -1), label: "todo lo anterior a hoy" };
    case "rango": {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(opciones.desde || "") ? opciones.desde : hoy;
      const h = /^\d{4}-\d{2}-\d{2}$/.test(opciones.hasta || "") ? opciones.hasta : d;
      return { desde: d <= h ? d : h, hasta: d <= h ? h : d, label: `del ${corta(d <= h ? d : h)} al ${corta(d <= h ? h : d)}` };
    }
    case "mes": {
      const a2 = Number(opciones.anio) || a;
      const m2 = Math.min(Math.max(Number(opciones.mes) || m, 1), 12);
      return { desde: `${a2}-${String(m2).padStart(2, "0")}-01`, hasta: finMes(a2, m2), label: `${MESES[m2 - 1]} de ${a2}` };
    }
    case "este_mes":
    default:
      return { desde: `${a}-${String(m).padStart(2, "0")}-01`, hasta: finMes(a, m), label: `${MESES[m - 1]} de ${a}` };
  }
}
