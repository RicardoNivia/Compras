"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteReportApi, fetchPorEnviarApi, updateReportApi } from "@/lib/api";
import { IconSpark, IconPlus, IconTrash, IconMail, IconClock } from "@/components/icons";
import EnviarInformeModal from "@/components/informes/EnviarInformeModal";
import Truncado from "@/components/informes/Truncado";
import { fmtFechaCorta } from "@/components/informes/estudioUtils";

const PAGE_SIZES = [25, 50, 100];
const IDEAS = [
  "Cierre del mes para gerencia",
  "¿Cómo va el presupuesto por área este año?",
  "Proveedores con peor valoración de Nova del mes",
  "Compras fuera de plazo del mes anterior",
];

// Miniatura ilustrativa de cada plantilla (un gráfico de colores que sugiere su contenido; no son datos).
const COLORES = ["#2063a0", "#fb8500", "#8fc93a", "#00bcd4", "#d14343"];

function arco(cx, cy, r, ri, a0, a1) {
  const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
}

function Dona({ partes, centro }) {
  const total = partes.reduce((s, x) => s + x.v, 0);
  let a = -Math.PI / 2;
  return (
    <svg viewBox="0 0 44 44" width="44" height="44">
      {partes.map((x, i) => {
        const a1 = a + (x.v / total) * Math.PI * 2;
        const d = arco(22, 22, 20, 12.5, a + 0.04, a1 - 0.04);
        a = a1;
        return <path key={i} d={d} fill={x.c} />;
      })}
      {centro && <text x="22" y="25.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#101840" fontFamily="Nunito, sans-serif">{centro}</text>}
    </svg>
  );
}

function MiniGrafico({ clave }) {
  switch (clave) {
    case "dashboardMensual":
      return (
        <svg viewBox="0 0 44 44" width="44" height="44">
          <rect x="3" y="4" width="17" height="10" rx="2" fill="#2063a0" /><rect x="24" y="4" width="17" height="10" rx="2" fill="#0a9fbd" />
          <circle cx="12" cy="29" r="9" fill="none" stroke="#fb8500" strokeWidth="5" strokeDasharray="34 23" /><circle cx="12" cy="29" r="9" fill="none" stroke="#8fc93a" strokeWidth="5" strokeDasharray="22 35" strokeDashoffset="-34" />
          {[10, 16, 7].map((h, i) => <rect key={i} x={26 + i * 5.5} y={40 - h} width="4" height={h} rx="1" fill={["#2063a0", "#00bcd4", "#d14343"][i]} />)}
        </svg>
      );
    case "cierreMensual":
      return (
        <svg viewBox="0 0 44 44" width="44" height="44">
          {[18, 28, 38, 24, 32].map((h, i) => <rect key={i} x={3 + i * 8} y={42 - h} width="6" height={h} rx="1.5" fill={COLORES[i]} />)}
        </svg>
      );
    case "presupuestoArea":
      return (
        <svg viewBox="0 0 44 44" width="44" height="44">
          {[{ w: 38, c: "#d14343" }, { w: 32, c: "#fb8500" }, { w: 22, c: "#8fc93a" }, { w: 15, c: "#00bcd4" }].map((b, i) => (
            <g key={i}><rect x="3" y={5 + i * 9.5} width="38" height="6" rx="3" fill="rgba(16,24,64,.08)" /><rect x="3" y={5 + i * 9.5} width={b.w} height="6" rx="3" fill={b.c} /></g>
          ))}
        </svg>
      );
    case "desempenoProveedores":
      return (
        <svg viewBox="0 0 44 44" width="44" height="44">
          {[30, 23, 17, 11].map((h, i) => <rect key={i} x={4 + i * 10} y={40 - h} width="7" height={h} rx="1.5" fill={["#8fc93a", "#00bcd4", "#fb8500", "#d14343"][i]} />)}
          <path d="M22 2.5l1.9 3.9 4.3.6-3.1 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3.1-3 4.3-.6z" fill="#f4b400" />
        </svg>
      );
    case "cumplimientoTiempos":
      return <Dona partes={[{ v: 81, c: "#60a918" }, { v: 19, c: "#d14343" }]} centro="81%" />;
    case "cicloProveedores":
      return <Dona partes={[{ v: 55, c: "#2063a0" }, { v: 15, c: "#00bcd4" }, { v: 12, c: "#fb8500" }, { v: 18, c: "#d14343" }]} />;
    default:
      return <Dona partes={COLORES.map((c, i) => ({ v: 5 - i, c }))} />;
  }
}

