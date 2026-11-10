"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchUsuariosInformesApi } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/roles";
import { IconUsers, IconAlert } from "@/components/icons";

// Acceso a un informe "solo para consultar": en vez de destinatarios y programación, se elige quiénes pueden verlo.
// Esas personas lo encuentran en el menú "Ver informes", con los datos al día cada vez que lo abren. Quien lo creó y
// los administradores siempre pueden verlo.
export default function AccesoPanel({ informe, onCambio }) {
  const [usuarios, setUsuarios] = useState(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const acceso = informe.contexto?.acceso || [];
  const ids = new Set(acceso.map((a) => a.id));

  useEffect(() => {
    fetchUsuariosInformesApi().then((r) => setUsuarios(r.usuarios || [])).catch((e) => setError(e.message || "No se pudo cargar la lista de usuarios."));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (usuarios || []).filter((u) => u.id !== informe.createdBy && (!t || `${u.nombre} ${u.email}`.toLowerCase().includes(t)));
  }, [usuarios, q, informe.createdBy]);

  function alternar(u) {
    const nuevo = ids.has(u.id) ? acceso.filter((a) => a.id !== u.id) : [...acceso, { id: u.id, nombre: u.nombre }];
    onCambio({ contexto: { ...informe.contexto, acceso: nuevo } });
  }

  return (
    <div className="est-row">
      <section className="est-card est-grow" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="acc-t">
        <div>
          <h2 id="acc-t">¿Quiénes pueden ver este informe?</h2>
          <p className="est-sub">Lo verán en el menú <strong>Ver informes</strong>, con los datos recalculados cada vez que lo abran. No necesitan permiso de Informes ni pueden editarlo.</p>
        </div>
        <input type="search" placeholder="Buscar por nombre o correo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuario" />
        {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
        {usuarios === null && !error ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /> Cargando usuarios…</div>
        ) : (
          <ul className="est-acceso-lista">
            {filtrados.map((u) => (
              <li key={u.id}>
                <label className="check-row">
                  <input type="checkbox" checked={ids.has(u.id)} onChange={() => alternar(u)} aria-label={`Dar acceso a ${u.nombre}`} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 13.5 }}>{u.nombre}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>{u.email} · {ROLE_LABELS[u.role] || u.role}{u.role === "admin" ? " (ya lo ve por ser administrador)" : ""}</span>
                  </span>
                </label>
              </li>
            ))}
            {filtrados.length === 0 && <li className="muted" style={{ padding: 12 }}>Ningún usuario coincide con la búsqueda.</li>}
          </ul>
        )}
      </section>

      <aside className="est-card est-side" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="acc-res-t">
        <h2 id="acc-res-t" style={{ display: "flex", alignItems: "center", gap: 8 }}><IconUsers size={16} /> Con acceso</h2>
        <ul className="est-lista">
          <li><span className="est-chip">Creador</span><span style={{ fontSize: 13 }}>{informe.createdByNombre || "Tú"}</span></li>
          <li><span className="est-chip off">Admins</span><span className="muted" style={{ fontSize: 12.5 }}>Todos los administradores</span></li>
          {acceso.map((a) => (
            <li key={a.id}>
              <span style={{ fontSize: 13, flex: 1 }}>{a.nombre}</span>
              <button type="button" className="btn small btn-ghost" onClick={() => alternar(a)} aria-label={`Quitar acceso a ${a.nombre}`}>Quitar</button>
            </li>
          ))}
        </ul>
        {acceso.length === 0 && <p className="est-sub" style={{ margin: 0 }}>Todavía no le diste acceso a nadie más.</p>}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Los cambios se guardan solos y quedan en Auditoría.</p>
      </aside>
    </div>
  );
}
