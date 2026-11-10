"use client";

import { useEffect, useState } from "react";
import { IconSpark, IconTrash, IconCopy } from "@/components/icons";
import { PALETA, periodoCorto } from "@/components/informes/estudioUtils";
import { textoAlcance } from "@/components/informes/AlcanceInforme";

// El informe dibujado como una página A4 (mismo contenido y orden que el PDF, ver backend/lib/reportPdf.js).
// Cada sección se puede seleccionar para editarla o pedirle cambios a Nova; las cifras clave y las barras/porciones
// de las gráficas se pueden abrir para ver de dónde sale cada número (ver CifraDrawer.jsx).

const COLORES_ESTADO = { Pendiente: "#fb8500", Proceso: "#00bcd4", Ejecutado: "#60a918", Anulado: "#d14343", Legalizado: "#60a918", Rechazado: "#d14343" };
const color = (etiqueta, i) => COLORES_ESTADO[etiqueta] || PALETA[i % PALETA.length];

const esValoracion = (metrica) => String(metrica || "").startsWith("valoracion");

function fmtValor(v, metrica) {
  if (esValoracion(metrica)) return `${Number(v || 0).toFixed(1).replace(".", ",")} ★`;
  if (metrica === "cantidad") return new Intl.NumberFormat("es-CO").format(v || 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(v || 0);
}

// Columnas, línea o columnas apiladas en el tiempo (eje X = días o meses), con línea punteada de promedio.
const SERIE_OTRAS = "#a2a6ab";
function Columnas({ g, onDato }) {
  const datos = g.datos || [];
  if (!datos.length) return null;
  const W = 560, H = 200, L = 46, T = 14, B = 26;
  const ancho = W - L - 8;
  const alto = H - T - B;
  const max = Math.max(...datos.map((d) => d.valor || 0), 1);
  const paso = ancho / datos.length;
  const bw = Math.max(3, Math.min(30, paso * 0.66));
  const y = (v) => T + alto - (v / max) * alto;
  const cada = Math.max(1, Math.ceil(datos.length / 12));
  const prom = g.promedio && datos.length > 1 ? datos.reduce((s, d) => s + (d.valor || 0), 0) / datos.length : null;
  const series = g.series || [];
  const colorSerie = (n, i) => (n === "Otras" ? SERIE_OTRAS : PALETA[i % PALETA.length]);
  const pts = datos.map((d, i) => [L + paso * i + paso / 2, y(d.valor || 0)]);
  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={datos.map((d) => `${d.etiqueta}: ${fmtValor(d.valor, g.metrica)}`).join(", ")}>
        <defs>
          <linearGradient id="estColGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2063a0" /><stop offset="100%" stopColor="#7fa9d0" /></linearGradient>
          <linearGradient id="estAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2063a0" stopOpacity=".28" /><stop offset="100%" stopColor="#2063a0" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max * i) / 4;
          return (
            <g key={i}>
              <line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke={i ? "#eef1f5" : "#c9d0da"} strokeDasharray={i ? "3 4" : undefined} />
              <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#8795ab">{fmtValor(v, g.metrica)}</text>
            </g>
          );
        })}
        {g.tipo === "linea" ? (
          <>
            <path d={`M${pts[0][0]},${T + alto} ${pts.map(([px, py]) => `L${px},${py}`).join(" ")} L${pts[pts.length - 1][0]},${T + alto} Z`} fill="url(#estAreaGrad)" />
            <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#2063a0" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r="3.4" fill="#fff" stroke="#0a9fbd" strokeWidth="2" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onDato?.(datos[i]); }}>
                <title>{`${datos[i].etiqueta}: ${fmtValor(datos[i].valor, g.metrica)}`}</title>
              </circle>
            ))}
          </>
        ) : datos.map((d, i) => {
          const x = L + paso * i + (paso - bw) / 2;
          if (g.tipo === "apiladas") {
            let acc = 0;
            return (
              <g key={i} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onDato?.(d); }}>
                <title>{`${d.etiqueta}: ${fmtValor(d.valor, g.metrica)}`}</title>
                {(d.segmentos || []).map((sg, si) => {
                  if (!sg.valor) return null;
                  const yTop = y(acc + sg.valor);
                  const h = y(acc) - yTop;
                  acc += sg.valor;
                  return <rect key={si} x={x} y={yTop} width={bw} height={Math.max(0, h - 0.6)} fill={colorSerie(sg.nombre, si)}><title>{`${d.etiqueta} · ${sg.nombre}: ${fmtValor(sg.valor, g.metrica)}`}</title></rect>;
                })}
              </g>
            );
          }
          const h = Math.max(1, T + alto - y(d.valor || 0));
          return (
            <g key={i} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onDato?.(d); }}>
              <title>{`${d.etiqueta}: ${fmtValor(d.valor, g.metrica)}`}</title>
              <rect x={x} y={T + alto - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill="url(#estColGrad)" />
              {datos.length <= 14 && <text x={x + bw / 2} y={T + alto - h - 4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#132a46">{fmtValor(d.valor, g.metrica)}</text>}
            </g>
          );
        })}
        {prom != null && (
          <g>
            <line x1={L} x2={W - 8} y1={y(prom)} y2={y(prom)} stroke="#fb8500" strokeWidth="1.3" strokeDasharray="5 4" />
            <text x={W - 10} y={y(prom) - 4} textAnchor="end" fontSize="9" fontWeight="700" fill="#c46a00">Promedio {fmtValor(prom, g.metrica)}</text>
          </g>
        )}
        {datos.map((d, i) => (i % cada === 0 ? <text key={i} x={L + paso * i + paso / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#5f6680">{d.etiqueta}</text> : null))}
      </svg>
      {g.tipo === "apiladas" && series.length > 0 && (
        <div className="est-leyenda" style={{ flexDirection: "row", flexWrap: "wrap", gap: "4px 14px", marginTop: 4 }}>
          {series.map((n, i) => <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ background: colorSerie(n, i) }} />{n}</span>)}
        </div>
      )}
    </div>
  );
}

