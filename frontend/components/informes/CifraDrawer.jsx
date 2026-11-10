"use client";

import { useEffect, useState } from "react";
import { cifraDetalleApi } from "@/lib/api";
import { IconAlert } from "@/components/icons";
import Truncado from "@/components/informes/Truncado";

// "¿De dónde sale esta cifra?": cómo se calcula, cuántos registros la forman, el detalle por área, los registros
// principales y el valor del período anterior. Lo calcula el sistema (sin IA): Nova solo redacta con estas cifras.

const fmtPesos = (n) => `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`;
const fmtCorto = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(n || 0);

export default function CifraDrawer({ params, onClose }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    setD(null);
    setError("");
    cifraDetalleApi(params)
      .then((r) => { if (vivo) setD(r); })
      .catch((e) => { if (vivo) setError(e.message || "No se pudo calcular."); });
    return () => { vivo = false; };
  }, [params]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxArea = d ? Math.max(...d.porArea.map((a) => (d.metrica === "totalRegistros" ? a.cantidad : a.valor)), 1) : 1;

  return (
    <>
      <div className="est-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="est-drawer" role="dialog" aria-modal="true" aria-labelledby="cifra-t">
        <div className="est-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="est-eyebrow">¿De dónde sale esta cifra?</span>
            <h2 id="cifra-t" style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 28, fontWeight: 600, margin: "6px 0 0", color: "var(--ink)" }}>
              {d ? d.valorTexto : "…"}
            </h2>
            <p className="est-sub" style={{ marginTop: 6 }}>{params.titulo || d?.label}</p>
          </div>
          <button type="button" className="btn btn-ghost est-ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="est-drawer-body">
          {!d && !error && <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /> Calculando con los registros…</div>}
          {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {d && (
            <>
              <div className="est-verificada">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
                <span><strong>Calculada por el sistema</strong> con los registros de compras. Nova redacta a partir de esta cifra, pero no puede cambiarla.</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="est-eyebrow">Cómo se calcula</span>
                <div className="est-formula">
                  <strong>{d.formula}</strong><br />
                  {d.filtro}<br />
                  <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{d.registros} registro(s)</span>
                </div>
              </div>

              {d.anterior && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="est-eyebrow">Frente al período anterior</span>
                  <div className="est-formula" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{d.anterior.etiqueta ? `${d.anterior.etiqueta.charAt(0).toUpperCase()}${d.anterior.etiqueta.slice(1)}` : "Anterior"}: <strong style={{ fontFamily: "IBM Plex Mono, monospace" }}>{d.anterior.valorTexto}</strong></span>
                    {d.anterior.variacion && <span className={`est-chip ${d.anterior.variacion.delta < 0 ? "warn" : "ok"}`}>{d.anterior.variacion.texto}</span>}
                  </div>
                </div>
              )}

              {d.porArea.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <span className="est-eyebrow">Por área</span>
                  {d.porArea.slice(0, 8).map((a, i) => {
                    const v = d.metrica === "totalRegistros" ? a.cantidad : a.valor;
                    return (
                      <div className="est-hb" key={a.area}>
                        <span className="truncate" title={a.area}>{a.area}</span>
                        <span className="t"><i style={{ width: `${Math.max(2, (v / maxArea) * 100)}%`, animationDelay: `${i * 0.05}s` }} /></span>
                        <span style={{ fontFamily: "IBM Plex Mono, monospace", textAlign: "right" }}>{d.metrica === "totalRegistros" ? `${a.cantidad}` : fmtCorto(a.valor)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {d.muestra.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span className="est-eyebrow">{d.tiempos ? "Las que más tardaron" : "Registros principales"}</span>
                    <div className="spacer" />
                    <span className="muted" style={{ fontSize: 12 }}>Mostrando {d.muestra.length} de {d.registros}</span>
                  </div>
                  <div className="table-scroll">
                    <table className="audit-log" style={{ fontSize: 12.5 }}>
                      <thead><tr><th>#</th><th>Descripción</th><th>Área</th><th style={{ textAlign: "right" }}>{d.tiempos ? "Días háb." : "Valor con IVA"}</th></tr></thead>
                      <tbody>
                        {d.muestra.map((r) => (
                          <tr key={r.id}>
                            <td className="mono">{r.localSeq || "—"}</td>
                            <td className="truncate" style={{ maxWidth: 170 }}>
                              <Truncado v={r.descripcion} max={170} />
                            </td>
                            <td className="truncate" style={{ maxWidth: 110 }}>{r.area}</td>
                            <td className="mono" style={{ textAlign: "right" }}>{d.tiempos ? r.dias : fmtPesos(r.valorConIva)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <a className="btn small" href="/registros" style={{ alignSelf: "flex-start" }}>Ver en Registros →</a>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
