"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchActividadesApi, sugerirComprasApi, crearComprasSugeridasApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { IconSpark } from "@/components/icons";

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Agente que arma las compras de una actividad: Nova propone la lista con lo que se compró en actividades parecidas.
// Los valores son el promedio de esas compras de referencia (no los inventa la IA) y se pueden ajustar antes de crear
// las solicitudes de compra; solo se crean las que quedan marcadas.
export default function ComprasSugeridas({ actividadInicial }) {
  const [actividades, setActividades] = useState(null);
  const [actividadId, setActividadId] = useState(actividadInicial ? String(actividadInicial) : "");
  const [resultado, setResultado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    const y = new Date().getFullYear();
    Promise.all([fetchActividadesApi(y), fetchActividadesApi(y + 1)])
      .then(([a, b]) => {
        const d = hoy();
        const todas = [...(a.actividades || []), ...(b.actividades || [])];
        const vistas = new Set();
        setActividades(todas.filter((x) => {
          if (vistas.has(x.id)) return false;
          vistas.add(x.id);
          return x.estado !== "cerrada" && (!x.fecha || (x.fechaFin || x.fecha) >= d);
        }).sort((x, z) => String(x.fecha || "9999").localeCompare(String(z.fecha || "9999"))));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function sugerir() {
    if (!actividadId) return;
    setError("");
    setAviso(null);
    setResultado(null);
    setPensando(true);
    try {
      const r = await sugerirComprasApi(actividadId);
      setResultado(r);
      setFilas(r.items.map((it) => ({ ...it, elegida: true })));
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  }

  // Si llega con una actividad (desde su ficha), propone de una vez.
  useEffect(() => { if (actividadInicial) sugerir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (clave, campo, valor) => setFilas((l) => l.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
  const elegidas = filas.filter((f) => f.elegida && f.descripcion.trim());
  const totalElegidas = useMemo(() => elegidas.reduce((s, f) => s + (Number(f.valorEstimado) || 0), 0), [elegidas]);
  const presupuesto = resultado?.presupuesto || 0;
  const comprometido = resultado?.comprometido || 0;
  const usado = comprometido + totalElegidas;
  const pct = presupuesto ? Math.min(100, (usado / presupuesto) * 100) : 0;

  async function crear() {
    setError("");
    setCreando(true);
    try {
      const r = await crearComprasSugeridasApi(actividadId, elegidas.map((f) => ({ ...f, valorEstimado: f.valorEstimado === "" ? null : Number(f.valorEstimado) })));
      const a = resultado.actividad;
      setAviso({ n: r.creadas.length, href: `${a.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar"}/actividades/${a.id}` });
      setResultado(null);
      setFilas([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="agente-panel">
      <section className="agente-cabeza">
        <div className="agente-cabeza-texto">
          <h2><IconSpark size={18} /> Armar las compras de una actividad</h2>
          <p>Elige una actividad próxima y Nova propone qué comprar, a quién y con cuánta anticipación, basándose en lo que se compró en actividades parecidas. Los valores son el promedio de esas compras: ajústalos y crea solo las solicitudes que necesites.</p>
        </div>
      </section>

      <div className="agente-filtros">
        <select aria-label="Actividad" value={actividadId} onChange={(e) => { setActividadId(e.target.value); setResultado(null); setFilas([]); }} style={{ minWidth: 340 }}>
          <option value="">{actividades ? "Elige la actividad…" : "Cargando actividades…"}</option>
          {(actividades || []).map((a) => <option key={a.id} value={a.id}>{a.fecha || "Sin fecha"} · {a.nombre} ({a.linea}){a.presupuesto ? ` · ${fmtCOP(a.presupuesto)}` : ""}</option>)}
        </select>
        <button type="button" className="btn btn-primary" disabled={!actividadId || pensando} onClick={sugerir}>
          {pensando ? <><span className="spinner" /> Nova está armando la lista…</> : <><IconSpark size={14} /> Sugerir compras</>}
        </button>
      </div>

      {aviso && <div className="ficha-aviso" role="status">Se crearon {aviso.n} solicitud(es) de compra. Compras ya las ve en su lista. <Link href={aviso.href}>Ver la actividad</Link></div>}
      {error && <div className="modal-error">{error}</div>}

      {resultado && (
        <>
          <section className="agente-presupuesto">
            <div className="agente-presupuesto-cifras">
              <div><span>Presupuesto de la actividad</span><strong>{presupuesto ? fmtCOP(presupuesto) : "Sin asignar"}</strong></div>
              <div><span>Ya comprado o pedido</span><strong>{fmtCOP(comprometido)}</strong></div>
              <div><span>Lo que vas a pedir</span><strong>{fmtCOP(totalElegidas)}</strong></div>
              <div><span>{presupuesto ? (usado > presupuesto ? "Se pasa por" : "Queda") : "Total"}</span><strong className={presupuesto && usado > presupuesto ? "agente-rojo" : ""}>{fmtCOP(presupuesto ? Math.abs(presupuesto - usado) : usado)}</strong></div>
            </div>
            {presupuesto > 0 && <div className="agente-barra" aria-hidden="true"><i style={{ width: `${pct}%` }} className={usado > presupuesto ? "pasa" : ""} /></div>}
            {resultado.parecidas.length > 0 && <p className="count-note">Basado en: {resultado.parecidas.map((p) => `${p.nombre} (${p.fecha}, ${p.compras} compra(s))`).join(" · ")}</p>}
          </section>

          {resultado.nota && <div className="ficha-aviso">{resultado.nota}</div>}

          {filas.length > 0 && (
            <div className="table-card">
              <div className="table-scroll">
                <table className="records ficha-tabla agente-tabla">
                  <thead><tr><th>Pedir</th><th>Qué comprar</th><th>Categoría</th><th>Proveedor sugerido</th><th className="num">Valor estimado</th><th>Debe llegar</th><th>Basado en</th></tr></thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.clave} className={f.elegida ? "" : "agente-apagada"}>
                        <td><input type="checkbox" aria-label={`Pedir ${f.descripcion}`} checked={f.elegida} onChange={(e) => cambiar(f.clave, "elegida", e.target.checked)} /></td>
                        <td><input className="agente-input" aria-label="Qué comprar" value={f.descripcion} onChange={(e) => cambiar(f.clave, "descripcion", e.target.value)} /></td>
                        <td>{f.categoria || <span className="muted">—</span>}</td>
                        <td>{f.proveedorSugerido || <span className="muted">—</span>}</td>
                        <td className="num"><input className="agente-input num" type="number" min="0" step="1000" aria-label="Valor estimado" value={f.valorEstimado ?? ""} onChange={(e) => cambiar(f.clave, "valorEstimado", e.target.value)} /></td>
                        <td><input className="agente-input" type="date" aria-label="Debe llegar" value={f.fechaRequerida || ""} onChange={(e) => cambiar(f.clave, "fechaRequerida", e.target.value)} /></td>
                        <td>
                          <span className="desc-tooltip-wrap" style={{ maxWidth: 200 }}>
                            <span className="desc-text">{f.referencias.map((r) => `#${r.numero}`).join(", ")} · {f.razon}</span>
                            <span className="desc-tooltip-bubble">
                              {f.razon}
                              {f.referencias.map((r) => <span key={r.numero} style={{ display: "block" }}>#{r.numero} · {r.actividad} · {fmtCOP(r.valor || 0)} · {r.descripcion}</span>)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span className="count-note">{elegidas.length} de {filas.length} marcada(s) · {fmtCOP(totalElegidas)}</span>
                <div className="spacer" />
                <button type="button" className="btn btn-primary" disabled={!elegidas.length || creando || elegidas.some((f) => !f.fechaRequerida)} onClick={crear}>
                  {creando ? "Creando…" : `Crear ${elegidas.length} solicitud(es) de compra`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