function Grafico({ g, onDato }) {
  if (["columnas", "linea", "apiladas"].includes(g.tipo)) return <Columnas g={g} onDato={onDato} />;
  const datos = (g.datos || []).filter((d) => (d.valor || 0) > 0).slice(0, 8);
  if (!datos.length) return null;
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
  if (g.tipo === "dona") {
    let acc = 0;
    const stops = datos.map((d, i) => {
      const a = (acc / total) * 100;
      acc += d.valor;
      return `${color(d.etiqueta, i)} ${a}% ${(acc / total) * 100}%`;
    }).join(", ");
    return (
      <div className="est-dona">
        <span className="est-dona-ring" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label={datos.map((d) => `${d.etiqueta} ${Math.round((d.valor / total) * 100)}%`).join(", ")}>
          <span><strong>{fmtValor(total, g.metrica)}</strong><small style={{ fontSize: 9, color: "#5f6680" }}>total</small></span>
        </span>
        <div className="est-leyenda">
          {datos.map((d, i) => (
            <button key={d.etiqueta} type="button" onClick={(e) => { e.stopPropagation(); onDato?.(d); }} title="Ver de dónde sale esta cifra">
              <i style={{ background: color(d.etiqueta, i) }} />
              <span className="truncate" style={{ maxWidth: 160 }}>{d.etiqueta}</span>
              <b>{fmtValor(d.valor, g.metrica)} · {Math.round((d.valor / total) * 100)}%</b>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const max = esValoracion(g.metrica) ? 5 : Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="est-barras">
      {datos.map((d, i) => (
        <button key={d.etiqueta} type="button" onClick={(e) => { e.stopPropagation(); onDato?.(d); }} title="Ver de dónde sale esta cifra">
          <span className="lbl">{d.etiqueta}</span>
          <span className="track"><span className="est-barra" style={{ display: "block", width: `${Math.max(3, (d.valor / max) * 100)}%`, background: COLORES_ESTADO[d.etiqueta] || undefined, animationDelay: `${i * 0.05}s` }} /></span>
          <span className="val">{fmtValor(d.valor, g.metrica)}</span>
        </button>
      ))}
    </div>
  );
}

const TAMANOS_TABLA = [10, 25, 50, 100];
function Tabla({ t }) {
  const [tam, setTam] = useState(TAMANOS_TABLA[0]);
  const [pag, setPag] = useState(1);
  const larga = t.filas.length > 15;
  const paginas = Math.max(1, Math.ceil(t.filas.length / tam));
  const actual = Math.min(pag, paginas);
  useEffect(() => { setPag(1); }, [tam, t.filas.length]);
  const filas = larga ? t.filas.slice((actual - 1) * tam, actual * tam) : t.filas;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="est-tbl">
        <thead><tr>{t.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>{f.map((v, j) => <td key={j} title={String(v ?? "")}>{v ?? "—"}</td>)}</tr>
          ))}
        </tbody>
        {t.total && <tfoot><tr className="est-tbl-total">{t.total.map((v, j) => <td key={j}>{v}</td>)}</tr></tfoot>}
      </table>
      {larga && (
        <div className="table-footer est-tbl-pie" onClick={(e) => e.stopPropagation()}>
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label style={{ marginBottom: 0 }}>Tamaño</label>
            <select value={tam} onChange={(e) => setTam(Number(e.target.value))} style={{ width: "auto" }}>
              {TAMANOS_TABLA.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={actual <= 1} onClick={() => setPag(actual - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={actual >= paginas} onClick={() => setPag(actual + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {actual} de {paginas}</span>
          <div className="spacer" />
          <span className="count-note">{t.filas.length} fila(s)</span>
        </div>
      )}
    </div>
  );
}

function Herramientas({ bloque, onAccion }) {
  const puedeCambiarTipo = bloque.tipo === "grafico" || bloque.tipo === "cicloProveedores";
  return (
    <div className="est-sec-tools" role="toolbar" aria-label="Acciones de la sección" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => onAccion("nova")}><IconSpark size={13} /> Pedir a Nova</button>
      {puedeCambiarTipo && <button type="button" onClick={() => onAccion("tipo")}>{bloque.estilo === "dona" || (bloque.tipo === "cicloProveedores" && bloque.estilo !== "barras") ? "Ver en barras" : "Ver en dona"}</button>}
      <button type="button" onClick={() => onAccion("subir")} aria-label="Subir sección">↑</button>
      <button type="button" onClick={() => onAccion("bajar")} aria-label="Bajar sección">↓</button>
      <button type="button" onClick={() => onAccion("duplicar")} aria-label="Duplicar sección"><IconCopy size={13} /></button>
      <button type="button" onClick={() => onAccion("eliminar")} aria-label="Eliminar sección"><IconTrash size={13} /></button>
    </div>
  );
}

export default function DocumentoA4({ informe, content, cargando, seleccion, onSeleccion, onAccion, onCifra }) {
  const bloques = informe.bloques || [];
  const secciones = content?.secciones || [];
  const audiencia = informe.contexto?.audiencia;
  const alcance = textoAlcance(informe.contexto?.filtros);
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

  // Las cifras clave seguidas se agrupan en una fila, igual que en el PDF.
  const grupos = [];
  bloques.forEach((b, i) => {
    const ultimo = grupos[grupos.length - 1];
    if (b.tipo === "kpi" && ultimo?.kpis) ultimo.idx.push(i);
    else grupos.push(b.tipo === "kpi" ? { kpis: true, idx: [i] } : { idx: [i] });
  });

  return (
    <article className={`est-a4${cargando && !content ? " cargando" : ""}`} aria-label="Vista del informe">
      <header className="est-a4-head">
        <small>Sinco · Panel de Compras y Bienestar</small>
        <h2>{informe.nombre || "Informe sin título"}</h2>
        <p>{periodoCorto(informe.periodoGeneral)}{audiencia ? ` · Para ${audiencia}` : ""} · {hoy}</p>
        {alcance && <p className="est-a4-alcance">Solo {alcance}</p>}
      </header>
      <div className="est-a4-body">
        {bloques.length === 0 && <p className="muted" style={{ fontSize: 13 }}>El informe está vacío. Agrega una sección desde la derecha o pídele a Nova que lo arme.</p>}
        {grupos.map((g) => {
          if (g.kpis) {
            const enGrupo = g.idx.includes(seleccion);
            return (
              <div key={`k${g.idx[0]}`} className={`est-sec${enGrupo ? " sel" : ""}`} onClick={() => onSeleccion(g.idx[0])}>
                {enGrupo && <Herramientas bloque={bloques[seleccion]} onAccion={onAccion} />}
                <div className="est-kpis" style={{ "--cols": Math.min(4, g.idx.length) }}>
                  {g.idx.map((i) => {
                    const s = secciones[i];
                    const b = bloques[i];
                    return (
                      <button
                        key={i} type="button" className={`est-kpi${seleccion === i ? " sel" : ""}`}
                        onClick={(e) => { e.stopPropagation(); onSeleccion(i); if (s) onCifra({ metrica: b.metrica || "totalValorConIva", titulo: b.titulo || s.titulo }); }}
                        title="Ver de dónde sale esta cifra"
                      >
                        <span>{b.titulo || s?.titulo || "Cifra"}</span>
                        <strong>{s ? s.destacado || "—" : <span className="est-skel" style={{ height: 18, width: "70%", marginTop: 4 }} />}</strong>
                        {s?.variacion?.texto && <em className={s.variacion.delta < 0 ? "baja" : s.variacion.delta > 0 ? "sube" : ""}>{s.variacion.texto}</em>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          const i = g.idx[0];
          const b = bloques[i];
          const s = secciones[i];
          const sel = seleccion === i;
          return (
            <div key={i} className={`est-sec${sel ? " sel" : ""}`} onClick={() => onSeleccion(i)}>
              {sel && <Herramientas bloque={b} onAccion={onAccion} />}
              <h3>{b.titulo || s?.titulo || "Sección"}</h3>
              {!s ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  <span className="est-skel" style={{ height: 10, width: "96%" }} />
                  <span className="est-skel" style={{ height: 10, width: "88%" }} />
                  <span className="est-skel" style={{ height: 10, width: "60%" }} />
                </div>
              ) : (
                <>
                  {s.destacado && b.tipo !== "ia" && b.tipo !== "texto" && <p style={{ fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 15, color: "#2063a0", margin: "4px 0 0" }}>{s.destacado}</p>}
                  {s.contenido && <p>{s.contenido.replace(/^- /gm, "• ")}</p>}
                  {s.grafico?.datos?.length > 0 && (
                    <Grafico
                      g={s.grafico}
                      onDato={(d) => {
                        if (b.tipo !== "grafico" || !s._agruparPor) return;
                        onSeleccion(i);
                        onCifra({ metrica: s.grafico.metrica === "cantidad" ? "totalRegistros" : "totalValorConIva", agruparPor: s._agruparPor, etiqueta: d.etiqueta, titulo: `${b.titulo || s.titulo} · ${d.etiqueta}` });
                      }}
                    />
                  )}
                  {s.tabla?.filas?.length > 0 && <Tabla t={s.tabla} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
