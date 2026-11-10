"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchActividadesApi, sugerirComprasApi, crearComprasSugeridasApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { IconSpark, IconBag, IconMoney, IconList, IconAlert, IconCheck, IconInfo, IconCalendar, IconSend } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import MoneyInput from "@/components/MoneyInput";

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

  const actividadSel = (actividades || []).find((a) => String(a.id) === String(actividadId));
  const pasa = presupuesto > 0 && usado > presupuesto;
  const pasoActual = aviso ? 3 : resultado ? 2 : actividadId ? 1 : 0;

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconBag size={22} />}
        color="azul"
        titulo="Armar las compras de una actividad"
        descripcion="Nova propone qué comprar, a quién y con cuánta anticipación, con base en lo que se compró en actividades parecidas. Los valores son el promedio de esas compras reales."
        pasos={["Elige la actividad", "Nova propone la lista", "Ajusta y marca lo que necesitas", "Crea las solicitudes de compra"]}
        paso={pasoActual}
      />

      <section className="ag-paso-card">
        <span className="ag-paso-card-num">1</span>
        <div className="ag-paso-card-cuerpo">
          <label htmlFor="ag-actividad"><strong>¿Para qué actividad?</strong> <small>Solo aparecen las actividades próximas que no están cerradas.</small></label>
          <div className="ag-elegir">
            <select id="ag-actividad" value={actividadId} onChange={(e) => { setActividadId(e.target.value); setResultado(null); setFilas([]); setAviso(null); }}>
              <option value="">{actividades ? "Elige la actividad…" : "Cargando actividades…"}</option>
              {(actividades || []).map((a) => <option key={a.id} value={a.id}>{a.fecha || "Sin fecha"} · {a.nombre} ({a.linea}){a.presupuesto ? ` · ${fmtCOP(a.presupuesto)}` : ""}</option>)}
            </select>
            <button type="button" className="btn btn-primary ag-btn-grande" disabled={!actividadId || pensando} onClick={sugerir}>
              {pensando ? <><span className="spinner" /> Nova está armando la lista…</> : <><IconSpark size={16} /> Sugerir compras</>}
            </button>
          </div>
          {actividadSel && (
            <div className="ag-chips">
              <span><IconCalendar size={13} /> {actividadSel.fecha || "Sin fecha"}</span>
              <span>{actividadSel.linea}</span>
              <span><IconMoney size={13} /> {actividadSel.presupuesto ? fmtCOP(actividadSel.presupuesto) : "Sin presupuesto"}</span>
            </div>
          )}
        </div>
      </section>

      {aviso && <div className="ag-aviso ok" role="status"><IconCheck size={16} /> <span>Se crearon {aviso.n} solicitud(es) de compra. Compras ya las ve en su lista. <Link href={aviso.href}>Ver la actividad</Link></span></div>}
      {error && <div className="modal-error">{error}</div>}

      {pensando && (
        <div className="ag-trabajando" role="status">
          <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={18} /></span>
          <div><strong>Nova está buscando actividades parecidas y sus compras…</strong><small>Tarda unos segundos.</small></div>
        </div>
      )}

      {!resultado && !pensando && !aviso && (
        <VacioAgente icono={<IconBag size={26} />} titulo="Elige una actividad y pide la lista">
          Nova arma la lista con compras reales de actividades parecidas; tú decides qué pedir.
        </VacioAgente>
      )}

      {resultado && (
        <>
          <section className="ag-presupuesto">
            <div className="ag-presupuesto-cifras">
              <CifraAgente icono={<IconMoney size={18} />} etiqueta="Presupuesto de la actividad" valor={presupuesto ? fmtCOP(presupuesto) : "Sin asignar"} pequena />
              <CifraAgente icono={<IconBag size={18} />} etiqueta="Ya comprado o pedido" valor={fmtCOP(comprometido)} pequena />
              <CifraAgente icono={<IconList size={18} />} etiqueta="Lo que vas a pedir" valor={fmtCOP(totalElegidas)} pequena tono="destaca" />
              <CifraAgente
                icono={pasa ? <IconAlert size={18} /> : <IconCheck size={18} />}
                etiqueta={presupuesto ? (pasa ? "Se pasa por" : "Queda") : "Total"}
                valor={fmtCOP(presupuesto ? Math.abs(presupuesto - usado) : usado)}
                pequena
                tono={presupuesto ? (pasa ? "mal" : "bien") : ""}
              />
            </div>
            {presupuesto > 0 && (
              <div className="ag-medidor">
                <div className="ag-medidor-barra" aria-hidden="true">
                  <i className="comprometido" style={{ width: `${Math.min(100, (comprometido / presupuesto) * 100)}%` }} />
                  <i className={`pedir ${pasa ? "pasa" : ""}`} style={{ width: `${Math.max(0, pct - Math.min(100, (comprometido / presupuesto) * 100))}%` }} />
                </div>
                <div className="ag-medidor-leyenda">
                  <span><i className="comprometido" /> Ya comprado o pedido</span>
                  <span><i className="pedir" /> Lo que vas a pedir</span>
                  <b className={pasa ? "agente-rojo" : ""}>{Math.round((usado / presupuesto) * 100)} % del presupuesto</b>
                </div>
              </div>
            )}
            {resultado.parecidas.length > 0 && (
              <div className="ag-basado">
                <span className="ag-etiqueta"><IconSpark size={12} /> Basado en</span>
                <div className="ag-chips">{resultado.parecidas.map((p) => <span key={`${p.nombre}-${p.fecha}`}>{p.nombre} · {p.fecha} · {p.compras} compra(s)</span>)}</div>
              </div>
            )}
          </section>

          {resultado.nota && <div className="ag-aviso"><IconInfo size={16} /> <span>{resultado.nota}</span></div>}

          {filas.length > 0 && (
            <div className="ag-lista-card">
              <div className="ag-lista-titulo">
                <span className="ag-paso-card-num">2</span>
                <div><strong>Revisa la lista</strong><small>Desmarca lo que no necesites y ajusta el valor y la fecha en que debe llegar.</small></div>
              </div>
              <div className="table-scroll">
                <table className="records ficha-tabla agente-tabla ag-tabla">
                  <thead><tr><th>Pedir</th><th>Qué comprar</th><th>Categoría</th><th>Proveedor sugerido</th><th className="num">Valor estimado</th><th>Debe llegar</th><th>Basado en</th></tr></thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.clave} className={f.elegida ? "" : "agente-apagada"}>
                        <td><input type="checkbox" className="ag-check" aria-label={`Pedir ${f.descripcion}`} checked={f.elegida} onChange={(e) => cambiar(f.clave, "elegida", e.target.checked)} /></td>
                        <td><input className="agente-input" aria-label="Qué comprar" value={f.descripcion} onChange={(e) => cambiar(f.clave, "descripcion", e.target.value)} /></td>
                        <td>{f.categoria ? <span className="ag-pill">{f.categoria}</span> : <span className="muted">—</span>}</td>
                        <td>{f.proveedorSugerido || <span className="muted">—</span>}</td>
                        <td className="num"><MoneyInput prefix={null} className="agente-input num" ariaLabel="Valor estimado" value={f.valorEstimado ?? ""} onChange={(x) => cambiar(f.clave, "valorEstimado", x)} /></td>
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
              <div className="ag-pie-accion">
                <div>
                  <strong>{elegidas.length} de {filas.length} marcada(s) · {fmtCOP(totalElegidas)}</strong>
                  {elegidas.some((f) => !f.fechaRequerida) && <small className="agente-aviso-fila">Falta la fecha en que debe llegar alguna compra marcada.</small>}
                </div>
                <button type="button" className="btn btn-primary ag-btn-grande" disabled={!elegidas.length || creando || elegidas.some((f) => !f.fechaRequerida)} onClick={crear}>
                  {creando ? <><span className="spinner" /> Creando…</> : <><IconSend size={15} /> Crear {elegidas.length} solicitud(es) de compra</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
