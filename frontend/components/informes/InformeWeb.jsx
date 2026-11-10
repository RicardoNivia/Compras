"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETA, periodoCorto } from "@/components/informes/estudioUtils";
import { textoAlcance } from "@/components/informes/AlcanceInforme";

// Un informe "solo para consultar" visto como una página web interactiva (no como la hoja A4 del PDF): ocupa todo el
// ancho, las cifras clave van en tarjetas grandes, las gráficas se dibujan al ancho real de su tarjeta con un detalle
// al pasar el mouse y se pueden ver de otra forma (barras/dona, columnas/línea) sin cambiar el diseño guardado, y las
// tablas se ordenan por cualquier columna. Mismo contenido que el PDF (content.secciones, en el orden de los bloques).

const PAGE_SIZES = [25, 50, 100];
const COLORES_ESTADO = { Pendiente: "#fb8500", Proceso: "#00bcd4", Ejecutado: "#60a918", Anulado: "#d14343", Legalizado: "#60a918", Rechazado: "#d14343" };
const SERIE_OTRAS = "#a2a6ab";
const color = (etiqueta, i) => COLORES_ESTADO[etiqueta] || PALETA[i % PALETA.length];
const TIEMPO = ["columnas", "linea", "apiladas"];

const esValoracion = (metrica) => String(metrica || "").startsWith("valoracion");
const fmtPuntaje = (v) => `${Number(v || 0).toFixed(1).replace(".", ",")} ★`;

