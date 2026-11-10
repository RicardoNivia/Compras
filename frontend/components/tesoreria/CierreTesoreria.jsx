"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { tesCierre, tesFirmar, urlReporteExcel } from "@/lib/tesoreriaApi";
import { IconCheck, IconAlert, IconDownload } from "@/components/icons";
import { SelectorPeriodo, anioActual, mesActual, Aviso } from "@/components/tesoreria/comun";

const ENLACE = { soportes: "/tesoreria/movimientos?estado=sinSoporte", conciliacion: "/tesoreria/conciliacion", proyectados: "/tesoreria/movimientos?estado=proyectado", extractos: "/tesoreria/conciliacion" };

export default function CierreTesoreria({ acceso }) {
  // Por defecto el mes anterior (es el que se cierra).
  const [periodo, setPeriodo] = useState(() => { const m = mesActual(); return m === 1 ? { anio: anioActual() - 1, mes: 12 } : { anio: anioActual(), mes: m - 1 }; });
  const [e, setE] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [firmando, setFirmando] = useState(false);

  const cargar = useCallback(() => tesCierre(periodo.anio, periodo.mes).then((r) => { setE(r); setError(""); }).catch((err) => setError(err.message)), [periodo]);
  useEffect(() => { cargar(); }, [cargar]);

  async function firmar() {
    if (!window.confirm(`¿Firmar el cierre de ${e.nombreMes}? El mes queda de solo lectura y queda en auditoría.`)) return;
    setFirmando(true); setError("");
    try { setE(await tesFirmar(periodo.anio, periodo.mes)); setAviso(`Cierre de ${e.nombreMes} firmado.`); } catch (err) { setError(err.message); } finally { setFirmando(false); }
  }

  return (
    <div className="tes-vista">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <SelectorPeriodo anio={periodo.anio} mes={periodo.mes} onCambio={(p) => setPeriodo({ anio: p.anio, mes: p.mes || periodo.mes })} id="tes-cierre" />
        <a className="btn" href={urlReporteExcel(periodo.anio)}><IconDownload size={13} /> Reportes {periodo.anio} en Excel</a>
      </div>
      {error && <p className="modal-error">{error}</p>}
      {!e && !error && <div className="tes-dos" aria-hidden="true"><div className="skeleton-bar" style={{ height: 340, borderRadius: 16 }} /><div className="skeleton-bar" style={{ height: 340, borderRadius: 16 }} /></div>}
      {e && (
        <div className="tes-dos">
          <div className="card">
            <div className="card-head">
              <h3 style={{ margin: 0 }}>Cierre de {e.nombreMes}</h3>
              {e.firmado ? <span className="pill good">Firmado</span> : <span className={`pill ${e.puedeFirmar ? "accent" : "warning"}`}>{e.puedeFirmar ? "Listo para firmar" : "En revisión"}</span>}
            </div>
            <ul className="tes-pasos">
              {e.pasos.map((p) => (
                <li key={p.clave}>
                  <span className={`tes-paso-ic ${p.ok ? "ok" : p.aviso ? "aviso" : "pend"}`} aria-hidden="true">{p.ok ? <IconCheck size={13} /> : <IconAlert size={13} />}</span>
                  <span className="tes-paso-txt">
                    <strong>{p.titulo}</strong>
                    <small>{p.detalle}</small>
                    {!p.ok && p.lista?.length > 0 && <small className="muted">{p.lista.slice(0, 5).join(" · ")}{p.lista.length > 5 ? ` · y ${p.lista.length - 5} más` : ""}</small>}
                  </span>
                  {!p.ok && !e.firmado && ENLACE[p.clave] && <Link href={ENLACE[p.clave]} className="btn small">Resolver</Link>}
                </li>
              ))}
            </ul>
            {e.firmado ? (
              <p className="ficha-aviso" style={{ margin: 0 }}>Firmado por {e.firmado.por} el {new Date(e.firmado.at).toLocaleString("es-CO")}. El mes es de solo lectura.</p>
            ) : acceso?.puedeFirmar ? (
              <button type="button" className="btn btn-primary" onClick={firmar} disabled={!e.puedeFirmar || firmando}>{firmando ? <span className="spinner" /> : null} Firmar el cierre de {e.nombreMes}</button>
            ) : <p className="muted" style={{ margin: 0 }}>Solo quien tiene acceso de firma puede firmar el cierre.</p>}
          </div>

          <div className="card">
            <div className="card-head"><h3 style={{ margin: 0 }}>{e.firmado ? "Saldos al firmar" : "Conciliación por cuenta"}</h3></div>
            {e.firmado ? (
              <ul className="tes-lista">{e.firmado.saldos.map((s) => <li key={s.cuenta}><span><strong>{s.cuenta}</strong><small>{s.moneda}</small></span><strong>{s.saldoTexto}</strong></li>)}</ul>
            ) : e.porCuenta.length ? (
              <ul className="tes-lista">
                {e.porCuenta.map((c) => (
                  <li key={c.cuentaId}>
                    <span><strong>{c.cuenta}</strong><small>{c.tieneExtracto ? `${c.enlazadas} de ${c.lineas} líneas enlazadas · ${c.pendientes} pendiente(s)` : "Sin extracto cargado"}</small></span>
                    <strong className={Math.abs(c.diferencia) < 0.5 ? "tes-pos" : "tes-neg"}>{c.tieneExtracto ? c.diferenciaTexto : "—"}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="muted" style={{ margin: 0 }}>No hay movimientos ni extractos en el mes.</p>}
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>La diferencia es el neto del banco menos el neto del libro en el mes; debe quedar en cero.</p>
          </div>
        </div>
      )}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
