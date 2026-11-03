"use client";

import Link from "next/link";
import { ORIGENES } from "@/lib/notificacionesCatalogo";

export function Texto({ v, ancho = false }) {
  if (v == null || v === "") return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap">
      <span className={`desc-text${ancho ? " desc-text-ancha" : ""}`}>{v}</span>
      <span className="desc-tooltip-bubble">{v}</span>
    </span>
  );
}

export function fechaHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Pastilla del origen de un envío: programada, con retraso, manual (con quién la corrió) o prueba.
export function OrigenPill({ origen, por }) {
  const cls = origen === "manual" ? "secondary" : origen === "prueba" ? "warning" : origen === "recuperado" ? "warning" : "accent";
  const texto = origen === "manual" && por ? `Manual · ${por}` : ORIGENES[origen] || origen;
  return <span className={`pill ${cls}`}>{texto}</span>;
}

// Lo que recibió una persona (mismo contenido que la tarjeta de Teams).
export default function ContenidoNotificacion({ c }) {
  if (!c) return <p className="muted">Sin contenido.</p>;
  return (
    <div className="notif-contenido">
      {c.origen === "manual" && <p className="notif-origen">Enviada manualmente por <strong>{c.manualPor || "una persona"}</strong>.</p>}
      {c.origen === "prueba" && <p className="notif-origen prueba">Prueba enviada por {c.pruebaPor || "quien la configuró"} a todos los destinatarios.</p>}
      {c.origen === "recuperado" && <p className="notif-origen prueba">Enviada con retraso: el servidor no estaba disponible a la hora programada.</p>}
      {c.texto && <p className="notif-texto">{c.texto}</p>}
      {c.items?.length > 0 && (
        <>
          {c.tituloItems && <p className="notif-sub">{c.tituloItems}</p>}
          <div className="table-scroll" style={{ "--table-scroll-max-h": "320px" }}>
            <table className="audit-log notif-items">
              <tbody>
                {c.items.map((i, k) => (
                  <tr key={k}>
                    <td className="mono">{i.ref || ""}</td>
                    <td className="truncate"><Texto v={i.titulo} ancho /></td>
                    <td className="truncate"><Texto v={[i.contexto, i.detalle].filter(Boolean).join(" · ")} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{i.dato || ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{i.href && <Link className="btn small" href={i.href}>Ver</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.mas > 0 && <p className="count-note">y {c.mas} más · <Link href={c.enlace || "/alertas"}>Ver todas</Link></p>}
        </>
      )}
      {!c.sistema && <p className="count-note" style={{ margin: 0 }}>
        {c.notificacionNombre ? <>Notificación «{c.notificacionNombre}» · </> : null}Configurada por {c.configuradaPor}
        {c.notificacionId ? <> · <Link href={`/alertas?tab=notificaciones&n=${c.notificacionId}`}>Ver la notificación</Link></> : null}
      </p>}
    </div>
  );
}
