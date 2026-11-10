"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { tesConciliacion, tesImportarExtracto, tesDesenlazar } from "@/lib/tesoreriaApi";
import { crossfade } from "@/lib/crossfade";
import { Paginacion } from "@/components/notificaciones/ui";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import { IconSpark, IconCheck, IconArrowRight, IconAlert, IconFile, IconClock } from "@/components/icons";
import { Celda, fechaCorta, useCatalogos, Aviso, SelectorPeriodo, anioActual, mesActual, MESES } from "@/components/tesoreria/comun";

const PAGE_SIZES = [10, 25, 50, 100];
const PASOS = ["Sube el extracto del banco", "El agente cruza y analiza", "Apruebas las diferencias", "Listo: revisa los reportes"];
const MENSAJES = ["Leyendo el extracto…", "Cruzando cada línea con el libro…", "Enlazando lo que coincide sin dudas…", "Nova revisa las diferencias…", "Preparando las propuestas…"];
const CONF = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" };
const TIPO = { sugerencia: "Coincidencia por confirmar", soloBanco: "Solo en el banco", soloLibro: "Solo en el libro" };

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
const correrAgente = (cuentaId, anio, mes) => api("/api/tesoreria/conciliacion/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cuentaId, anio, mes }) });
const verAgente = (job) => api(`/api/tesoreria/conciliacion/agente?job=${job}`, { cache: "no-store" });
const aprobar = (decisiones) => api("/api/tesoreria/conciliacion/agente/aprobar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisiones }) });

// Qué se mandará a aplicar para una decisión (con los cambios que haya hecho la persona).
function aDecision(d, cambio = {}) {
  const p = { ...d.propuesta, ...cambio };
  return {
    ref: d.ref, accion: p.accion,
    lineaId: d.linea?.id, movimientoId: d.tipo === "soloLibro" ? d.mov.id : p.candidatoId,
    conceptoId: p.conceptoId ? Number(p.conceptoId) : null, itemId: p.itemId ? Number(p.itemId) : null, pagadorId: p.pagadorId ? Number(p.pagadorId) : null,
  };
}

function Tarjeta({ d, cat, cambio, onCambio, estado, onAprobar, onRechazar, ocupado, puede }) {
  const p = { ...d.propuesta, ...cambio };
  const conf = p.confianza || "baja";
  const banco = d.linea;
  const candidato = d.candidatos.find((c) => c.id === Number(p.candidatoId));
  const conceptoNombre = cat?.conceptos.find((c) => c.id === Number(p.conceptoId))?.nombre;
  const valido = !(p.accion === "crear" && !p.conceptoId) && !(p.accion === "enlazar" && !p.candidatoId);
  return (
    <li className={`ag-propuesta tca-tarjeta conf-${conf}${estado ? ` tca-${estado}` : ""}`}>
      <div className="ag-prop-compra">
        <span className="ag-etiqueta">{TIPO[d.tipo]}</span>
        {banco ? (
          <>
            <strong className="tca-desc"><Celda v={`${banco.descripcion}${banco.tercero ? ` · ${banco.tercero}` : ""}`} ancha /></strong>
            <span className="ag-prop-meta"><IconClock size={12} /> {fechaCorta(banco.fecha)} <b className={banco.valor < 0 ? "tes-neg" : "tes-pos"}>{banco.valorTexto}</b></span>
            {banco.etiqueta && <span className="ag-prop-meta">En el Excel decía: <b>{banco.etiqueta}</b></span>}
          </>
        ) : (
          <>
            <strong className="tca-desc"><Celda v={d.mov.concepto} ancha /></strong>
            <span className="ag-prop-meta"><IconClock size={12} /> {fechaCorta(d.mov.fecha)}{d.mov.fechaAproximada ? " (solo el mes)" : ""} <b>{d.mov.valorTexto}</b></span>
            <span className="ag-prop-meta">{[d.mov.item, d.mov.tercero].filter(Boolean).join(" · ") || "Del libro"}</span>
          </>
        )}
      </div>
      <span className="ag-flecha" aria-hidden="true"><IconArrowRight size={15} /></span>
      <div className="ag-prop-actividad">
        <span className="ag-etiqueta">Propuesta del agente</span>
        {estado ? (
          <strong>{{ enlazar: `Enlazar con «${candidato?.concepto || "el movimiento"}»`, crear: `Crear «${conceptoNombre || "movimiento"}»`, ignorar: "No es un movimiento", mover: "Pasar al mes siguiente", pendiente: "Dejar pendiente" }[p.accion]}</strong>
        ) : (
          <div className="tca-editar">
            <select aria-label="Qué hacer" value={p.accion} onChange={(e) => onCambio({ accion: e.target.value })} disabled={!puede}>
              {d.tipo === "sugerencia" && <><option value="enlazar">Enlazar con el libro</option><option value="pendiente">Dejar pendiente</option></>}
              {d.tipo === "soloBanco" && <><option value="crear">Crear el movimiento</option><option value="ignorar">No es un movimiento</option><option value="pendiente">Dejar pendiente</option></>}
              {d.tipo === "soloLibro" && <><option value="mover">Pasar al mes siguiente</option><option value="pendiente">Dejar pendiente</option></>}
            </select>
            {p.accion === "enlazar" && (
              <select aria-label="Movimiento del libro" value={p.candidatoId || ""} onChange={(e) => onCambio({ candidatoId: Number(e.target.value) })} disabled={!puede}>
                <option value="">Elige el movimiento…</option>
                {d.candidatos.map((c) => <option key={c.id} value={c.id}>{c.concepto} · {fechaCorta(c.fecha)} · {c.valorTexto}</option>)}
              </select>
            )}
            {p.accion === "crear" && (
              <select aria-label="Concepto" value={p.conceptoId || ""} onChange={(e) => { const c = cat.conceptos.find((x) => x.id === Number(e.target.value)); onCambio({ conceptoId: Number(e.target.value), itemId: c?.itemId || null }); }} disabled={!puede}>
                <option value="">Elige el concepto…</option>
                {cat?.conceptos.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
      <div className="ag-prop-razon">
        <span className={`tca-conf ${conf}`}>{d.propuesta.deNova && !Object.keys(cambio || {}).length ? <IconSpark size={11} /> : null} {Object.keys(cambio || {}).length ? "Cambiado por ti" : CONF[conf]}</span>
        <span>{p.explicacion}</span>
      </div>
      <div className="ag-prop-acciones">
        {estado === "aprobada" && <span className="ag-resuelta"><span className="tca-ok"><IconCheck size={13} /> Aplicada</span></span>}
        {estado === "rechazada" && <span className="ag-resuelta">Descartada<small>queda pendiente</small></span>}
        {estado === "error" && <span className="ag-resuelta tca-error">No se aplicó<small>{cambio?._error}</small></span>}
        {(!estado || estado === "error") && puede && (
          <>
            <button type="button" className="btn btn-primary small" onClick={onAprobar} disabled={ocupado || !valido}><IconCheck size={13} /> Aprobar</button>
            <button type="button" className="btn small" onClick={onRechazar} disabled={ocupado}>Descartar</button>
          </>
        )}
      </div>
    </li>
  );
}

export default function ConciliacionTesoreria({ acceso }) {
  const { cat } = useCatalogos();
  const puede = !!acceso?.puedeRegistrar;
  const [cuentaId, setCuentaId] = useState(null);
  const [periodo, setPeriodo] = useState({ anio: anioActual(), mes: mesActual() });
  const [estadoMes, setEstadoMes] = useState(null);
  const [fase, setFase] = useState("inicio"); // inicio | corriendo | resultados
  const [segundos, setSegundos] = useState(0);
  const [res, setRes] = useState(null);
  const [cambios, setCambios] = useState({});
  const [estados, setEstados] = useState({});
  const [filtro, setFiltro] = useState("pendientes");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const sondeo = useRef(null);

  useEffect(() => { if (cat && !cuentaId) setCuentaId((cat.cuentas.find((c) => c.activo && c.formatoExtracto) || cat.cuentas[0])?.id || null); }, [cat, cuentaId]);
  const cuenta = cat?.cuentas.find((c) => c.id === cuentaId);
  const nombreMes = `${MESES[periodo.mes - 1]} ${periodo.anio}`;

  const cargarMes = useCallback(async () => {
    if (!cuentaId) return;
    try { setEstadoMes(await tesConciliacion(cuentaId, periodo.anio, periodo.mes)); setError(""); } catch (e) { setError(e.message); }
  }, [cuentaId, periodo]);
  useEffect(() => { cargarMes(); }, [cargarMes]);
  useEffect(() => () => clearInterval(sondeo.current), []);
  useEffect(() => { setPage(1); }, [filtro, size, res]);

  // Cambiar de cuenta o de mes empieza de nuevo (lo que se propuso era de la otra cuenta o mes).
  const reiniciar = () => { clearInterval(sondeo.current); setFase("inicio"); setRes(null); setCambios({}); setEstados({}); };
  const cambiarPeriodo = (p) => { reiniciar(); setPeriodo(p); };
  const cambiarCuenta = (id) => { reiniciar(); setCuentaId(id); };

  async function lanzar(anio = periodo.anio, mes = periodo.mes) {
    setError(""); setFase("corriendo"); setSegundos(0); setCambios({}); setEstados({});
    try {
      const { jobId } = await correrAgente(cuentaId, anio, mes);
      clearInterval(sondeo.current);
      sondeo.current = setInterval(async () => {
        try {
          const t = await verAgente(jobId);
          setSegundos(t.segundos);
          if (t.estado === "listo") { clearInterval(sondeo.current); setRes(t.resultado); setFase("resultados"); cargarMes(); }
          if (t.estado === "error") { clearInterval(sondeo.current); setError(t.error); setFase("inicio"); }
        } catch (e) { clearInterval(sondeo.current); setError(e.message); setFase("inicio"); }
      }, 1500);
    } catch (e) { setError(e.message); setFase("inicio"); }
  }

  async function subir(file) {
    if (!file || !cuentaId) return;
    setError(""); setFase("corriendo"); setSegundos(0);
    try {
      const r = await tesImportarExtracto(cuentaId, file);
      setAviso(`Extracto leído: ${r.nuevas} línea(s) nuevas${r.repetidas ? `, ${r.repetidas} ya estaban` : ""}.`);
      // El agente trabaja sobre el mes del extracto (el último que trae).
      const [a, m] = (r.hasta || `${periodo.anio}-${periodo.mes}`).split("-").map(Number);
      if (a !== periodo.anio || m !== periodo.mes) setPeriodo({ anio: a, mes: m });
      lanzar(a, m);
    } catch (e) { setError(e.message); setFase("inicio"); }
  }

  async function aplicar(lista) {
    if (!lista.length) return;
    setOcupado(true); setError("");
    try {
      const r = await aprobar(lista.map((d) => aDecision(d, cambios[d.ref])));
      const nuevos = { ...estados };
      const nuevosCambios = { ...cambios };
      for (const x of r.resultados) {
        nuevos[x.ref] = x.ok ? "aprobada" : "error";
        if (!x.ok) nuevosCambios[x.ref] = { ...(nuevosCambios[x.ref] || {}), _error: x.error };
      }
      setEstados(nuevos); setCambios(nuevosCambios);
      setAviso(`${r.aplicadas} de ${lista.length} aplicada(s).`);
      cargarMes();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }

  const decisiones = res?.decisiones || [];
  const pendientes = decisiones.filter((d) => !estados[d.ref] || estados[d.ref] === "error");
  const altas = pendientes.filter((d) => (cambios[d.ref]?.confianza || d.propuesta.confianza) === "alta" && !(d.propuesta.accion === "crear" && !d.propuesta.conceptoId));
  const lista = useMemo(() => decisiones.filter((d) => {
    const e = estados[d.ref];
    if (filtro === "pendientes") return !e || e === "error";
    if (filtro === "aprobadas") return e === "aprobada";
    if (filtro === "descartadas") return e === "rechazada";
    return (!e || e === "error") && (d.propuesta.confianza || "baja") === filtro;
  }), [decisiones, estados, filtro]);
  const pagina = lista.slice((page - 1) * size, page * size);
  const r = estadoMes?.resumen;
  const pct = r?.lineas ? Math.round((r.enlazadas / r.lineas) * 100) : 0;
  const firmado = !!estadoMes?.firmado;
  const paso = fase === "corriendo" ? 1 : fase === "resultados" ? (pendientes.length ? 2 : 3) : 0;
  const msg = MENSAJES[Math.min(MENSAJES.length - 1, Math.floor(segundos / 4))];

  return (
    <div className="tes-vista tca">
      <CabezaAgente icono={<IconSpark size={22} />} color="verde" titulo="Agente de conciliación"
        descripcion="Sube el extracto del banco. El agente enlaza solo lo que coincide sin dudas y te trae únicamente las diferencias, cada una con su propuesta y su porqué. Nada se aplica sin tu aprobación."
        pasos={PASOS} paso={paso}>
        <SelectorPeriodo anio={periodo.anio} mes={periodo.mes} onCambio={(p) => cambiarPeriodo({ anio: p.anio, mes: p.mes || periodo.mes })} id="tca" />
      </CabezaAgente>

      <div className="tca-cuentas" role="tablist" aria-label="Cuenta">
        {(cat?.cuentas || []).filter((c) => c.activo).map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cuentaId === c.id} className={`tca-cuenta${cuentaId === c.id ? " activa" : ""}`} onClick={() => crossfade(() => cambiarCuenta(c.id))}>
            <strong>{c.nombre}</strong><small>{c.moneda}{c.formatoExtracto ? " · con extracto" : ""}</small>
          </button>
        ))}
      </div>

      {error && <p className="modal-error">{error}</p>}
      {firmado && <p className="ag-aviso"><IconCheck size={15} /> {nombreMes} ya está firmado por {estadoMes.firmado.por}: es de solo lectura.</p>}

      {fase === "inicio" && !estadoMes && !error && <div className="tca-inicio" aria-hidden="true"><div className="skeleton-bar" style={{ height: 230, borderRadius: 20 }} /><div className="skeleton-bar" style={{ height: 230, borderRadius: 20 }} /></div>}
      {fase === "inicio" && estadoMes && !firmado && (
        <div className="tca-inicio">
          <label className={`tca-drop${arrastrando ? " sobre" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); puede && subir(e.dataTransfer.files?.[0]); }}>
            <span className="tca-drop-icono" aria-hidden="true"><IconFile size={26} /></span>
            <strong>Suelta aquí el extracto de {cuenta?.nombre || "la cuenta"}</strong>
            <span>Excel o CSV, como lo descargas del portal del banco. El agente arranca solo.</span>
            <span className="btn btn-primary ag-btn-grande">Elegir archivo</span>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={!puede} onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="tca-ya">
            <span className="tca-ya-icono" aria-hidden="true">{estadoMes.tieneExtracto ? <IconCheck size={20} /> : <IconFile size={20} />}</span>
            <div>
              <strong>{estadoMes.tieneExtracto ? `Ya hay extracto de ${nombreMes}` : `Aún no hay extracto de ${nombreMes}`}</strong>
              <span>{estadoMes.tieneExtracto ? `${r.enlazadas} de ${r.lineas} líneas enlazadas · ${r.pendientes} diferencia(s) por resolver · diferencia ${r.diferenciaTexto}` : "Sube el archivo o elige otro mes."}</span>
            </div>
            {puede && estadoMes.tieneExtracto && <button type="button" className="btn btn-primary ag-btn-grande" onClick={() => lanzar()} disabled={!cuentaId}><IconSpark size={16} /> Conciliar con el agente</button>}
          </div>
        </div>
      )}

      {fase === "corriendo" && (
        <div className="tca-corriendo" role="status">
          <div className="tca-orbe" aria-hidden="true"><span /><span /><span /><IconSpark size={26} /></div>
          <strong>{msg}</strong>
          <span>{cuenta?.nombre} · {nombreMes}{segundos ? ` · ${segundos} s` : ""}</span>
          <ol className="tca-fases">
            {["Leer", "Cruzar", "Enlazar", "Revisar con Nova"].map((t, i) => <li key={t} className={Math.floor(segundos / 4) > i ? "hecho" : Math.floor(segundos / 4) === i ? "actual" : ""}>{t}</li>)}
          </ol>
        </div>
      )}

      {fase === "resultados" && res && (
        <>
          <section className="tca-cifras">
            <div className="tca-anillo" style={{ "--p": pct }} role="img" aria-label={`${pct} % de las líneas enlazadas`}>
              <div><strong>{pct}%</strong><small>conciliado</small></div>
            </div>
            <CifraAgente icono={<IconCheck size={18} />} etiqueta="Enlazadas solas" valor={res.enlazadasSolas} nota="Coincidían sin dudas" tono="destaca" />
            <CifraAgente icono={<IconAlert size={18} />} etiqueta="Para aprobar" valor={pendientes.length} nota={`de ${decisiones.length} diferencia(s)`} />
            <CifraAgente icono={<IconSpark size={18} />} etiqueta="Diferencia del mes" valor={r?.diferenciaTexto || "—"} nota={Math.abs(r?.diferencia || 0) < 0.5 ? "Cuadra con el banco" : "Banco menos libro"} pequena />
          </section>

          {res.resumenNova && <p className="ag-aviso tca-nova"><IconSpark size={15} /> <span>{res.resumenNova}</span></p>}

          {puede && altas.length > 0 && (
            <div className="ag-lote">
              <span className="ag-lote-icono" aria-hidden="true"><IconCheck size={18} /></span>
              <div className="ag-lote-txt"><strong>{altas.length} propuesta(s) con confianza alta</strong><small>El agente está seguro de estas. Revisa y apruébalas de una vez.</small></div>
              <div className="ag-lote-acciones"><button type="button" className="btn btn-primary" onClick={() => aplicar(altas)} disabled={ocupado}>{ocupado ? <span className="spinner" /> : <IconCheck size={14} />} Aprobar las {altas.length}</button></div>
            </div>
          )}

          <div className="ag-lista-card">
            <div className="ag-barra-filtros">
              <div className="ag-segmentos" role="tablist" aria-label="Filtro">
                {[["pendientes", "Por aprobar", pendientes.length], ["alta", "Alta", null], ["media", "Media", null], ["baja", "Baja", null], ["aprobadas", "Aplicadas", Object.values(estados).filter((x) => x === "aprobada").length], ["descartadas", "Descartadas", Object.values(estados).filter((x) => x === "rechazada").length]].map(([k, t, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`dash-tab${filtro === k ? " activo" : ""}`} onClick={() => crossfade(() => setFiltro(k))}>{t}{n != null ? <span className="ag-num">{n}</span> : null}</button>
                ))}
              </div>
              <button type="button" className="btn small" onClick={() => lanzar()} disabled={ocupado || !puede}><IconSpark size={13} /> Volver a correr</button>
            </div>
            {lista.length ? (
              <ul className="ag-propuestas">
                {pagina.map((d) => (
                  <Tarjeta key={d.ref} d={d} cat={cat} cambio={cambios[d.ref]} estado={estados[d.ref]} ocupado={ocupado} puede={puede && !firmado}
                    onCambio={(c) => setCambios((x) => ({ ...x, [d.ref]: { ...(x[d.ref] || {}), ...c } }))}
                    onAprobar={() => aplicar([d])} onRechazar={() => setEstados((x) => ({ ...x, [d.ref]: "rechazada" }))} />
                ))}
              </ul>
            ) : (
              <VacioAgente icono={<IconCheck size={26} />} titulo={filtro === "pendientes" ? "No queda nada por aprobar" : "Nada en este filtro"}>
                {filtro === "pendientes" ? (Math.abs(r?.diferencia || 0) < 0.5 ? "La cuenta cuadra con el banco en este mes." : "Lo que descartaste queda pendiente; puedes volver a correr el agente cuando quieras.") : null}
              </VacioAgente>
            )}
            {lista.length > 0 && <Paginacion id="tca-pagesize" page={page} size={size} total={lista.length} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="diferencia(s)" />}
          </div>

          {!pendientes.length && (
            <div className="tca-final">
              <span className="tca-ya-icono" aria-hidden="true"><IconCheck size={20} /></span>
              <div><strong>{cuenta?.nombre} de {nombreMes}: revisado</strong><span>Sigue con las demás cuentas o mira cómo quedó el mes en Reportes.</span></div>
              <Link href="/tesoreria/reportes" className="btn btn-primary">Ver reportes</Link>
            </div>
          )}
        </>
      )}

      {estadoMes?.enlazadas?.length > 0 && <Enlazadas e={estadoMes} puede={puede && !firmado} onCambio={(m) => { setAviso(m); cargarMes(); }} onError={setError} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}

// Lo ya enlazado del mes (por si hay que deshacer algo).
function Enlazadas({ e, puede, onCambio, onError }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const pagina = e.enlazadas.slice((page - 1) * size, page * size);
  return (
    <details className="table-card tca-detalle">
      <summary>Ver las {e.enlazadas.length} línea(s) ya enlazadas de este mes</summary>
      <div className="table-scroll">
        <table className="records tes-tabla">
          <thead><tr><th>Fecha</th><th>Descripción del banco</th><th style={{ textAlign: "right" }}>Valor</th><th>Movimiento</th><th>Cómo</th><th aria-label="Acción" /></tr></thead>
          <tbody>
            {pagina.map((l) => (
              <tr key={l.id}>
                <td>{fechaCorta(l.fecha)}</td>
                <td><Celda v={`${l.descripcion}${l.tercero ? ` · ${l.tercero}` : ""}`} ancha /></td>
                <td style={{ textAlign: "right" }}>{l.valorTexto}</td>
                <td><Celda v={l.movimiento} ancha /></td>
                <td><span className="pill muted">{{ exacto: "Exacto", agrupado: "Agrupado", manual: "Aprobado", creado: "Creado" }[l.como] || l.como}</span></td>
                <td>{puede && <button type="button" className="btn small btn-ghost" onClick={() => tesDesenlazar(l.id).then(() => onCambio("Enlace quitado.")).catch((err) => onError(err.message))}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacion id="tca-enl-pagesize" page={page} size={size} total={e.enlazadas.length} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="línea(s)" />
    </details>
  );
}