const esConsulta = (r) => r?.contexto?.proposito === "consulta";

// Selector "¿Para qué es?": para enviar (programación y envíos) o solo para consultarlo en la app.
function SelectorProposito({ valor, onChange, compacto = false }) {
  const opciones = [
    { v: "enviar", t: "Para enviar", d: "Se programa y se envía por correo; te avisa en Mi día." },
    { v: "consulta", t: "Solo para consultar", d: "Lo ven en la app las personas con acceso, con los datos al día según el período." },
  ];
  return (
    <div className="est-proposito" role="radiogroup" aria-label="¿Para qué es el informe?">
      {opciones.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} className={"est-proposito-op" + (valor === o.v ? " on" : "")} onClick={() => onChange(o.v)}>
          <strong>{o.t}</strong>
          {!compacto && <small>{o.d}</small>}
        </button>
      ))}
    </div>
  );
}

function estadoDe(r) {
  if (r.tipo !== "estudio") return { label: "Del constructor anterior", cls: "off" };
  if (esConsulta(r)) return { label: "Para consultar", cls: "" };
  if (r.esBorrador) return { label: "Borrador", cls: "off" };
  if (!r.activo) return { label: "En pausa", cls: "warn" };
  return { label: "Activo", cls: "ok" };
}

const Texto = ({ v }) => <Truncado v={v} max={280} />;

