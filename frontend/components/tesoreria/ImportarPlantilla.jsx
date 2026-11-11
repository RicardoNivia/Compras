"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { tesAnalizarPlantilla, tesAplicarPlantilla } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { MESES_CORTOS, PERIODICIDADES, TipoPago, Dinero } from "@/components/tesoreria/comun";

const PAGE_SIZES = [10, 25, 50, 100];
const PASOS = ["Subir el archivo", "Elegir pestañas", "Gastos periódicos", "Revisar y cargar"];
const mesesTexto = (m) => (m.length === 12 ? "Ene–Dic (12)" : `${m.map((x) => MESES_CORTOS[x - 1]).join(", ")} (${m.length})`);

// Importar la plantilla de Excel en 4 pasos: subir → elegir qué pestañas son de banco (y a qué banco van) y cuál es de
// pagos → confirmar los gastos periódicos con su periodicidad y día de corte → revisar y cargar. Nada se escribe hasta
// el último paso; volver a subirla no duplica.
export default function ImportarPlantilla({ acceso }) {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);
  const [a, setA] = useState(null);
  const [selBanco, setSelBanco] = useState({});
  const [destino, setDestino] = useState({}); // hoja → { bancoId, nombre }
  const [selPagos, setSelPagos] = useState({});
  const [per, setPer] = useState({}); // `${hoja}|${clave}` → { sel, periodicidad, diaCorte }
  const [diaTodos, setDiaTodos] = useState("5");
  const [pPage, setPPage] = useState(1);
  const [pSize, setPSize] = useState(PAGE_SIZES[0]);
  const [r, setR] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const puede = !!acceso?.puedeRegistrar;

  async function analizar() {
    setOcupado(true); setError("");
    try {
      const x = await tesAnalizarPlantilla(archivo);
      setA(x);
      setSelBanco(Object.fromEntries(x.hojas.filter((h) => h.tipo === "banco").map((h) => [h.nombre, h.preseleccion ? true : h.certeza === "dudoso" ? null : false])));
      setDestino(Object.fromEntries(x.hojas.filter((h) => h.tipo === "banco").map((h) => [h.nombre, { bancoId: h.bancoExistenteId || "", nombre: h.bancoSugerido }])));
      setSelPagos(Object.fromEntries(x.hojas.filter((h) => h.tipo === "pagos").map((h) => [h.nombre, !!h.preseleccion])));
      const p = {};
      for (const h of x.hojas.filter((y) => y.tipo === "pagos")) for (const g of h.periodicos) p[`${h.nombre}|${g.clave}`] = { sel: !g.yaExiste, periodicidad: g.periodicidad, diaCorte: "5" };
      setPer(p);
      setPaso(2);
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  const hojasBanco = a ? a.hojas.filter((h) => h.tipo === "banco") : [];
  const hojasPagos = a ? a.hojas.filter((h) => h.tipo === "pagos") : [];
  const otras = a ? a.hojas.filter((h) => !h.tipo) : [];
  const bancosElegidos = hojasBanco.filter((h) => selBanco[h.nombre] === true);
  const pagosElegidos = hojasPagos.filter((h) => selPagos[h.nombre]);
  const dudasSinResponder = hojasBanco.filter((h) => selBanco[h.nombre] === null);
  const periodicos = useMemo(() => pagosElegidos.flatMap((h) => h.periodicos.map((g) => ({ ...g, hoja: h.nombre, k: `${h.nombre}|${g.clave}` }))), [pagosElegidos]);
  const marcados = periodicos.filter((g) => per[g.k]?.sel && !g.yaExiste);
  const pTotal = Math.max(1, Math.ceil(periodicos.length / pSize));
  const pActual = Math.min(pPage, pTotal);

  async function cargar() {
    setOcupado(true); setError("");
    try {
      const decisiones = {
        bancos: bancosElegidos.map((h) => ({ hoja: h.nombre, bancoId: Number(destino[h.nombre]?.bancoId) || null, nombre: destino[h.nombre]?.nombre })),
        pagos: pagosElegidos.map((h) => ({ hoja: h.nombre })),
        periodicos: marcados.map((g) => ({ hoja: g.hoja, clave: g.clave, periodicidad: per[g.k].periodicidad, diaCorte: Number(per[g.k].diaCorte) || 1 })),
        diaCorteDefecto: Number(diaTodos) || 1,
      };
      setR(await tesAplicarPlantilla(archivo, decisiones));
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }

  const sum = (lista, k) => lista.reduce((s, h) => s + (h[k] || 0), 0);
  if (!puede) return <div className="card"><p className="muted" style={{ margin: 0 }}>Necesitas el permiso «Registrar en Tesorería» para importar la plantilla.</p></div>;
  return (
    <div className="tes-vista">
      <ol className="tes-pasos-imp">
        {PASOS.map((t, i) => <li key={t} className={r ? "hecho" : paso === i + 1 ? "on" : paso > i + 1 ? "hecho" : ""}><span>{r || paso > i + 1 ? "✓" : i + 1}</span>{t}</li>)}
      </ol>
      {error && <p className="modal-error">{error}</p>}

      {paso === 1 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><h3>Sube tu plantilla de Excel</h3><p className="card-sub" style={{ margin: 0 }}>El mismo «Flujo de Caja» que usas hoy (.xlsx o .xls). Se revisa el contenido: sin macros ni fórmulas peligrosas.</p></div>
          <div className="tes-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
            <strong>{archivo ? archivo.name : "Elige el archivo"}</strong>
            <span>{archivo ? `${Math.round(archivo.size / 1024)} KB` : "Toca aquí para buscarlo en tu equipo"}</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          </div>
          <div className="tes-cabecera"><div className="spacer" /><button type="button" className="btn btn-primary" onClick={analizar} disabled={!archivo || ocupado}>{ocupado ? <span className="spinner" /> : null} Analizar el archivo →</button></div>
        </div>
      )}

      {paso === 2 && a && (
        <>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><h3>Pestañas de banco</h3><p className="card-sub" style={{ margin: 0 }}>Cada una son los movimientos de un banco. Elige a qué banco de tus maestros va; si no existe, se crea con el nombre que escribas.</p></div>
            {!hojasBanco.length && <p className="muted" style={{ margin: 0 }}>No encontramos pestañas de banco.</p>}
            {hojasBanco.map((h) => {
              const s = selBanco[h.nombre];
              const d = destino[h.nombre] || {};
              return (
                <div key={h.nombre} className={`tes-hoja${s === true ? " sel" : ""}${h.certeza === "dudoso" && s === null ? " duda" : ""}`}>
                  <div className="tes-hoja-cab">
                    {h.certeza === "seguro" ? (
                      <label className="tes-check"><input type="checkbox" checked={s === true} onChange={() => setSelBanco((x) => ({ ...x, [h.nombre]: x[h.nombre] !== true }))} /><strong>«{h.nombre.trim()}»</strong></label>
                    ) : <strong>«{h.nombre.trim()}»</strong>}
                    <span className={`pill ${h.certeza === "seguro" ? "good" : "warning"}`}>{h.certeza === "seguro" ? "Es de banco" : "¿Es de banco?"}</span>
                    <div className="spacer" />
                    {h.certeza === "dudoso" && (
                      <div className="tes-seg" role="group" aria-label="¿Es pestaña de banco?">
                        <button type="button" className={s === true ? "on" : ""} onClick={() => setSelBanco((x) => ({ ...x, [h.nombre]: true }))}>Sí, es de banco</button>
                        <button type="button" className={s === false ? "on" : ""} onClick={() => setSelBanco((x) => ({ ...x, [h.nombre]: false }))}>No, ignorarla</button>
                      </div>
                    )}
                    {s === true && (
                      <div className="tes-cabecera">
                        <div className="field" style={{ width: 200, margin: 0 }}><label htmlFor={`bd-${h.nombre}`}>Va al banco</label>
                          <select id={`bd-${h.nombre}`} value={d.bancoId || ""} onChange={(e) => setDestino((x) => ({ ...x, [h.nombre]: { ...d, bancoId: e.target.value } }))}>
                            <option value="">+ Banco nuevo</option>{a.bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                          </select>
                        </div>
                        {!d.bancoId && <div className="field" style={{ width: 200, margin: 0 }}><label htmlFor={`bn-${h.nombre}`}>Nombre del banco nuevo</label><input id={`bn-${h.nombre}`} value={d.nombre || ""} onChange={(e) => setDestino((x) => ({ ...x, [h.nombre]: { ...d, nombre: e.target.value } }))} /></div>}
                      </div>
                    )}
                  </div>
                  <div className="tes-datos">
                    <span>Movimientos <b>{h.movimientos.toLocaleString("es-CO")}</b></span><span>Créditos <b>{h.creditos}</b></span><span>Débitos <b>{h.debitos}</b></span>
                    <span>Años <b>{Object.keys(h.anios).sort().join(", ") || "—"}</b></span><span>Saldos reportados <b>{h.saldos}</b></span><span>Fechas dañadas <b>{h.fechasDanadas}</b></span>
                    <span>Nuevos <b>{h.nuevos.toLocaleString("es-CO")}</b></span>{h.yaCargados > 0 && <span>Ya cargados <b>{h.yaCargados.toLocaleString("es-CO")}</b></span>}
                  </div>
                  <span className="card-sub" style={{ margin: 0 }}>{h.motivo} Columnas: {Object.values(h.columnas || {}).join(", ")}.</span>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><h3>Pestañas de pagos programados</h3><p className="card-sub" style={{ margin: 0 }}>Es tu «Detalle»: todos los pagos del año con su estado P o E. Viene marcada la más grande del año más reciente.</p></div>
            {!hojasPagos.length && <p className="muted" style={{ margin: 0 }}>No encontramos pestañas de pagos.</p>}
            {hojasPagos.map((h) => (
              <div key={h.nombre} className={`tes-hoja${selPagos[h.nombre] ? " sel" : ""}`}>
                <div className="tes-hoja-cab">
                  <label className="tes-check"><input type="checkbox" checked={!!selPagos[h.nombre]} onChange={() => setSelPagos((x) => ({ ...x, [h.nombre]: !x[h.nombre] }))} /><strong>«{h.nombre}»</strong></label>
                  <span className={`pill ${h.preseleccion ? "good" : h.certeza === "dudoso" ? "warning" : "muted"}`}>{h.preseleccion ? "La de este año" : h.certeza === "dudoso" ? "Dudosa" : `Año ${h.anio}`}</span>
                </div>
                <div className="tes-datos">
                  <span>Pagos <b>{h.pagos}</b></span><span>Pendientes (P) <b>{h.pendientes}</b></span><span>Pagados (E) <b>{h.pagados}</b></span><span>En 0 <b>{h.enCero}</b></span>
                  <span>Saldos S (no son pagos) <b>{h.saldos.length}</b></span><span>Nuevos <b>{h.nuevos}</b></span>{h.yaCargados > 0 && <span>Ya cargados <b>{h.yaCargados}</b></span>}<span>Gastos periódicos <b>{h.periodicos.length}</b></span>
                </div>
                <span className="card-sub" style={{ margin: 0 }}>{h.motivo}</span>
              </div>
            ))}
            {otras.length > 0 && <details><summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>{otras.length} pestaña(s) que no se cargan (no son de banco ni de pagos)</summary><p className="card-sub" style={{ marginTop: 8 }}>{otras.map((h) => h.nombre).join(" · ")}</p></details>}
          </div>
          {dudasSinResponder.length > 0 && <div className="tes-ayuda"><div>Responde si {dudasSinResponder.map((h) => `«${h.nombre.trim()}»`).join(" y ")} {dudasSinResponder.length > 1 ? "son pestañas" : "es una pestaña"} de banco para seguir.</div></div>}
          <div className="tes-cabecera"><button type="button" className="btn" onClick={() => setPaso(1)}>← Atrás</button><div className="spacer" /><button type="button" className="btn btn-primary" disabled={dudasSinResponder.length > 0 || (!bancosElegidos.length && !pagosElegidos.length)} onClick={() => setPaso(pagosElegidos.length ? 3 : 4)}>Siguiente →</button></div>
        </>
      )}

      {paso === 3 && a && (
        <>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><h3>Gastos periódicos que encontramos</h3><p className="card-sub" style={{ margin: 0 }}>Lo que se repite en 3 o más meses (mismo ítem, concepto, medio de pago y quién paga). Confirma la periodicidad y el <strong>día de corte</strong> (el día del mes en que vence). Los que no marques quedan como pagos extraordinarios.</p></div>
            <div className="tes-cabecera">
              <div className="field" style={{ width: 180, margin: 0 }}><label htmlFor="imp-dia">Día de corte para todos</label><input id="imp-dia" type="number" min={1} max={31} value={diaTodos} onChange={(e) => setDiaTodos(e.target.value)} /></div>
              <button type="button" className="btn" style={{ alignSelf: "flex-end" }} onClick={() => setPer((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v.sel ? { ...v, diaCorte: diaTodos } : v])))}>Aplicar a los marcados</button>
              <button type="button" className="btn" style={{ alignSelf: "flex-end" }} onClick={() => setPer((x) => { const todos = periodicos.every((g) => x[g.k]?.sel); return { ...x, ...Object.fromEntries(periodicos.map((g) => [g.k, { ...x[g.k], sel: !todos && !g.yaExiste }])) }; })}>Marcar / desmarcar todos</button>
              <div className="spacer" />
              <span className="pill accent">{periodicos.length} encontrados · {marcados.length} marcados</span>
            </div>
            <div className="table-card">
              <div className="table-scroll">
                <table className="records tes-tabla">
                  <thead><tr><th></th><th>Concepto</th><th>Ítem</th><th>Tipo</th><th>Medio · Paga</th><th>Meses en el Excel</th><th>Periodicidad</th><th>Día de corte</th><th style={{ textAlign: "right" }}>Valor (último pagado)</th></tr></thead>
                  <tbody>
                    {periodicos.slice((pActual - 1) * pSize, pActual * pSize).map((g) => {
                      const v = per[g.k] || {};
                      return (
                        <tr key={g.k}>
                          <td><input type="checkbox" checked={!!v.sel} disabled={g.yaExiste} onChange={() => setPer((x) => ({ ...x, [g.k]: { ...v, sel: !v.sel } }))} aria-label={`Crear ${g.concepto}`} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} /></td>
                          <td><strong>{g.concepto}</strong>{g.yaExiste && <span className="pill muted" style={{ marginLeft: 6 }}>Ya existe</span>}</td>
                          <td>{g.item || "—"}</td>
                          <td><TipoPago tipo={g.tipo} /></td>
                          <td>{[g.medio, g.paga].filter(Boolean).join(" · ") || "—"}</td>
                          <td className="tes-num" style={{ fontSize: 12 }}>{mesesTexto(g.meses)}</td>
                          <td><select value={v.periodicidad || g.periodicidad} onChange={(e) => setPer((x) => ({ ...x, [g.k]: { ...v, periodicidad: e.target.value } }))} style={{ minWidth: 120 }}>{Object.entries(PERIODICIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
                          <td><input type="number" min={1} max={31} value={v.diaCorte ?? ""} onChange={(e) => setPer((x) => ({ ...x, [g.k]: { ...v, diaCorte: e.target.value } }))} style={{ width: 70 }} aria-label="Día de corte" /></td>
                          <td style={{ textAlign: "right" }}><Dinero valor={g.valor} texto={fmtMoneda(g.valor, "COP")} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><label htmlFor="imp-size" style={{ marginBottom: 0 }}>Tamaño</label><select id="imp-size" value={pSize} onChange={(e) => { setPSize(Number(e.target.value)); setPPage(1); }}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                <div className="page-btns"><button type="button" className="btn small" disabled={pActual <= 1} onClick={() => setPPage(pActual - 1)}>Anterior</button><button type="button" className="btn small" disabled={pActual >= pTotal} onClick={() => setPPage(pActual + 1)}>Siguiente</button></div>
                <span className="count-note">Página {pActual} de {pTotal}</span><div className="spacer" /><span className="count-note">{periodicos.length} gasto(s)</span>
              </div>
            </div>
          </div>
          <div className="tes-cabecera"><button type="button" className="btn" onClick={() => setPaso(2)}>← Atrás</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={() => setPaso(4)}>Siguiente: revisar y cargar →</button></div>
        </>
      )}

      {paso === 4 && a && !r && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><h3>Esto es lo que se va a cargar</h3><p className="card-sub" style={{ margin: 0 }}>Revisa y confirma. Nada se ha guardado todavía.</p></div>
          <div className="kpi-row">
            <div className="kpi"><span className="label">Bancos</span><span className="value">{bancosElegidos.length}</span><span className="foot">{bancosElegidos.map((h) => destino[h.nombre]?.bancoId ? a.bancos.find((b) => b.id === Number(destino[h.nombre].bancoId))?.nombre : `${destino[h.nombre]?.nombre} (nuevo)`).join(" · ") || "—"}</span></div>
            <div className="kpi"><span className="label">Movimientos nuevos</span><span className="value">{sum(bancosElegidos, "nuevos").toLocaleString("es-CO")}</span><span className="foot">de {sum(bancosElegidos, "movimientos").toLocaleString("es-CO")} · {sum(bancosElegidos, "yaCargados")} ya estaban</span></div>
            <div className="kpi"><span className="label">Pagos programados nuevos</span><span className="value">{sum(pagosElegidos, "nuevos")}</span><span className="foot">{pagosElegidos.map((h) => `«${h.nombre}»`).join(", ") || "—"}</span></div>
            <div className="kpi"><span className="label">Gastos periódicos</span><span className="value">{marcados.length}</span><span className="foot">sus pagos del Excel quedan enlazados</span></div>
          </div>
          {pagosElegidos.some((h) => h.saldos.length) && (
            <div className="tes-ayuda"><div>
              <strong>Filas S (saldos de enero) que no se cargan como pagos:</strong> {pagosElegidos.flatMap((h) => h.saldos).map((s) => `«${s.concepto}» ${s.valorTexto}`).join(" · ")}. Te quedarán como alerta para registrarlas en <strong>Saldos de bancos</strong>.
            </div></div>
          )}
          <div className="tes-ayuda"><div>
            <strong>Lo que no cuadre irá a Mi día:</strong> {sum(pagosElegidos, "enCero")} pago(s) con valor «-» (se cargan en 0), {sum(bancosElegidos, "fechasDanadas")} movimiento(s) con fecha dañada (se toma el mes) y {sum(bancosElegidos, "sinDatos") + sum(pagosElegidos, "sinDatos")} fila(s) sin datos.
          </div></div>
          <div className="tes-cabecera"><button type="button" className="btn" onClick={() => setPaso(pagosElegidos.length ? 3 : 2)}>← Atrás</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={cargar} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Cargar la plantilla</button></div>
        </div>
      )}

      {r && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>¡Plantilla cargada!</h3>
          {r.bancos.map((b) => <span key={b.hoja}>{b.banco}{b.bancoCreado ? " (nuevo)" : ""}: <strong>{b.nuevos.toLocaleString("es-CO")}</strong> movimiento(s) nuevos{b.repetidos ? `, ${b.repetidos.toLocaleString("es-CO")} ya estaban` : ""}{b.saldosReportados ? `, ${b.saldosReportados} saldos reportados` : ""}.</span>)}
          {r.pagos.map((p) => <span key={p.hoja}>«{p.hoja}»: <strong>{p.nuevos}</strong> pago(s) nuevos, {p.actualizados} actualizados (P→E), {p.repetidos} ya estaban · {p.gastosPeriodicos} gasto(s) periódico(s) con {p.pagosEnlazados} pago(s) enlazados.</span>)}
          <span className="card-sub" style={{ margin: 0 }}>Maestros creados: {Object.entries(r.catalogosCreados || {}).map(([k, v]) => `${v} ${{ item: "ítems", concepto: "conceptos", medio: "medios de pago", pagador: "de «Paga»" }[k]}`).join(", ")}. {r.alertas} alerta(s) nuevas en Mi día.</span>
          <div className="tes-ayuda" style={{ alignSelf: "stretch" }}><div>El Excel no dice qué movimiento pagó qué pago. El <strong>agente de asociación</strong> los cruza y te deja propuestas para que las aceptes.</div></div>
          <div className="tes-cabecera">
            <Link className="btn btn-primary" href="/tesoreria/agentes">Ir al agente de asociación</Link>
            <Link className="btn" href="/tesoreria/pagos">Ver pagos programados</Link>
            <Link className="btn" href="/alertas">Ver alertas en Mi día</Link>
            <Link className="btn" href="/tesoreria/saldos">Registrar saldos iniciales</Link>
          </div>
        </div>
      )}
    </div>
  );
}
