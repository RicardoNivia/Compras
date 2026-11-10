"use client";

import { useEffect, useState } from "react";
import { IconSpark, IconCheck } from "@/components/icons";

// Pantalla mientras Nova arma el borrador a partir del pedido: el pedido, los pasos que va completando y una página
// que se va "llenando". Los pasos avanzan con el tiempo transcurrido (la IA no informa avances parciales) y el último
// solo se completa cuando llega el resultado real.

const PASOS = [
  { titulo: "Entendiendo lo que necesitas", detalle: "Período, para quién es y qué debe incluir" },
  { titulo: "Eligiendo las secciones", detalle: "Cifras clave, gráficas y tablas que responden al pedido" },
  { titulo: "Preparando el resumen de Nova", detalle: "Se redacta con las cifras exactas del período" },
  { titulo: "Calculando las cifras con los datos reales", detalle: "Lo hace el sistema, no la IA" },
];

export default function GenerandoNova({ pedido, error, onReintentar, onVolver }) {
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    if (error) return undefined;
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [error]);

  return (
    <div className="est-editor" style={{ minHeight: 640 }}>
      <section className="est-nova" style={{ maxWidth: 440, flexBasis: 400 }} aria-label="Nova arma el borrador">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="est-nova-ic"><IconSpark size={16} /></span>
          <strong style={{ fontFamily: "Nunito, sans-serif", fontSize: 15 }}>Nova está armando el borrador</strong>
        </div>
        <div className="est-msg-u">{pedido}</div>
        <div className="est-card" style={{ boxShadow: "none", padding: 16 }}>
          <span className="est-eyebrow">Progreso</span>
          <ol className="est-pasos" style={{ marginTop: 12 }}>
            {PASOS.map((p, i) => {
              const estado = error ? (i < paso ? "ok" : "pend") : i < paso ? "ok" : i === paso ? "run" : "pend";
              return (
                <li key={p.titulo} style={estado === "pend" ? { color: "var(--muted)" } : undefined}>
                  <span className={`est-paso-ic ${estado}`} aria-hidden="true">{estado === "ok" ? <IconCheck size={12} /> : null}</span>
                  <span><strong>{p.titulo}{estado === "run" ? "…" : ""}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{p.detalle}</span></span>
                </li>
              );
            })}
          </ol>
        </div>
        {error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="modal-error">{error}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={onReintentar}>Intentar de nuevo</button>
              <button type="button" className="btn" onClick={onVolver}>Volver</button>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Suele tardar menos de 30 segundos.</p>
        )}
      </section>
      <section className="est-desk" aria-hidden="true">
        <div className="est-a4">
          <div className="est-a4-head">
            <small>Sinco · Panel de Compras y Bienestar</small>
            <h2><span className="est-skel" style={{ height: 22, width: 300, opacity: .35 }} /></h2>
            <p>Armando…</p>
          </div>
          <div className="est-a4-body">
            {[0, 1, 2].map((k) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="est-skel" style={{ height: 13, width: "35%" }} />
                <span className="est-skel" style={{ height: 10, width: "98%" }} />
                <span className="est-skel" style={{ height: 10, width: "92%" }} />
                <span className="est-skel" style={{ height: 10, width: "70%" }} />
              </div>
            ))}
            <div className="est-kpis" style={{ "--cols": 4 }}>
              {[0, 1, 2, 3].map((k) => <span key={k} className="est-skel" style={{ height: 58, borderRadius: 10 }} />)}
            </div>
            <span className="est-skel" style={{ height: 140, borderRadius: 10 }} />
          </div>
        </div>
      </section>
    </div>
  );
}
