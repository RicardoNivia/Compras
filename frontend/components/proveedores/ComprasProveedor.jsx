"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchComprasProveedorApi } from "@/lib/api";
import { businessDaysBetween } from "@/lib/businessDays";
import ValoracionPuntaje from "@/components/ValoracionPuntaje";

const PLAZO_DIAS_HABILES = 8; // mismo plazo del Dashboard y las Alertas

// Agrupa los factores que Nova mencionó en todas las valoraciones (por nombre) y cuenta su impacto.
function resumenFactores(compras) {
  const mapa = new Map();
  for (const c of compras) {
    for (const f of c.valoracion?.factores || []) {
      const k = String(f.factor || "").trim().toLowerCase();
      if (!k) continue;
      const e = mapa.get(k) || { factor: f.factor, positivo: 0, neutro: 0, negativo: 0 };
      e[f.impacto] = (e[f.impacto] || 0) + 1;
      mapa.set(k, e);
    }
  }
  const lista = [...mapa.values()];
  return {
    aFavor: lista.filter((e) => e.positivo > 0).sort((a, b) => b.positivo - a.positivo).slice(0, 4),
    enContra: lista.filter((e) => e.negativo > 0).sort((a, b) => b.negativo - a.negativo).slice(0, 4),
  };
}

// Evidencia objetiva sobre plazos y anulaciones, calculada con las fechas reales de las compras.
function evidencia(compras) {
  const dias = compras
    .filter((c) => c.fechaSolicitud && c.fechaEntrega)
    .map((c) => businessDaysBetween(c.fechaSolicitud, c.fechaEntrega))
    .filter((d) => d != null);
  const dentro = dias.filter((d) => d <= PLAZO_DIAS_HABILES).length;
  return {
    conEntrega: dias.length,
    dentroDelPlazo: dentro,
    pctPlazo: dias.length ? Math.round((dentro / dias.length) * 100) : null,
    promedioDias: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
    anuladas: compras.filter((c) => c.estado === "Anulado").length,
  };
}

// Análisis de por qué un proveedor tiene su calificación general (promedio del puntaje de proveedor de sus compras
// valoradas por Nova): distribución, cumplimiento de plazos, anulaciones y factores que más pesaron. Se ve en el
// detalle del proveedor; no lista las compras (la valoración de cada una está en la columna de Registros).
export default function ComprasProveedor({ nit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  function cargar() {
    return fetchComprasProveedorApi(nit)
      .then((d) => { setData(d); setError(""); })
      .catch((err) => setError(err.message || "No se pudo cargar el historial de compras."));
  }

  useEffect(() => {
    setData(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nit]);

  const analisis = useMemo(() => {
    if (!data) return null;
    const valoradas = data.compras.filter((c) => c.valoracion);
    const ultima = [...valoradas]
      .filter((c) => c.valoracion.observacionProveedor)
      .sort((a, b) => new Date(b.valoracion.updatedAt) - new Date(a.valoracion.updatedAt))[0];
    return { factores: resumenFactores(valoradas), evidencia: evidencia(data.compras.filter((c) => c.radicado)), ultima };
  }, [data]);

  if (error) return <div className="modal-error">{error}</div>;
  if (!data) return <p className="muted">Cargando compras…</p>;

  const { general } = data;
  const maxDist = Math.max(1, ...Object.values(general.distribucion));
  const { factores, evidencia: ev, ultima } = analisis;
  const pocas = general.comprasValoradas > 0 && general.comprasValoradas < 3;

  return (
    <section aria-label="Compras y calificaciones" className="prov-compras">
      <div className="prov-calif-general">
        <div className="prov-calif-principal">
          <span className="valoracion-label">Calificación general (Nova)</span>
          {general.promedioProveedor != null ? <ValoracionPuntaje puntaje={general.promedioProveedor} decimales /> : <span className="muted">Sin valorar</span>}
          <span className="count-note">{general.comprasValoradas} de {general.comprasTotales} compras valoradas</span>
        </div>
        <div>
          <span className="valoracion-label">Promedio de las compras</span>
          {general.promedioCompras != null ? <ValoracionPuntaje puntaje={general.promedioCompras} decimales /> : <span className="muted">—</span>}
        </div>
        <div className="prov-calif-dist" aria-label="Distribución de puntajes del proveedor">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="prov-calif-dist-fila">
              <span>{n}★</span>
              <span className="prov-calif-dist-barra"><span style={{ width: `${(general.distribucion[n] / maxDist) * 100}%` }} /></span>
              <span className="mono">{general.distribucion[n]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="prov-porque">
        <h4>Por qué tiene esta calificación</h4>
        {general.comprasValoradas === 0 ? (
          <p className="muted">Todavía no hay compras valoradas por Nova para este proveedor. La valoración se genera al radicar cada compra.</p>
        ) : (
          <ul>
            <li>
              Promedio de <strong>{general.promedioProveedor?.toFixed(1)}/5</strong> sobre {general.comprasValoradas} compra(s) valorada(s)
              {pocas ? " — es un historial corto: la calificación aún no es concluyente" : ""}.
            </li>
            {ev.pctPlazo != null && (
              <li>
                Cumplimiento de plazos: <strong>{ev.pctPlazo}%</strong> de sus compras radicadas con entrega ({ev.dentroDelPlazo} de {ev.conEntrega}) llegó dentro de {PLAZO_DIAS_HABILES} días hábiles; promedio de <strong>{ev.promedioDias}</strong> días hábiles.
              </li>
            )}
            {ev.anuladas > 0 && <li>Compras anuladas: <strong>{ev.anuladas}</strong>.</li>}
            {factores.aFavor.length > 0 && (
              <li>
                Lo que más pesó a favor:{" "}
                {factores.aFavor.map((f, i) => <span key={f.factor}>{i ? " · " : ""}{f.factor} <span className="muted">({f.positivo})</span></span>)}.
              </li>
            )}
            {factores.enContra.length > 0 && (
              <li>
                Lo que más pesó en contra:{" "}
                {factores.enContra.map((f, i) => <span key={f.factor}>{i ? " · " : ""}{f.factor} <span className="muted">({f.negativo})</span></span>)}.
              </li>
            )}
            {ultima && (
              <li className="prov-porque-nova">
                <strong>Lo último que dijo Nova del proveedor</strong> (compra #{ultima.numero}): {ultima.valoracion.observacionProveedor}
              </li>
            )}
          </ul>
        )}
        {general.radicadasSinValorar > 0 && (
          <p className="prov-note">{general.radicadasSinValorar} compra(s) radicada(s) aún sin valoración de Nova.</p>
        )}
      </div>


    </section>
  );
}