function fmtCorto(v, metrica) {
  if (esValoracion(metrica)) return fmtPuntaje(v);
  if (metrica === "cantidad") return new Intl.NumberFormat("es-CO").format(v || 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(v || 0);
}
function fmtLargo(v, metrica) {
  if (esValoracion(metrica)) return fmtPuntaje(v);
  if (metrica === "cantidad") return new Intl.NumberFormat("es-CO").format(v || 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
}
const pct = (v, total) => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(total ? (v / total) * 100 : 0)} %`;

// Ancho real del contenedor, para dibujar el SVG en píxeles (sin escalar textos).
function useAncho() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function GraficoTiempo({ g, tipo, onDato }) {
  const [ref, W] = useAncho();
  const [hover, setHover] = useState(null);
  const datos = g.datos || [];
  const H = 300, L = 70, R = 16, T = 22, B = 34;
  const ancho = Math.max(10, W - L - R);
  const alto = H - T - B;
  const max = Math.max(...datos.map((d) => d.valor || 0), 1);
  const paso = ancho / Math.max(1, datos.length);
  const bw = Math.max(4, Math.min(46, paso * 0.62));
  const y = (v) => T + alto - (v / max) * alto;
  const cx = (i) => L + paso * i + paso / 2;
  const cada = Math.max(1, Math.ceil(datos.length / Math.max(1, Math.floor(ancho / 74))));
  const prom = g.promedio && datos.length > 1 ? datos.reduce((s, d) => s + (d.valor || 0), 0) / datos.length : null;
  const series = g.series || [];
  const colorSerie = (n, i) => (n === "Otras" ? SERIE_OTRAS : PALETA[i % PALETA.length]);
  const pts = datos.map((d, i) => [cx(i), y(d.valor || 0)]);
  const h = hover != null ? datos[hover] : null;

  return (
    <div ref={ref} className="inf-chart" onMouseLeave={() => setHover(null)}>
      {W > 0 && datos.length > 0 && (
        <svg width={W} height={H} role="img" aria-label={datos.map((d) => `${d.etiqueta}: ${fmtCorto(d.valor, g.metrica)}`).join(", ")}>
          <defs>
            <linearGradient id="infColGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2063a0" /><stop offset="100%" stopColor="#6fa0cf" /></linearGradient>
            <linearGradient id="infAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2063a0" stopOpacity=".3" /><stop offset="100%" stopColor="#2063a0" stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max * i) / 4;
            return (
              <g key={i}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={i ? "inf-grid" : "inf-base"} />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" className="inf-eje">{fmtCorto(v, g.metrica)}</text>
              </g>
            );
          })}
          {hover != null && <line x1={cx(hover)} x2={cx(hover)} y1={T} y2={T + alto} className="inf-guia" />}
          {tipo === "linea" ? (
            <>
              <path d={`M${pts[0][0]},${T + alto} ${pts.map(([px, py]) => `L${px},${py}`).join(" ")} L${pts[pts.length - 1][0]},${T + alto} Z`} fill="url(#infAreaGrad)" />
              <polyline className="inf-linea" points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#2063a0" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={hover === i ? 6 : 3.6} className="inf-punto" />)}
            </>
          ) : datos.map((d, i) => {
            const x = cx(i) - bw / 2;
            const dim = hover != null && hover !== i ? " dim" : "";
            if (tipo === "apiladas" && d.segmentos?.length) {
              let acc = 0;
              return (
                <g key={i} className={`inf-col${dim}`} style={{ animationDelay: `${Math.min(i, 30) * 0.02}s` }}>
                  {d.segmentos.map((sg, si) => {
                    if (!sg.valor) return null;
                    const yTop = y(acc + sg.valor);
                    const hh = y(acc) - yTop;
                    acc += sg.valor;
                    return <rect key={si} x={x} y={yTop} width={bw} height={Math.max(0, hh - 0.8)} fill={colorSerie(sg.nombre, series.indexOf(sg.nombre) >= 0 ? series.indexOf(sg.nombre) : si)} />;
                  })}
                </g>
              );
            }
            const hh = Math.max(1, T + alto - y(d.valor || 0));
            return (
              <g key={i} className={`inf-col${dim}`} style={{ animationDelay: `${Math.min(i, 30) * 0.02}s` }}>
                <rect x={x} y={T + alto - hh} width={bw} height={hh} rx={Math.min(4, bw / 2)} fill="url(#infColGrad)" />
                {datos.length <= 16 && <text x={cx(i)} y={T + alto - hh - 6} textAnchor="middle" className="inf-valor">{fmtCorto(d.valor, g.metrica)}</text>}
              </g>
            );
          })}
          {prom != null && (
            <g>
              <line x1={L} x2={W - R} y1={y(prom)} y2={y(prom)} className="inf-prom" />
              <text x={W - R - 2} y={y(prom) - 6} textAnchor="end" className="inf-prom-t">Promedio {fmtCorto(prom, g.metrica)}</text>
            </g>
          )}
          {datos.map((d, i) => (i % cada === 0 ? <text key={i} x={cx(i)} y={H - 10} textAnchor="middle" className="inf-eje">{d.etiqueta}</text> : null))}
          {/* Zonas de captura: una por columna, para el detalle al pasar el mouse y el clic */}
          {datos.map((d, i) => (
            <rect
              key={`z${i}`} x={L + paso * i} y={T} width={paso} height={alto} fill="transparent"
              style={{ cursor: onDato ? "pointer" : "default" }}
              onMouseEnter={() => setHover(i)} onClick={() => onDato?.(d)}
            />
          ))}
        </svg>
      )}
      {h && (
        <div className="inf-tip" style={{ left: Math.min(Math.max(cx(hover), 90), W - 90), top: Math.max(4, y(h.valor || 0) - 12) }}>
          <strong>{h.etiqueta}</strong>
          <span>{fmtLargo(h.valor, g.metrica)}</span>
          {tipo === "apiladas" && (h.segmentos || []).filter((sg) => sg.valor).map((sg) => (
            <span key={sg.nombre} className="inf-tip-seg"><i style={{ background: colorSerie(sg.nombre, Math.max(0, series.indexOf(sg.nombre))) }} />{sg.nombre}: {fmtCorto(sg.valor, g.metrica)}</span>
          ))}
        </div>
      )}
      {tipo === "apiladas" && series.length > 0 && (
        <div className="inf-leyenda-fila">
          {series.map((n, i) => <span key={n}><i style={{ background: colorSerie(n, i) }} />{n}</span>)}
        </div>
      )}
    </div>
  );
}

function arco(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const largo = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${largo} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${largo} 0 ${x3},${y3} Z`;
}