export default function EstudioInicio({ initialReports, plantillas, initialPorEnviar }) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports || []);
  const [porEnviar, setPorEnviar] = useState(initialPorEnviar || []);
  const [pedido, setPedido] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [borrando, setBorrando] = useState(null);
  const [enviar, setEnviar] = useState(null);
  const [error, setError] = useState("");
  const [plantillaSel, setPlantillaSel] = useState(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [propositoPedido, setPropositoPedido] = useState("enviar");
  const [propositoNuevo, setPropositoNuevo] = useState("enviar");
  // Pestañas de "Mis informes": los que se envían y los que solo se consultan tienen datos distintos.
  const [vistaLista, setVistaLista] = useState("enviar");

  const claveNombre = (n) => String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
  const nombreRepetido = !!nombreNuevo.trim() && reports.some((r) => claveNombre(r.nombre) === claveNombre(nombreNuevo));

  function abrirPlantilla(p) {
    setPlantillaSel(p);
    setNombreNuevo(p.nombre);
    setPropositoNuevo("enviar");
  }

  function crearDesdePlantilla() {
    const n = nombreNuevo.trim().replace(/\s+/g, " ");
    if (!n || nombreRepetido) return;
    const base = plantillaSel.clave ? `plantilla=${plantillaSel.clave}&` : "";
    router.push(`/informes/nuevo?${base}nombre=${encodeURIComponent(n)}&proposito=${propositoNuevo}`);
  }

  const cuentas = useMemo(() => ({
    enviar: reports.filter((r) => !esConsulta(r)).length,
    consulta: reports.filter((r) => esConsulta(r)).length,
  }), [reports]);
  const deLista = vistaLista === "consulta";
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = reports.filter((r) => esConsulta(r) === deLista);
    return t ? base.filter((r) => `${r.nombre} ${r.programacionTexto || ""}`.toLowerCase().includes(t)) : base;
  }, [reports, q, deLista]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const current = Math.min(page, totalPages);
  const visibles = filtrados.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => { setPage(1); }, [q, pageSize, vistaLista]);

  const proximas = useMemo(() => reports
    .filter((r) => r.proximaFecha)
    .sort((a, b) => a.proximaFecha.fecha.localeCompare(b.proximaFecha.fecha))
    .slice(0, 5), [reports]);

  function crearConNova(texto) {
    const t = (texto ?? pedido).trim();
    if (!t) return;
    router.push(`/informes/nuevo?pedido=${encodeURIComponent(t)}&proposito=${propositoPedido}`);
  }

  async function borrar(id) {
    setError("");
    try {
      await deleteReportApi(id);
      setReports((rs) => rs.filter((r) => r.id !== id));
      setBorrando(null);
    } catch (e) {
      setError(e.message || "No se pudo eliminar.");
    }
  }

  // Un informe con envíos no se borra: se desactiva (deja de generarse) y se puede volver a activar.
  async function alternarActivo(r) {
    setError("");
    try {
      const upd = await updateReportApi(r.id, { activo: !r.activo });
      setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...upd, porEnviar: x.porEnviar, ultimoEnvioAt: x.ultimoEnvioAt, totalEnvios: x.totalEnvios, totalFotos: x.totalFotos, ultimaFotoAt: x.ultimaFotoAt } : x)));
    } catch (e) {
      setError(e.message || "No se pudo cambiar el estado.");
    }
  }

  async function refrescarPorEnviar() {
    try { setPorEnviar((await fetchPorEnviarApi()).ediciones || []); } catch { /* se queda la lista anterior */ }
  }

  return (
    <div className="est">
      {/* Pedido a Nova */}
      <section className="est-card est-pedir" aria-labelledby="pedir-t">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="est-nova-ic lg"><IconSpark size={17} /></span>
          <div>
            <h2 id="pedir-t">¿Qué informe necesitas?</h2>
            <p className="est-sub" style={{ margin: "2px 0 0" }}>Escríbelo como se lo pedirías a un compañero. Nova lo arma con los datos reales de la app; las cifras las calcula el sistema.</p>
          </div>
        </div>
        <form className="est-composer" onSubmit={(e) => { e.preventDefault(); crearConNova(); }}>
          <label htmlFor="pedido" className="sr-only" style={{ position: "absolute", left: -9999 }}>Describe el informe</label>
          <textarea
            id="pedido" rows={1} value={pedido} onChange={(e) => setPedido(e.target.value)}
            placeholder="Ej.: Quiero un informe mensual para gerencia con cómo vamos por área, qué compras se pasaron de los 8 días hábiles y qué proveedores salieron mal valorados."
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) crearConNova(); }}
          />
          <button type="submit" className="btn btn-nova" disabled={!pedido.trim()} style={{ minHeight: 38, padding: "0 16px", borderRadius: 10 }}>
            <IconSpark size={15} /> Crear con Nova
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>¿Para qué es?</span>
          <SelectorProposito valor={propositoPedido} onChange={setPropositoPedido} compacto />
        </div>
        <div className="est-ideas">
          <span className="muted" style={{ fontSize: 12.5 }}>Ideas:</span>
          {IDEAS.map((t) => <button key={t} type="button" className="btn" onClick={() => setPedido(t)}>{t}</button>)}
        </div>
      </section>

      {/* Plantillas */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="plantillas-t">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 id="plantillas-t" style={{ fontFamily: "Nunito, sans-serif", fontSize: 15, margin: 0 }}>O empieza con una plantilla</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>Un clic y queda lista con los datos reales; luego la ajustas con Nova</span>
          <div className="spacer" />
          <button type="button" className="btn" onClick={() => abrirPlantilla({ clave: null, nombre: "Informe sin título", descripcion: "Un informe vacío para armarlo a tu gusto." })}><IconPlus size={13} /> Informe en blanco</button>
        </div>
        <div className="est-plantillas">
          {plantillas.map((p) => (
            <button key={p.clave} type="button" className="est-plantilla" onClick={() => abrirPlantilla(p)}>
              <span className={`est-mini est-mini-${p.clave}`} aria-hidden="true">
                <MiniGrafico clave={p.clave} />
              </span>
              <strong>{p.nombre}</strong>
              <span>{p.descripcion}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="est-row">
        {/* Mis informes */}
        <section className="est-card est-grow" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="mis-t">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 id="mis-t">Mis informes</h2>
            <div className="est-subtabs" role="tablist" aria-label="Tipo de informe">
              {[{ id: "enviar", label: "Para enviar" }, { id: "consulta", label: "Solo para consultar" }].map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={vistaLista === t.id} className={vistaLista === t.id ? "on" : ""} onClick={() => setVistaLista(t.id)}>
                  {t.label} <span className="est-subtabs-n">{cuentas[t.id]}</span>
                </button>
              ))}
            </div>
            <div className="spacer" />
            <input type="search" placeholder="Buscar informe…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar informe" style={{ width: 240 }} />
          </div>
          {error && <div className="modal-error">{error}</div>}
          {filtrados.length === 0 ? (
            <div className="empty">{q.trim() ? "Ningún informe coincide con la búsqueda." : deLista ? "No tienes informes solo para consultar. Al crear uno, elige «Solo para consultar»." : cuentas.consulta ? "No tienes informes para enviar." : "Todavía no tienes informes. Pídele uno a Nova o empieza con una plantilla."}</div>
          ) : (
            <div className="table-scroll">
              <table className="audit-log">
                <thead>
                  {deLista
                    ? <tr><th>Informe</th><th>Fotos automáticas</th><th>Próxima foto</th><th>Con acceso</th><th>Última foto</th><th>Fotos</th><th>Estado</th><th></th></tr>
                    : <tr><th>Informe</th><th>Programación</th><th>Próxima fecha</th><th>Para</th><th>Último envío</th><th>Por enviar</th><th>Estado</th><th></th></tr>}
                </thead>
                <tbody>
                  {visibles.map((r) => {
                    const e = estadoDe(r);
                    return (
                      <tr key={r.id}>
                        <td className="truncate" style={{ maxWidth: 300 }}>
                          <a href={`/informes/${r.id}`} onClick={(ev) => { ev.preventDefault(); router.push(`/informes/${r.id}`); }} style={{ fontWeight: 600, textDecoration: "none" }}><Texto v={r.nombre} /></a>
                        </td>
                        {deLista ? (
                          <>
                            <td className="truncate"><Texto v={r.esBorrador ? "Sin programar" : r.programacionTexto} /></td>
                            <td className="mono" style={{ whiteSpace: "nowrap" }}>{r.proximaFecha ? fmtFechaCorta(r.proximaFecha.fecha) : <span className="muted">—</span>}</td>
                            <td>{(r.contexto?.acceso || []).length ? `${r.contexto.acceso.length} persona(s)` : <span className="muted">Solo tú</span>}</td>
                            <td className="mono" style={{ whiteSpace: "nowrap" }}>{r.ultimaFotoAt ? fmtFechaCorta(r.ultimaFotoAt) : <span className="muted">Nunca</span>}</td>
                            <td>{r.totalFotos ? <a href={`/informes/${r.id}?tab=fotos`} onClick={(ev) => { ev.preventDefault(); router.push(`/informes/${r.id}?tab=fotos`); }} className="est-chip" style={{ textDecoration: "none" }} title="Ver fotos guardadas">{r.totalFotos} foto(s)</a> : <span className="muted">0</span>}</td>
                          </>
                        ) : (
                          <>
                            <td className="truncate"><Texto v={r.esBorrador ? "Sin programar" : r.programacionTexto} /></td>
                            <td className="mono" style={{ whiteSpace: "nowrap" }}>{r.proximaFecha ? fmtFechaCorta(r.proximaFecha.fecha) : <span className="muted">—</span>}</td>
                            <td>{r.destinatarios?.length ? `${r.destinatarios.length} persona(s)` : <span className="muted">—</span>}</td>
                            <td className="mono" style={{ whiteSpace: "nowrap" }}>{r.ultimoEnvioAt ? fmtFechaCorta(r.ultimoEnvioAt) : <span className="muted">Nunca</span>}</td>
                            <td>{r.porEnviar ? <a href={`/informes/${r.id}?tab=ediciones`} onClick={(ev) => { ev.preventDefault(); router.push(`/informes/${r.id}?tab=ediciones`); }} className="est-chip warn" style={{ textDecoration: "none" }} title="Ver en el historial de envíos">{r.porEnviar} por enviar</a> : <span className="muted">0</span>}</td>
                          </>
                        )}
                        <td>
                          {r.tipo === "estudio" && !r.esBorrador ? (
                            <label className="est-switch" title={deLista ? (r.activo ? "Guarda fotos automáticas a su hora. Apágalo para pausarlas (las fotos se conservan)." : "Sin fotos automáticas. Enciéndelo para que vuelvan a guardarse a su hora.") : r.activo ? "Se genera a su hora. Apágalo para que deje de generarse (el historial se conserva)." : "No se genera. Enciéndelo para que vuelva a generarse a su hora."}>
                              <input type="checkbox" role="switch" checked={!!r.activo} onChange={() => alternarActivo(r)} aria-label={`${r.activo ? "Desactivar" : "Activar"} ${r.nombre}`} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: r.activo ? "var(--good)" : "var(--muted)" }}>{r.activo ? "Activo" : "Inactivo"}</span>
                            </label>
                          ) : (
                            <span className={`est-chip ${e.cls}`}>{e.label}</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          {borrando === r.id ? (
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <span className="muted" style={{ fontSize: 12 }}>¿Eliminar?</span>
                              <button type="button" className="btn small btn-danger-solid" onClick={() => borrar(r.id)}>Sí</button>
                              <button type="button" className="btn small" onClick={() => setBorrando(null)}>No</button>
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button type="button" className="btn small" onClick={() => router.push(`/informes/${r.id}${esConsulta(r) ? "?tab=ver" : ""}`)}>{esConsulta(r) ? "Ver" : "Abrir"}</button>
                              <button
                                type="button" className="btn small btn-ghost" aria-label={`Eliminar ${r.nombre}`}
                                disabled={r.totalEnvios > 0}
                                title={r.totalEnvios > 0 ? `Tiene ${r.totalEnvios} envío(s) en su historial: no se puede eliminar, solo desactivar.` : "Eliminar (no tiene envíos)"}
                                onClick={() => setBorrando(r.id)}
                              ><IconTrash size={13} /></button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-footer">
            <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <label style={{ marginBottom: 0 }}>Tamaño</label>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ width: "auto" }}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="page-btns">
              <button type="button" className="btn small" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button>
              <button type="button" className="btn small" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Siguiente</button>
            </div>
            <span className="count-note">Página {current} de {totalPages}</span>
            <div className="spacer" />
            <span className="count-note">{filtrados.length} informe(s) {deLista ? "para consultar" : "para enviar"}</span>
          </div>
        </section>

        <aside className="est-side" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: porEnviar.length ? "color-mix(in srgb, var(--warning) 50%, var(--border))" : undefined }} aria-labelledby="porenviar-t">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 id="porenviar-t" style={{ fontSize: 15 }}>Listos para que los envíes</h2>
              {porEnviar.length > 0 && <span className="est-chip warn">{porEnviar.length}</span>}
            </div>
            {porEnviar.length === 0 ? (
              <p className="est-sub" style={{ margin: 0 }}>Nada pendiente. Cuando un informe programado se genere, aparecerá aquí y en Mi día.</p>
            ) : (
              <ul className="est-lista">
                {porEnviar.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <span className="est-pdf-thumb" aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: 13.5 }} className="truncate"><Texto v={e.reportNombre} /></strong>
                      <span className="muted" style={{ fontSize: 12 }}>{e.periodoLabel} · {e.origen === "prueba" ? "prueba" : `para ${e.destinatarios.length} persona(s)`}</span>
                    </span>
                    <button type="button" className="btn small btn-primary" onClick={() => setEnviar(e.id)}><IconMail size={12} /> Enviar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="prox-t">
            <h2 id="prox-t" style={{ fontSize: 15 }}>Próximas generaciones</h2>
            {proximas.length === 0 ? (
              <p className="est-sub" style={{ margin: 0 }}>Ningún informe programado todavía.</p>
            ) : (
              <ol className="est-lista">
                {proximas.map((r) => {
                  const d = new Date(r.proximaFecha.fecha);
                  return (
                    <li key={r.id}>
                      <span className="est-fecha">{d.getDate()} {d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}</span>
                      <span style={{ fontSize: 13, minWidth: 0 }}>
                        <span className="truncate" style={{ display: "block" }}><Texto v={r.nombre} /></span>
                        <span className="muted" style={{ fontSize: 12 }}>{d.toLocaleDateString("es-CO", { weekday: "long" })} {d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}{r.proximaFecha.nota ? ` · ${r.proximaFecha.nota}` : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="est-card" style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "var(--surface-2)" }} aria-label="Estado del correo automático">
            <IconClock size={16} />
            <p className="est-sub" style={{ margin: 0 }}>
              <strong style={{ color: "var(--ink)" }}>Correo automático en espera de IT.</strong> Mientras tanto, los informes se generan a su hora y tú los envías desde Outlook con un clic. El envío por Microsoft Teams llegará próximamente.
            </p>
          </section>
        </aside>
      </div>

      {plantillaSel && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlantillaSel(null); }}>
          <form className="modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-labelledby="pl-t" onSubmit={(e) => { e.preventDefault(); crearDesdePlantilla(); }}>
            <div className="modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={`est-mini est-mini-${plantillaSel.clave}`} aria-hidden="true" style={{ width: 44, height: 44 }}><MiniGrafico clave={plantillaSel.clave} /></span>
                <div>
                  <h3 id="pl-t" style={{ fontFamily: "Nunito, sans-serif" }}>Nuevo informe</h3>
                  <p className="est-sub" style={{ margin: 0 }}>{plantillaSel.clave ? <>Desde la plantilla «{plantillaSel.nombre}»</> : "En blanco"}</p>
                </div>
              </div>
              <button type="button" className="btn btn-ghost est-ghost" onClick={() => setPlantillaSel(null)} aria-label="Cerrar">✕</button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="field">
                <label htmlFor="pl-nombre">Nombre del informe</label>
                <input id="pl-nombre" autoFocus maxLength={120} value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} aria-invalid={nombreRepetido} style={nombreRepetido ? { borderColor: "var(--critical)" } : undefined} />
              </div>
              {nombreRepetido
                ? <span className="modal-error">Ya tienes un informe llamado así. Escribe otro nombre.</span>
                : <span className="muted" style={{ fontSize: 12 }}>{plantillaSel.descripcion} Podrás cambiar todo después.</span>}
              <div className="field" style={{ marginTop: 8 }}>
                <label>¿Para qué es?</label>
                <SelectorProposito valor={propositoNuevo} onChange={setPropositoNuevo} />
              </div>
            </div>
            <div className="modal-foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => setPlantillaSel(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={!nombreNuevo.trim() || nombreRepetido}>Aceptar</button>
            </div>
          </form>
        </div>
      )}

      {enviar && (
        <EnviarInformeModal
          edicionId={enviar}
          onClose={() => setEnviar(null)}
          onEnviado={() => refrescarPorEnviar()}
        />
      )}
    </div>
  );
}
