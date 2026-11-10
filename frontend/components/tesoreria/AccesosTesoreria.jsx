"use client";

import { useCallback, useEffect, useState } from "react";
import { tesAccesos, tesPersonas, tesOtorgar, tesQuitar } from "@/lib/tesoreriaApi";
import { Paginacion } from "@/components/notificaciones/ui";
import { Celda, Aviso } from "@/components/tesoreria/comun";

const PAGE_SIZES = [25, 50, 100];
const NIVELES = { consulta: "Consulta (solo ve)", registro: "Registro (registra, importa y concilia)", firma: "Firma (además firma el cierre y administra)" };

// Acceso NOMINAL a Tesorería: ser administrador del panel no da acceso. Mientras nadie lo tenga, un admin da el primero.
export default function AccesosTesoreria({ acceso }) {
  const [lista, setLista] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [nuevo, setNuevo] = useState({ userId: "", nivel: acceso ? "consulta" : "firma" });
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);

  const cargar = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([tesAccesos(), tesPersonas()]);
      setLista(a.accesos); setPersonas(p.personas); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function hacer(fn, msg) {
    setError("");
    try { await fn(); setAviso(msg); await cargar(); } catch (e) { setError(e.message); }
  }
  const pagina = (lista || []).slice((page - 1) * size, page * size);

  return (
    <div className="tes-vista">
      {!acceso && (
        <p className="ficha-aviso" style={{ margin: 0 }}>Nadie tiene acceso a Tesorería todavía. Como administrador puedes dar el primero, y debe ser de firma. Después solo quien firma administra esta lista; ser administrador del panel no da acceso a los datos.</p>
      )}
      <div className="card tes-filtros">
        <div className="field" style={{ flex: "2 1 260px" }}>
          <label htmlFor="ta-persona">Persona</label>
          <select id="ta-persona" value={nuevo.userId} onChange={(e) => setNuevo({ ...nuevo, userId: e.target.value })}>
            <option value="">Elige…</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.email}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="ta-nivel">Nivel</label>
          <select id="ta-nivel" value={nuevo.nivel} onChange={(e) => setNuevo({ ...nuevo, nivel: e.target.value })}>
            {Object.entries(NIVELES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="tes-filtros-acciones">
          <button type="button" className="btn btn-primary" disabled={!nuevo.userId} onClick={() => hacer(() => tesOtorgar(nuevo.userId, nuevo.nivel), "Acceso dado.").then(() => setNuevo({ ...nuevo, userId: "" }))}>Dar acceso</button>
        </div>
      </div>
      {error && <p className="modal-error">{error}</p>}
      <div className="table-card">
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead><tr><th>Persona</th><th>Nivel</th><th>Desde</th><th>Dado por</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {lista === null && [0, 1, 2].map((i) => <tr key={i} aria-hidden="true"><td colSpan={5}><div className="skeleton-bar" style={{ height: 22, borderRadius: 8 }} /></td></tr>)}
              {lista !== null && !pagina.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 18 }}>Nadie tiene acceso.</td></tr>}
              {pagina.map((a) => (
                <tr key={a.id}>
                  <td><Celda v={a.nombre} /></td>
                  <td>
                    <select aria-label={`Nivel de ${a.nombre}`} value={a.nivel} onChange={(e) => hacer(() => tesOtorgar(a.userId, e.target.value), "Nivel actualizado.")}>
                      {Object.keys(NIVELES).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
                    </select>
                  </td>
                  <td>{new Date(a.createdAt).toLocaleDateString("es-CO")}</td>
                  <td><Celda v={a.creadoPorNombre} /></td>
                  <td><button type="button" className="btn small btn-ghost btn-danger-text" onClick={() => window.confirm(`¿Quitarle el acceso a ${a.nombre}?`) && hacer(() => tesQuitar(a.id), "Acceso quitado.")}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion id="tes-acc-pagesize" page={page} size={size} total={(lista || []).length} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="persona(s)" />
      </div>
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
