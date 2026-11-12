"use client";

import EstadoVacio from "@/components/EstadoVacio";
import { useCallback, useEffect, useMemo, useState } from "react";
import { tesPeriodicos, tesCrearPeriodico, tesEditarPeriodico, tesBorrarPeriodico, tesReplicar, tesVistaReplicar, tesVistaApagar, tesCrearAnio } from "@/lib/tesoreriaApi";
import { ProponerModal } from "@/components/tesoreria/PagoModales";
import { IconEdit, IconTrash, IconSearch } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";
import { SelectorAnio, useAniosTesoreria, refrescarAnios, BotonExcel, Celda, useCatalogos, Aviso, Modal, PERIODICIDADES, TIPOS_PAGO, anioActual, hoyCO, fechaCorta, fechaSinAnio, TipoPago, Dinero } from "@/components/tesoreria/comun";

const PAGE_SIZES = [25, 50, 100];
const COLS_EXCEL = [
  { t: "Activo", v: (g) => (g.activo ? "Sí" : "No") }, { t: "Concepto", v: (g) => g.concepto }, { t: "Ítem", v: (g) => g.item }, { t: "Tipo", v: (g) => `${g.tipo} · ${g.tipoTexto}` },
  { t: "Periodicidad", v: (g) => g.periodicidadTexto }, { t: "Día de corte", v: (g) => g.diaCorte }, { t: "Medio de pago", v: (g) => g.medioPago }, { t: "Paga", v: (g) => g.pagador },
  { t: "Valor estimado (COP)", v: (g) => g.valor }, { t: "Último valor pagado (COP)", v: (g) => g.ultimoValorReal }, { t: "Último pago", v: (g) => g.ultimoPago },
  { t: "Próximo", v: (g) => g.proximo }, { t: "Pendientes", v: (g) => g.pendientes }, { t: "Pagados", v: (g) => g.pagados },
  { t: "Desde", v: (g) => g.fechaInicio }, { t: "Hasta", v: (g) => g.fechaFin }, { t: "Observación", v: (g) => g.observacion },
];
const PASO = { quincenal: 1, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const sin = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;

// Las fechas que generará (misma regla que el backend, lib/tesoreria/periodicos.js#periodosDe): desde el mes en curso
// hasta la fecha fin o diciembre; quincenal = el día de corte y 15 días después.
function vistaPrevia(v) {
  if (!v.fechaInicio || !v.diaCorte) return [];
  const hoy = hoyCO();
  const desde = `${hoy.slice(0, 7)}-01`;
  const fin = v.fechaFin && v.fechaFin < `${hoy.slice(0, 4)}-12-31` ? v.fechaFin : `${hoy.slice(0, 4)}-12-31`;
  let a = Number(v.fechaInicio.slice(0, 4));
  let m = Number(v.fechaInicio.slice(5, 7));
  const out = [];
  for (let i = 0; i < 400 && out.length < 30; i++) {
    const base = `${a}-${String(m).padStart(2, "0")}`;
    if (`${base}-01` > fin) break;
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const f1 = `${base}-${String(Math.min(Number(v.diaCorte), ultimo)).padStart(2, "0")}`;
    const fechas = [f1];
    if (v.periodicidad === "quincenal") fechas.push(new Date(Date.parse(`${f1}T00:00:00Z`) + 15 * 86400000).toISOString().slice(0, 10));
    for (const f of fechas) if (f >= desde && f <= fin && f >= `${v.fechaInicio.slice(0, 7)}-01`) out.push(f);
    m += PASO[v.periodicidad] || 1;
    while (m > 12) { m -= 12; a += 1; }
  }
  return out;
}

export function PeriodicoFormModal({ cat, gasto, onClose, onSaved }) {
  const [v, set] = useState(() => gasto ? {
    tipo: gasto.tipo, sentido: gasto.valor < 0 ? "sale" : "entra", conceptoId: gasto.conceptoId, itemId: gasto.itemId || "", medioPagoId: gasto.medioPagoId || "", pagadorId: gasto.pagadorId || "",
    valor: String(Math.abs(gasto.valor)), periodicidad: gasto.periodicidad, diaCorte: String(gasto.diaCorte), fechaInicio: gasto.fechaInicio, fechaFin: gasto.fechaFin || "", activo: gasto.activo, observacion: gasto.observacion || "",
  } : { tipo: "E", sentido: "sale", conceptoId: "", itemId: "", medioPagoId: "", pagadorId: "", valor: "", periodicidad: "mensual", diaCorte: "5", fechaInicio: `${hoyCO().slice(0, 7)}-01`, fechaFin: "", activo: true, observacion: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const activos = (lista, id) => lista.filter((x) => x.activo || x.id === Number(id));
  const campo = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ ...v, [k]: e.target.value }) });
  const fechas = useMemo(() => (v.activo ? vistaPrevia(v) : []), [v]);
  async function guardar() {
    setGuardando(true); setError("");
    try {
      const datos = { ...v, diaCorte: Number(v.diaCorte), fechaFin: v.fechaFin || null };
      const r = gasto ? await tesEditarPeriodico(gasto.id, datos) : await tesCrearPeriodico(datos);
      onSaved(gasto ? `Gasto guardado: se rehicieron sus pagos pendientes (${r.pagosCreados} en P).` : `Gasto periódico creado: ${r.pagosCreados} pago(s) en P.`);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  return (
    <Modal titulo={gasto ? "Editar gasto periódico" : "Nuevo gasto periódico"} sub="Crea sus pagos en P desde este mes hasta diciembre (o hasta la fecha fin)." onClose={onClose} ancho={820}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !v.conceptoId || !num(v.valor) || !v.diaCorte || !v.fechaInicio}>{guardando ? <span className="spinner" /> : null} Guardar gasto periódico</button></>}>
      <div className="tes-form">
        <div className="field span-2"><label>Tipo *</label><div className="tes-seg">{Object.entries(TIPOS_PAGO).map(([k, t]) => <button key={k} type="button" className={v.tipo === k ? "on" : ""} onClick={() => set({ ...v, tipo: k })}>{k} · {t}</button>)}</div></div>
        {v.tipo === "T" && <div className="field span-2"><label>El traslado…</label><div className="tes-seg"><button type="button" className={v.sentido !== "entra" ? "on" : ""} onClick={() => set({ ...v, sentido: "sale" })}>Sale</button><button type="button" className={v.sentido === "entra" ? "on" : ""} onClick={() => set({ ...v, sentido: "entra" })}>Entra</button></div></div>}
        <div className="field"><label htmlFor="gp-concepto">Concepto *</label><select id="gp-concepto" value={v.conceptoId || ""} onChange={(e) => { const c = cat.conceptos.find((x) => x.id === Number(e.target.value)); set({ ...v, conceptoId: e.target.value, itemId: v.itemId || c?.itemId || "" }); }}><option value="">Elige…</option>{activos(cat.conceptos, v.conceptoId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="gp-item">Ítem</label><select id="gp-item" {...campo("itemId")}><option value="">Sin ítem</option>{activos(cat.items, v.itemId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="gp-valor">Valor estimado *</label><MoneyInput id="gp-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix="COP" decimales={2} /><span className="card-sub" style={{ margin: 0 }}>Si ya se pagó antes, los pagos nuevos toman el último valor real.</span></div>
        <div className="field"><label htmlFor="gp-medio">Medio de pago</label><select id="gp-medio" {...campo("medioPagoId")}><option value="">—</option>{activos(cat.medios, v.medioPagoId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="gp-paga">Paga</label><select id="gp-paga" {...campo("pagadorId")}><option value="">—</option>{activos(cat.pagadores, v.pagadorId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <div className="field span-2"><label>¿Cada cuánto? *</label><div className="tes-seg" style={{ flexWrap: "wrap" }}>{Object.entries(PERIODICIDADES).map(([k, t]) => <button key={k} type="button" className={v.periodicidad === k ? "on" : ""} onClick={() => set({ ...v, periodicidad: k })}>{t}</button>)}</div></div>
        <div className="field"><label htmlFor="gp-dia">Día de corte *</label><input id="gp-dia" type="number" min={1} max={31} {...campo("diaCorte")} /><span className="card-sub" style={{ margin: 0 }}>{v.periodicidad === "quincenal" ? "Quincenal: ese día y 15 días después." : "El día del mes en que vence (en meses cortos, el último día)."}</span></div>
        <div className="field"><label htmlFor="gp-desde">Desde *</label><input id="gp-desde" type="date" {...campo("fechaInicio")} /></div>
        <div className="field"><label htmlFor="gp-hasta">Hasta</label><input id="gp-hasta" type="date" {...campo("fechaFin")} /><span className="card-sub" style={{ margin: 0 }}>Vacío = hasta diciembre; al cambiar de año usa «Replicar pagos».</span></div>
        <div className="field"><label htmlFor="gp-obs">Observación</label><input id="gp-obs" maxLength={500} {...campo("observacion")} /></div>
        <label className="tes-check span-2"><span>Activo (si lo desactivas deja de generar pagos y se eliminan sus pagos pendientes desde hoy, menos los que tengan movimientos)</span><input type="checkbox" checked={!!v.activo} onChange={(e) => set({ ...v, activo: e.target.checked })} /></label>
      </div>
      <div className="tes-ayuda"><div><strong>{v.activo ? `Se crearán ${fechas.length} pago(s) en P${gasto ? " (los pendientes futuros se rehacen)" : ""}:` : "Apagado: no creará pagos."}</strong> {fechas.slice(0, 14).map(fechaSinAnio).join(" · ")}{fechas.length > 14 ? " …" : ""}</div></div>
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// «Llenar un año»: dos caminos. Replicar = copiar los gastos periódicos (todos los activos o solo los que tuvieron pagos en
// el año que elijas) al año destino, con el último valor pagado; antes de crear se ve cuántos pagos saldrían. Proponer con
// Nova = la propuesta del año completo, discriminada por mes, donde se aprueba pago por pago.
export function LlenarAnioModal({ anio: anioIni, aniosOrigen = [], modoInicial = null, onClose, onListo }) {
  const [modo, setModo] = useState(modoInicial === "replicar" ? "replicar" : null); // null | "replicar"
  const [destino, setDestino] = useState(anioIni || anioActual());
  const [desde, setDesde] = useState("");
  const [vista, setVista] = useState(null);
  const [proponer, setProponer] = useState(modoInicial === "proponer");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  // Solo años que tienen pagos de gastos periódicos (no se ofrecen años vacíos para copiar).
  const opcionesOrigen = [...new Set(aniosOrigen)].filter((a) => a !== destino).sort();
  useEffect(() => {
    if (modo !== "replicar") return undefined;
    let vivo = true;
    setVista(null);
    tesVistaReplicar(destino, desde || null).then((r) => vivo && setVista(r)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [modo, destino, desde]);
  async function replicar() {
    setOcupado(true); setError("");
    try { const r = await tesReplicar(destino, desde || null); onListo(`${r.creados} pago(s) de ${r.anio} creados en P a partir de ${r.gastos} gasto(s) periódico(s).`); } catch (e) { setError(e.message); setOcupado(false); }
  }
  if (proponer) return <ProponerModal anio={destino} mes={null} onClose={onClose} onListo={onListo} />;
  return (
    <Modal titulo={`Llenar ${destino} con pagos`} sub="Elige cómo: copiar tus gastos periódicos de un año o que Nova te proponga el año mes a mes." onClose={onClose} ancho={760}
      pie={modo === "replicar"
        ? <><button type="button" className="btn" onClick={() => setModo(null)}>← Atrás</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={replicar} disabled={ocupado || !vista || !vista.porCrear}>{ocupado ? <span className="spinner" /> : null} Crear {vista?.porCrear ?? "…"} pago(s) en {destino}</button></>
        : <button type="button" className="btn" onClick={onClose}>Cancelar</button>}>
      <SelectorAnio id="ll-dest" label="Año que quieres llenar" value={destino} onChange={(a) => a && setDestino(a)} anios={aniosOrigen} ancho={220} />
      {!modo && (
        <div className="tes-opciones">
          <button type="button" className="tes-opcion" onClick={() => setModo("replicar")}>
            <strong>Replicar desde un año</strong>
            <span>Copia tus gastos periódicos (arriendos, servicios, nóminas…) a {destino}, con el último valor que pagaste. Ves cuántos pagos saldrían antes de crearlos.</span>
            <em>Úsalo cuando los gastos se repiten igual que el año pasado</em>
          </button>
          <button type="button" className="tes-opcion" onClick={() => setProponer(true)}>
            <strong>Proponer con Nova</strong>
            <span>Nova arma {destino} mes a mes con tus gastos periódicos y con lo que pagaste ese mes el año anterior (primas, predial, pólizas…). Apruebas pago por pago.</span>
            <em>Úsalo cuando quieras revisar cada mes antes de crear</em>
          </button>
        </div>
      )}
      {modo === "replicar" && (
        <>
          <div className="field" style={{ width: 320 }}><label htmlFor="ll-desde">Copiar los gastos de</label>
            <select id="ll-desde" value={desde} onChange={(e) => setDesde(e.target.value)}>
              <option value="">Todos los gastos periódicos activos</option>
              {opcionesOrigen.map((a) => <option key={a} value={a}>Solo los que tuvieron pagos en {a}</option>)}
            </select>
          </div>
          {!vista && !error && <p className="muted" style={{ margin: 0 }}><span className="spinner" /> Calculando…</p>}
          {vista && (
            <div className="tes-cuadre">
              <div><span>Gastos que se copian</span><strong className="tes-num">{vista.gastos}</strong></div>
              <div><span>Pagos que se crean en {destino}</span><strong className="tes-num">{vista.porCrear}</strong></div>
              <div><span>Ya existían (no se duplican)</span><strong className="tes-num">{vista.yaExisten}</strong></div>
            </div>
          )}
          {vista && !vista.porCrear && <div className="tes-ayuda"><div>{destino} ya tiene todos los pagos de estos gastos: no hay nada que crear.</div></div>}
          <div className="tes-ayuda"><div>Cada pago toma el <strong>último valor real pagado</strong> de su gasto (si nunca se ha pagado, su valor estimado) y el día de corte del gasto. Los gastos apagados o con fecha fin antes de {destino} no se copian. Si lo vuelves a pulsar no se duplica nada.</div></div>
        </>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
// «Crear otro año» (el único lugar donde se crea un año): se escribe el año y se decide si queda en blanco o se llena
// como en «Llenar un año» (replicar los gastos de otro año o que Nova lo proponga mes a mes).
export function CrearAnioModal({ onClose, onCreado }) {
  const existentes = useAniosTesoreria();
  const sugerido = existentes?.length ? Math.max(...existentes) + 1 : anioActual() + 3;
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const anio = Number(texto || sugerido);
  const valido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
  const yaExiste = !!existentes?.includes(anio);
  async function crear(modo) {
    setOcupado(modo); setError("");
    try { await tesCrearAnio(anio); await refrescarAnios(); onCreado(anio, modo); } catch (e) { setError(e.message); setOcupado(null); }
  }
  const listo = valido && !yaExiste && !ocupado;
  return (
    <Modal titulo="Crear otro año" sub="El año queda disponible en todos los selectores de Tesorería. Decide si lo dejas en blanco o lo llenas desde otro año." onClose={onClose} ancho={760}
      pie={<button type="button" className="btn" onClick={onClose}>Cancelar</button>}>
      <div className="field" style={{ width: 220 }}>
        <label htmlFor="ca-anio">Año nuevo</label>
        <input id="ca-anio" type="number" min={2000} max={2100} autoFocus value={texto} placeholder={String(sugerido)} onChange={(e) => setTexto(e.target.value)} />
        <span className="card-sub" style={{ margin: 0 }}>{yaExiste ? `${anio} ya existe: elígelo en el selector de año.` : !valido ? "Escribe un año entre 2000 y 2100." : `Ya existen: ${(existentes || []).join(", ")}.`}</span>
      </div>
      <div className="tes-opciones tes-opciones-3">
        <button type="button" className="tes-opcion" onClick={() => crear("blanco")} disabled={!listo}>
          <strong>{ocupado === "blanco" ? <span className="spinner" /> : null} Dejarlo en blanco</strong>
          <span>Crea {valido ? anio : "el año"} sin pagos. Lo llenas después con «Llenar un año» o registrando los pagos.</span>
          <em>Úsalo si todavía no sabes qué se va a pagar</em>
        </button>
        <button type="button" className="tes-opcion" onClick={() => crear("replicar")} disabled={!listo}>
          <strong>{ocupado === "replicar" ? <span className="spinner" /> : null} Replicar desde otro año</strong>
          <span>Copia tus gastos periódicos a {valido ? anio : "el año"} con el último valor pagado. Eliges de qué año y ves cuántos pagos saldrían antes de crearlos.</span>
          <em>Úsalo cuando los gastos se repiten</em>
        </button>
        <button type="button" className="tes-opcion" onClick={() => crear("proponer")} disabled={!listo}>
          <strong>{ocupado === "proponer" ? <span className="spinner" /> : null} Proponer con Nova</strong>
          <span>Nova arma {valido ? anio : "el año"} mes a mes con tus gastos periódicos y lo pagado el año anterior. Apruebas pago por pago.</span>
          <em>Úsalo cuando quieras revisar cada mes</em>
        </button>
      </div>
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// Confirmación al apagar un gasto: cuántos pagos en P desde hoy se borran y cuántos se conservan por tener movimientos.
function ApagarModal({ gasto, onClose, onListo }) {
  const [vista, setVista] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { tesVistaApagar(gasto.id).then(setVista).catch((e) => setError(e.message)); }, [gasto.id]);
  async function apagar() {
    setOcupado(true); setError("");
    try {
      const r = await tesEditarPeriodico(gasto.id, { activo: false });
      onListo(`Gasto desactivado: se eliminaron ${r.pagosBorrados} pago(s) pendientes desde hoy${r.pagosConservados ? ` y se conservaron ${r.pagosConservados} con movimientos asociados` : ""}.`);
    } catch (e) { setError(e.message); setOcupado(false); }
  }
  return (
    <Modal titulo={`¿Desactivar «${gasto.concepto}»?`} sub="Deja de generar pagos. Lo pagado y lo anterior a hoy no se toca." onClose={onClose} ancho={620}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-danger-solid" onClick={apagar} disabled={ocupado || !vista}>{ocupado ? <span className="spinner" /> : null} Sí, desactivar</button></>}>
      {!vista && !error && <p className="muted" style={{ margin: 0 }}><span className="spinner" /> Revisando sus pagos…</p>}
      {vista && (
        <>
          <div className="tes-ayuda tes-ayuda-alerta"><div>
            {vista.seBorran
              ? <>Se <strong>eliminarán {vista.seBorran} pago(s) pendientes (P)</strong> con fecha desde hoy ({fechaCorta(vista.hoy)}) en adelante.</>
              : <>No tiene pagos pendientes desde hoy: no se elimina ningún pago.</>}
            {vista.seConservan > 0 && <> Se <strong>conservan {vista.seConservan}</strong> porque ya tienen movimientos asociados.</>}
          </div></div>
          {vista.porAnio.length > 0 && (
            <div className="tes-cuadre">
              {vista.porAnio.map((x) => <div key={x.anio}><span>{x.anio}</span><strong className="tes-num">{x.seBorran} se eliminan{x.seConservan ? ` · ${x.seConservan} se conservan` : ""}</strong></div>)}
            </div>
          )}
          <p className="card-sub" style={{ margin: 0 }}>Podrás verlo en la pestaña «Inactivos» y volver a activarlo cuando quieras (se crean de nuevo sus pagos hasta diciembre).</p>
        </>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// Nombre anterior (Pagos programados lo usa para un mes vacío).
export const ReplicarModal = LlenarAnioModal;

export default function PeriodicosTesoreria({ acceso }) {
  const { cat } = useCatalogos();
  const [items, setItems] = useState(null);
  const [anio, setAnio] = useState(anioActual());
  const [aniosOrigen, setAniosOrigen] = useState([]);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("todos");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [modal, setModal] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;
  const cargar = useCallback(() => tesPeriodicos(anio || "").then((r) => { setItems(r.items); setAniosOrigen(r.aniosConPagos.map((x) => x.anio)); setError(""); }).catch((e) => setError(e.message)), [anio]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [buscar, estado, size, anio]);
  const filas = useMemo(() => (items || []).filter((g) => (estado === "todos" || (estado === "activos" ? g.activo : !g.activo)) && (!buscar || sin(`${g.concepto} ${g.item} ${g.medioPago} ${g.pagador}`).includes(sin(buscar)))), [items, buscar, estado]);
  const total = Math.max(1, Math.ceil(filas.length / size));
  const actual = Math.min(page, total);
  const visibles = filas.slice((actual - 1) * size, actual * size);

  async function alternar(g) {
    if (g.activo) { setModal({ tipo: "apagar", gasto: g }); return; }
    setOcupado(g.id); setError("");
    try { const r = await tesEditarPeriodico(g.id, { activo: !g.activo }); setAviso(g.activo ? `Gasto apagado: se quitaron ${r.pagosBorrados} pago(s) futuros pendientes.` : `Gasto activado: ${r.pagosCreados} pago(s) creados hasta diciembre.`); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  async function eliminar(g) {
    setOcupado(g.id); setError("");
    try { await tesBorrarPeriodico(g.id); setAviso("Gasto periódico eliminado."); setBorrar(null); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  return (
    <div className="tes-vista">
      <div className="card tes-filtros">
        <div className="field" style={{ flex: "2 1 220px" }}><label htmlFor="gpf-q">Buscar</label><div className="maestros-search-wrap" style={{ maxWidth: "none" }}><input id="gpf-q" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Concepto, ítem, medio o quién paga" /><span className="ic"><IconSearch size={14} /></span></div></div>
        <SelectorAnio id="gpf-anio" value={anio} onChange={setAnio} anios={aniosOrigen} conTodos />
        <div className="dash-tabs" role="tablist" aria-label="Estado">{[["todos", `Todos${items ? ` · ${items.length}` : ""}`], ["activos", `Activos${items ? ` · ${items.filter((g) => g.activo).length}` : ""}`], ["inactivos", `Inactivos${items ? ` · ${items.filter((g) => !g.activo).length}` : ""}`]].map(([k, t]) => <button key={k} type="button" role="tab" className="dash-tab" aria-selected={estado === k} onClick={() => setEstado(k)}>{t}</button>)}</div>
        <div className="tes-filtros-acciones"><BotonExcel nombre={`tesoreria-gastos-periodicos${anio ? `-${anio}` : ""}`} hoja="Gastos periódicos" columnas={COLS_EXCEL} filas={filas} deshabilitado={!filas.length} /></div>
        {puede && <div className="tes-filtros-acciones">
          <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "form" })} disabled={!cat}>+ Nuevo gasto periódico</button>
        </div>}
      </div>
      {error && <p className="modal-error">{error}</p>}
      <div className="table-card">
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead><tr><th>Activo</th><th>Concepto</th><th>Ítem</th><th>Tipo</th><th>Periodicidad</th><th>Día</th><th>Medio · Paga</th><th style={{ textAlign: "right" }}>Último valor pagado</th><th>Próximo</th><th>Pendientes</th><th></th></tr></thead>
            <tbody>
              {!items && Array.from({ length: 8 }).map((_, i) => <tr key={i} aria-hidden="true"><td colSpan={11}><div className="skeleton-bar" style={{ height: 18, borderRadius: 6 }} /></td></tr>)}
              {items && !visibles.length && <tr><td colSpan={11}><EstadoVacio titulo={items.length ? "Nada con este filtro" : "Aún no hay gastos periódicos"} accion={!items.length && puede && cat ? <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "form" })}>+ Nuevo gasto periódico</button> : null}>{items.length ? "Cambia la búsqueda, el año o la pestaña." : "Arriendos, servicios, nóminas… defínelos una vez y se crean solos sus pagos del año. También salen al importar la plantilla."}</EstadoVacio></td></tr>}
              {visibles.map((g) => (
                <tr key={g.id}>
                  <td><label className="toggle-switch" title={g.activo ? "Apagar" : "Activar"}><input type="checkbox" checked={g.activo} onChange={() => alternar(g)} disabled={!puede || ocupado === g.id} aria-label={g.activo ? "Apagar" : "Activar"} /><span className="toggle-track"><span className="toggle-thumb" /></span></label></td>
                  <td><Celda v={g.concepto} ancha /></td>
                  <td><Celda v={g.item} /></td>
                  <td><TipoPago tipo={g.tipo} /></td>
                  <td>{g.periodicidadTexto}</td>
                  <td className="tes-num">{g.diaCorte}</td>
                  <td><Celda v={[g.medioPago, g.pagador].filter(Boolean).join(" · ")} /></td>
                  <td style={{ textAlign: "right" }}>{g.ultimoValorReal != null ? <Dinero valor={g.ultimoValorReal} texto={g.ultimoValorRealTexto} /> : <span className="muted" title="Nunca se ha pagado: se usa el estimado">{g.valorTexto} (estimado)</span>}</td>
                  <td>{g.activo ? (g.proximo ? fechaCorta(g.proximo) : <span className="muted">—</span>) : <span className="pill muted">Inactivo</span>}</td>
                  <td className="tes-num">{g.pendientes}</td>
                  <td className="acciones" style={{ whiteSpace: "nowrap" }}>
                    {puede && (borrar === g.id && (g.pagadosTotal || g.conMovimientos) ? (
                      <span className="confirm-del tes-no-borrar" role="alert">
                        <span>No se puede eliminar: ya tiene {[g.pagadosTotal ? `${g.pagadosTotal} pago(s) pagados` : null, g.conMovimientos ? `${g.conMovimientos} con movimientos asociados` : null].filter(Boolean).join(" y ")}.</span>
                        {g.activo && <button type="button" className="btn small btn-primary" onClick={() => { setBorrar(null); alternar(g); }} disabled={ocupado === g.id}>Apagarlo</button>}
                        <button type="button" className="btn small" onClick={() => setBorrar(null)}>Entendido</button>
                      </span>
                    ) : borrar === g.id ? (
                      <span className="confirm-del"><span>¿Eliminar?</span><button type="button" className="btn btn-danger-solid small" onClick={() => eliminar(g)} disabled={ocupado === g.id}>Sí</button><button type="button" className="btn small" onClick={() => setBorrar(null)}>No</button></span>
                    ) : <>
                      <button type="button" className="icon-action-btn edit" onClick={() => setModal({ tipo: "form", gasto: g })} title="Editar"><IconEdit size={13} /></button>
                      <button type="button" className="icon-action-btn delete" onClick={() => setBorrar(g.id)} title={g.pagadosTotal || g.conMovimientos ? "Ya tiene pagos pagados o movimientos: no se puede eliminar (puedes apagarlo)" : "Eliminar"}><IconTrash size={13} /></button>
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><label htmlFor="gp-size" style={{ marginBottom: 0 }}>Tamaño</label><select id="gp-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="page-btns"><button type="button" className="btn small" disabled={actual <= 1} onClick={() => setPage(actual - 1)}>Anterior</button><button type="button" className="btn small" disabled={actual >= total} onClick={() => setPage(actual + 1)}>Siguiente</button></div>
          <span className="count-note">Página {actual} de {total}</span>
          <div className="spacer" />
          <span className="count-note">{filas.length} gasto(s) periódico(s)</span>
        </div>
      </div>
      {modal?.tipo === "form" && cat && <PeriodicoFormModal cat={cat} gasto={modal.gasto} onClose={() => setModal(null)} onSaved={(msg) => { setModal(null); setAviso(msg); cargar(); }} />}
      {modal?.tipo === "apagar" && <ApagarModal gasto={modal.gasto} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); setAviso(msg); cargar(); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