function GraficoCategorias({ g, tipo, onDato }) {
  const [hover, setHover] = useState(null);
  const datos = (g.datos || []).filter((d) => (d.valor || 0) > 0).slice(0, 12);
  if (!datos.length) return null;
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;

  if (tipo === "dona") {
    const S = 240, c = S / 2;
    let acc = 0;
    const arcos = datos.map((d, i) => {
      const a0 = (acc / total) * Math.PI * 2;
      acc += d.valor;
      const a1 = Math.min((acc / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
      return { d, i, path: arco(c, c, hover === i ? 66 : 70, hover === i ? 118 : 112, a0, a1) };
    });
    const h = hover != null ? datos[hover] : null;
    return (
      <div className="inf-dona" onMouseLeave={() => setHover(null)}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={datos.map((d) => `${d.etiqueta} ${pct(d.valor, total)}`).join(", ")}>
          {arcos.map(({ d, i, path }) => (
            <path
              key={d.etiqueta} d={path} fill={color(d.etiqueta, i)} className={`inf-arco${hover != null && hover !== i ? " dim" : ""}`}
              onMouseEnter={() => setHover(i)} onClick={() => onDato?.(d)} style={{ cursor: onDato ? "pointer" : "default" }}
            />
          ))}
          <text x={c} y={c - 6} textAnchor="middle" className="inf-dona-v">{fmtCorto(h ? h.valor : total, g.metrica)}</text>
          <text x={c} y={c + 14} textAnchor="middle" className="inf-dona-l">{h ? `${pct(h.valor, total)} · ${h.etiqueta.length > 18 ? `${h.etiqueta.slice(0, 17)}…` : h.etiqueta}` : "total"}</text>
        </svg>
        <ul className="inf-leyenda">
          {datos.map((d, i) => (
            <li key={d.etiqueta} className={hover === i ? "on" : ""} onMouseEnter={() => setHover(i)}>
              <button type="button" onClick={() => onDato?.(d)} disabled={!onDato}>
                <i style={{ background: color(d.etiqueta, i) }} />
                <span className="n" title={d.etiqueta}>{d.etiqueta}</span>
                <span className="v">{fmtCorto(d.valor, g.metrica)}</span>
                <span className="p">{pct(d.valor, total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const esVal = esValoracion(g.metrica); // valoración de Nova: escala fija de 1 a 5 y sin % del total
  const max = esVal ? 5 : Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="inf-barras" onMouseLeave={() => setHover(null)}>
      {datos.map((d, i) => (
        <button
          key={d.etiqueta} type="button" className={hover != null && hover !== i ? "dim" : ""}
          onMouseEnter={() => setHover(i)} onClick={() => onDato?.(d)} disabled={!onDato}
          title={esVal ? `${d.etiqueta}: ${fmtLargo(d.valor, g.metrica)}` : `${d.etiqueta}: ${fmtLargo(d.valor, g.metrica)} (${pct(d.valor, total)})`}
        >
          <span className="lbl">{d.etiqueta}</span>
          <span className="track"><span className="fill" style={{ width: `${Math.max(2, (d.valor / max) * 100)}%`, background: COLORES_ESTADO[d.etiqueta] || undefined, animationDelay: `${i * 0.04}s` }} /></span>
          <span className="val">{fmtCorto(d.valor, g.metrica)}</span>
          {!esVal && <span className="pct">{pct(d.valor, total)}</span>}
        </button>
      ))}
    </div>
  );
}

// "$1.234.567", "12,5 %", "45" → número (formato es-CO); si no es número, null.
function comoNumero(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!/^[-−]?\s*\$?\s*[\d.]+(,\d+)?\s*(%|días?)?$/i.test(s)) return null;
  const n = Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function TablaWeb({ t }) {
  const [orden, setOrden] = useState(null); // { col, dir }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const filas = useMemo(() => {
    if (!orden) return t.filas;
    const { col, dir } = orden;
    return [...t.filas].sort((a, b) => {
      const na = comoNumero(a[col]), nb = comoNumero(b[col]);
      const r = na != null && nb != null ? na - nb : String(a[col] ?? "").localeCompare(String(b[col] ?? ""), "es");
      return dir === "asc" ? r : -r;
    });
  }, [t.filas, orden]);
  const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
  const current = Math.min(page, totalPages);
  const visibles = filas.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => { setPage(1); }, [orden, pageSize]);

  function ordenar(col) {
    setOrden((o) => (o?.col === col ? (o.dir === "desc" ? { col, dir: "asc" } : null) : { col, dir: "desc" }));
  }

  return (
    <div className="inf-tabla">
      <div className="table-scroll">
        <table className="audit-log">
          <thead>
            <tr>
              {t.columnas.map((c, j) => (
                <th key={c} aria-sort={orden?.col === j ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inf-th" onClick={() => ordenar(j)} title="Ordenar por esta columna">
                    {c} <span aria-hidden="true">{orden?.col === j ? (orden.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i}>
                {f.map((v, j) => (
                  <td key={j} className={comoNumero(v) != null ? "mono" : ""} style={{ maxWidth: 320 }}>
                    <span className="desc-tooltip-wrap">
                      <span className="desc-text">{v ?? "—"}</span>
                      {String(v ?? "").length > 40 && <span className="desc-tooltip-bubble">{v}</span>}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {t.total && <tfoot><tr className="inf-tabla-total">{t.total.map((v, j) => <td key={j} className={j === t.total.length - 1 ? "mono" : ""}>{v}</td>)}</tr></tfoot>}
        </table>
      </div>
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
        <span className="count-note">{filas.length} fila(s)</span>
      </div>
    </div>
  );
}

// Texto de Nova o escrito a mano: párrafos y viñetas ("- " o "• ").
function TextoWeb({ texto }) {
  const partes = [];
  String(texto || "").split("\n").forEach((linea) => {
    const l = linea.trim();
    if (!l) return;
    const vineta = /^[-•]\s+/.test(l);
    const ultimo = partes[partes.length - 1];
    if (vineta) {
      if (ultimo?.lista) ultimo.items.push(l.replace(/^[-•]\s+/, ""));
      else partes.push({ lista: true, items: [l.replace(/^[-•]\s+/, "")] });
    } else partes.push({ texto: l });
  });
  return (
    <div className="inf-texto">
      {partes.map((p, i) => (p.lista
        ? <ul key={i}>{p.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : <p key={i}>{p.texto}</p>))}
    </div>
  );
}

function Seccion({ b, s, i, onCifra }) {
  const g = s?.grafico;
  const esTiempo = g && TIEMPO.includes(g.tipo);
  const [vista, setVista] = useState(null); // otra forma de ver la gráfica, solo en pantalla
  const tipo = vista || g?.tipo || "barras";
  const opciones = !g?.datos?.length ? [] : esTiempo
    ? (g.tipo === "apiladas" ? [] : [{ v: "columnas", l: "Columnas" }, { v: "linea", l: "Línea" }])
    : [{ v: "barras", l: "Barras" }, { v: "dona", l: "Dona" }];
  const ancha = b.tipo === "ia" || b.tipo === "texto" || (s?.tabla?.filas?.length > 0) || (esTiempo && (g.datos.length > 8 || g.tipo === "apiladas"));
  const onDato = onCifra && b.tipo === "grafico" && s?._agruparPor
    ? (d) => onCifra({ metrica: g.metrica === "cantidad" ? "totalRegistros" : "totalValorConIva", agruparPor: s._agruparPor, etiqueta: d.etiqueta, titulo: `${b.titulo || s.titulo} · ${d.etiqueta}` })
    : null;

  return (
    <section id={`inf-sec-${i}`} className={`inf-card${ancha ? " ancha" : ""}`} aria-labelledby={`inf-sec-t-${i}`}>
      <header className="inf-card-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`inf-sec-t-${i}`}>{b.titulo || s?.titulo || "Sección"}</h2>
          {s?.destacado && b.tipo !== "ia" && b.tipo !== "texto" && <p className="inf-destacado">{s.destacado}</p>}
        </div>
        <div className="spacer" />
        {opciones.length > 1 && (
          <div className="est-subtabs" role="group" aria-label="Ver la gráfica como">
            {opciones.map((o) => (
              <button key={o.v} type="button" className={tipo === o.v ? "on" : ""} aria-pressed={tipo === o.v} onClick={() => setVista(o.v === g.tipo ? null : o.v)}>{o.l}</button>
            ))}
          </div>
        )}
      </header>
      {!s ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="est-skel" style={{ height: 12, width: "96%" }} />
          <span className="est-skel" style={{ height: 12, width: "84%" }} />
          <span className="est-skel" style={{ height: 120, width: "100%" }} />
        </div>
      ) : (
        <>
          {s.contenido && <TextoWeb texto={s.contenido} />}
          {g?.datos?.length > 0 && (esTiempo && tipo !== "barras" && tipo !== "dona"
            ? <GraficoTiempo key={tipo} g={g} tipo={tipo} onDato={onDato} />
            : <GraficoCategorias key={tipo} g={g} tipo={tipo} onDato={onDato} />)}
          {s.tabla?.filas?.length > 0 && <TablaWeb t={s.tabla} />}
          {!s.contenido && !g?.datos?.length && !s.tabla?.filas?.length && !s.destacado && <p className="muted" style={{ margin: 0 }}>Sin datos para este período.</p>}
        </>
      )}
    </section>
  );
}

export default function InformeWeb({ informe, content, cargando, generadoAt, acciones, subtitulo, onCifra }) {
  const bloques = informe.bloques || [];
  const secciones = content?.secciones || [];
  const audiencia = informe.contexto?.audiencia;
  const alcance = textoAlcance(informe.contexto?.filtros);

  // Las cifras clave seguidas forman una franja de tarjetas grandes; el resto, tarjetas en una cuadrícula.
  const grupos = [];
  bloques.forEach((b, i) => {
    const ultimo = grupos[grupos.length - 1];
    if (b.tipo === "kpi" && ultimo?.kpis) ultimo.idx.push(i);
    else grupos.push(b.tipo === "kpi" ? { kpis: true, idx: [i] } : { idx: [i] });
  });
  const indice = grupos.filter((g) => !g.kpis).map((g) => ({ i: g.idx[0], t: bloques[g.idx[0]].titulo || secciones[g.idx[0]]?.titulo || "Sección" }));

  return (
    <article className={`inf-web${cargando && content ? " actualizando" : ""}`} aria-label={informe.nombre || "Informe"}>
      <header className="inf-hero">
        <div style={{ minWidth: 0 }}>
          <small>Sinco · Panel de Compras y Bienestar</small>
          <h1>{informe.nombre || "Informe sin título"}</h1>
          <p>
            {periodoCorto(informe.periodoGeneral)}{alcance ? ` · Solo ${alcance}` : ""}{audiencia ? ` · Para ${audiencia}` : ""}{subtitulo ? ` · ${subtitulo}` : ""}
            {generadoAt && !cargando && <> · Datos al {new Date(generadoAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
            {cargando && <> · <span className="spinner" style={{ width: 11, height: 11, verticalAlign: -1 }} /> Calculando con los datos de hoy…</>}
          </p>
        </div>
        <div className="spacer" />
        {acciones && <div className="inf-hero-acciones">{acciones}</div>}
      </header>

      {indice.length > 3 && (
        <nav className="inf-indice" aria-label="Secciones del informe">
          {indice.map((x) => (
            <a key={x.i} href={`#inf-sec-${x.i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`inf-sec-${x.i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{x.t}</a>
          ))}
        </nav>
      )}

      {bloques.length === 0 && <div className="empty">Este informe todavía no tiene secciones.</div>}

      <div className="inf-grid">
        {grupos.map((g) => {
          if (!g.kpis) {
            const i = g.idx[0];
            return <Seccion key={i} b={bloques[i]} s={secciones[i]} i={i} onCifra={onCifra} />;
          }
          return (
            <div key={`k${g.idx[0]}`} className="inf-kpis">
              {g.idx.map((i) => {
                const s = secciones[i];
                const b = bloques[i];
                const Tag = onCifra && s ? "button" : "div";
                return (
                  <Tag
                    key={i} {...(Tag === "button" ? { type: "button", onClick: () => onCifra({ metrica: b.metrica || "totalValorConIva", titulo: b.titulo || s.titulo }), title: "Ver de dónde sale esta cifra" } : {})}
                    className="inf-kpi"
                  >
                    <span className="t">{b.titulo || s?.titulo || "Cifra"}</span>
                    <strong>{s ? s.destacado || "—" : <span className="est-skel" style={{ height: 26, width: "70%", display: "block" }} />}</strong>
                    {s?.variacion?.texto && <em className={s.variacion.delta < 0 ? "baja" : s.variacion.delta > 0 ? "sube" : ""}>{s.variacion.texto}</em>}
                  </Tag>
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}
