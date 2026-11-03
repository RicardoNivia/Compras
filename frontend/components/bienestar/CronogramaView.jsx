"use client";

import { useMemo, useState } from "react";
import { MESES, fmtCOP } from "@/lib/format";
import { isHoliday } from "@/lib/businessDays";
import { IconPlus } from "@/components/icons";
import CronogramaTrayectoria from "@/components/bienestar/CronogramaTrayectoria";
import DetalleActividadModal from "@/components/bienestar/DetalleActividadModal";
import { DIAS_SEMANA, estadoActividad, ocurreEl, pctClase } from "@/components/bienestar/actividadesUi";

const pad = (n) => String(n).padStart(2, "0");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Cronograma de Bienestar: vista anual (los 12 meses de un vistazo) y mensual (calendario con festivos). Cada
// actividad abre su ficha; en la vista mensual, el "+" de un día crea una actividad en esa fecha. Una actividad de
// varios días aparece en todos sus días y en todos los meses que toca.
export default function CronogramaView({ anio, actividades, onNueva, fichaHref, editarHref, linea, indicadores, selectorAnio, accion }) {
  const ahora = new Date();
  const [modo, setModo] = useState("trayectoria");
  const [detalle, setDetalle] = useState(null);
  const onAbrir = setDetalle;
  const [mes, setMes] = useState(ahora.getFullYear() === anio ? ahora.getMonth() : 0);

  const visibles = actividades; // ya vienen solo las de la línea de la página (Bienestar o Fundación)
  const porMes = useMemo(() => {
    const out = Array.from({ length: 12 }, () => []);
    for (const a of visibles) {
      if (!a.fecha) continue;
      const fin = a.fechaFin || a.fecha;
      const desde = Number(a.fecha.slice(5, 7)) - 1;
      const hasta = Number(fin.slice(0, 4)) > anio ? 11 : Number(fin.slice(5, 7)) - 1;
      for (let m = desde; m <= hasta; m++) out[m].push(a);
    }
    for (const lista of out) lista.sort((x, y) => x.fecha.localeCompare(y.fecha));
    return out;
  }, [visibles, anio]);
  const sinFecha = visibles.filter((a) => !a.fecha);

  return (
    <div className="cronograma">
      <div className="cronograma-toolbar">
        {selectorAnio}
        <div className="pill-group" role="group" aria-label="Vista del cronograma">
          <button type="button" className={`pill-btn${modo === "trayectoria" ? " active" : ""}`} aria-pressed={modo === "trayectoria"} onClick={() => setModo("trayectoria")}>Trayectoria</button>
          <button type="button" className={`pill-btn${modo === "anio" ? " active" : ""}`} aria-pressed={modo === "anio"} onClick={() => setModo("anio")}>Año</button>
          <button type="button" className={`pill-btn${modo === "mes" ? " active" : ""}`} aria-pressed={modo === "mes"} onClick={() => setModo("mes")}>Mes</button>
        </div>
        {modo === "mes" && (
          <div className="cronograma-mes-nav">
            <button type="button" className="btn small" onClick={() => setMes((m) => Math.max(0, m - 1))} disabled={mes === 0} aria-label="Mes anterior">‹</button>
            <span className="cronograma-mes-titulo">{MESES[mes]} {anio}</span>
            <button type="button" className="btn small" onClick={() => setMes((m) => Math.min(11, m + 1))} disabled={mes === 11} aria-label="Mes siguiente">›</button>
          </div>
        )}
        <div className="spacer" />
        {modo !== "trayectoria" && <Leyenda />}
        {accion}
      </div>

      {modo !== "trayectoria" && indicadores}
      {modo === "trayectoria" ? (
        <CronogramaTrayectoria anio={anio} linea={linea} actividades={visibles} onElegir={setDetalle} onMes={(i) => { setMes(i); setModo("mes"); }} />
      ) : modo === "anio" ? (
        <div className="cronograma-anio">
          {porMes.map((lista, i) => {
            // El gasto de una actividad de varios meses cuenta solo en el mes en que empieza.
            const gastado = lista.filter((a) => Number(a.fecha.slice(5, 7)) - 1 === i).reduce((s, a) => s + (a.gastado || 0), 0);
            const esActual = ahora.getFullYear() === anio && ahora.getMonth() === i;
            return (
              <section key={i} className={`cronograma-mes-card${esActual ? " actual" : ""}`} aria-label={`${MESES[i]} ${anio}`}>
                <header>
                  <button type="button" className="cronograma-mes-link" onClick={() => { setMes(i); setModo("mes"); }}>{MESES[i]}</button>
                  <span className="count-note">{lista.length ? `${lista.length} · ${fmtCOP(gastado)}` : "—"}</span>
                </header>
                {lista.length === 0 ? (
                  <p className="cronograma-vacio">Sin actividades</p>
                ) : (
                  <ul>
                    {lista.map((a) => <ItemActividad key={a.id} a={a} onAbrir={onAbrir} conDia mes={i} />)}
                  </ul>
                )}
              </section>
            );
          })}
          {sinFecha.length > 0 && (
            <section className="cronograma-mes-card sin-fecha" aria-label="Actividades sin fecha">
              <header>
                <span className="cronograma-mes-link" style={{ cursor: "default" }}>Sin fecha</span>
                <span className="count-note">{sinFecha.length}</span>
              </header>
              <ul>{sinFecha.map((a) => <ItemActividad key={a.id} a={a} onAbrir={onAbrir} />)}</ul>
            </section>
          )}
        </div>
      ) : (
        <CalendarioMes anio={anio} mes={mes} actividades={porMes[mes]} onAbrir={onAbrir} onNueva={onNueva} />
      )}
      {detalle && <DetalleActividadModal actividad={detalle} fichaHref={fichaHref} editarHref={editarHref} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="cronograma-leyenda" aria-label="Estados">
      {["creada", "programada", "ejecutada", "cerrada"].map((e) => (
        <span key={e}><i className={`cronograma-dot ${e}`} aria-hidden="true" />{estadoActividad(e).label}</span>
      ))}
    </div>
  );
}

// Día en la tarjeta del mes: "4", "4-7" si dura varios días, "1-7" o "4 →" si cruza de mes.
function diaEnMes(a, mes) {
  const delMes = (f) => Number(f.slice(5, 7)) - 1 === mes;
  const fin = a.fechaFin || a.fecha;
  const ini = delMes(a.fecha) ? Number(a.fecha.slice(8, 10)) : 1;
  if (!a.fechaFin) return String(ini);
  return delMes(fin) ? `${ini}-${Number(fin.slice(8, 10))}` : `${ini} →`;
}

function ItemActividad({ a, onAbrir, conDia = false, mes }) {
  const est = estadoActividad(a.estado);
  return (
    <li>
      <button type="button" className={`cronograma-item est-${a.estado}${a.linea === "Fundación" ? " fundacion" : ""}`} onClick={() => onAbrir(a)} title={`${a.nombre} · ${est.label}`}>
        {conDia && <span className="cronograma-dia">{diaEnMes(a, mes)}</span>}
        <i className={`cronograma-dot ${a.estado}`} aria-hidden="true" />
        <span className="cronograma-nombre">{a.nombre}</span>
        {a.puntajeNova != null && <span className="nova-puntaje" title={`Nova la calificó con ${a.puntajeNova} de 5`}>★ {a.puntajeNova}</span>}
        {a.presupuesto ? <span className={`cronograma-pct ${pctClase(a.pctPresupuesto)}`}>{Math.round((a.pctPresupuesto || 0) * 100)} %</span> : null}
      </button>
    </li>
  );
}

function CalendarioMes({ anio, mes, actividades, onAbrir, onNueva }) {
  const hoy = hoyISO();
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const offset = (primero.getDay() + 6) % 7; // lunes primero
    const dias = new Date(anio, mes + 1, 0).getDate();
    const out = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= dias; d++) {
      const fecha = new Date(anio, mes, d);
      const iso = `${anio}-${pad(mes + 1)}-${pad(d)}`;
      out.push({ d, iso, festivo: isHoliday(fecha), finde: fecha.getDay() === 0 || fecha.getDay() === 6, items: actividades.filter((a) => ocurreEl(a, iso)) });
    }
    while (out.length % 7) out.push(null);
    return out;
  }, [anio, mes, actividades]);

  return (
    <div className="cronograma-cal" role="grid" aria-label={`${MESES[mes]} ${anio}`}>
      {DIAS_SEMANA.map((d) => <div key={d} className="cronograma-cal-head" role="columnheader">{d}</div>)}
      {celdas.map((c, i) => c ? (
        <div key={c.iso} role="gridcell" className={`cronograma-cal-dia${c.finde ? " finde" : ""}${c.festivo ? " festivo" : ""}${c.iso === hoy ? " hoy" : ""}`}>
          <div className="cronograma-cal-top">
            <span className="cronograma-cal-num">{c.d}</span>
            {c.festivo && <span className="cronograma-festivo">Festivo</span>}
            {onNueva && (
              <button type="button" className="cronograma-cal-add" onClick={() => onNueva(c.iso)} aria-label={`Nueva actividad el ${c.d} de ${MESES[mes].toLowerCase()}`}>
                <IconPlus size={11} />
              </button>
            )}
          </div>
          <ul>{c.items.map((a) => <ItemActividad key={a.id} a={a} onAbrir={onAbrir} />)}</ul>
        </div>
      ) : <div key={`v${i}`} className="cronograma-cal-dia vacio" role="gridcell" aria-hidden="true" />)}
    </div>
  );
}
