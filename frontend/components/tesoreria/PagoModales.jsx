"use client";

import { useEffect, useState } from "react";
import { tesCrearPeriodico, tesPago, tesCrearPago, tesEditarPago, tesBorrarPago, tesAsociarPago, tesMovimientos, tesMovimiento, tesProponerPagos, tesAplicarPropuestos } from "@/lib/tesoreriaApi";
import { FormMovimientoModal, HeroMovimiento, BarraCuadre } from "@/components/tesoreria/MovimientoModales";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { IconSpark, IconTrash, IconSearch, IconPlus, IconEdit, IconCheck, IconArrowRight } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";
import { useConfirmar } from "@/components/Confirmar";
import { Modal, MESES, hoyCO, fechaCorta, EstadoPago, TipoPago, TIPOS_PAGO, SelectorAnio, PERIODICIDADES } from "@/components/tesoreria/comun";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;

// Qué es cada tipo, en palabras simples (tarjetas del formulario).
const TIPOS_FORM = [
  { k: "E", t: "Egreso", d: "Sale plata: un pago, una compra, un impuesto", cls: "egreso", flecha: "↑" },
  { k: "I", t: "Ingreso", d: "Entra plata: un arriendo, un reintegro, rendimientos", cls: "ingreso", flecha: "↓" },
  { k: "J", t: "Jornal", d: "Pago a un trabajador por días; suma en los totales", cls: "jornal", flecha: "◷" },
  { k: "T", t: "Traslado", d: "Plata que pasa de una cuenta a otra; no suma", cls: "traslado", flecha: "⇄" },
  { k: "S", t: "Saldo", d: "Solo anota un saldo; no suma en los totales", cls: "saldo", flecha: "≡" },
];
const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const finDeMes = (f) => { const [a, m] = f.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
// ¿El pago saca plata? (E siempre; T según el sentido; lo demás entra).
const saleDe = (v) => v.tipo === "E" || (v.tipo === "T" && v.sentido !== "entra");

// Resumen de un pago mientras se llena (encabezado del formulario y del detalle al editar).
function HeroPago({ v, cat, children }) {
  const tipo = TIPOS_FORM.find((x) => x.k === v.tipo) || TIPOS_FORM[0];
  const concepto = cat.conceptos.find((c) => c.id === Number(v.conceptoId));
  const item = cat.items.find((c) => c.id === Number(v.itemId));
  const medio = cat.medios.find((c) => c.id === Number(v.medioPagoId));
  return (
    <HeroMovimiento tipo={saleDe(v) ? "debito" : "credito"} valor={num(v.valor)} etiqueta={`${tipo.t} programado`}
      titulo={concepto?.nombre || "Pago nuevo"}
      sub={[item?.nombre, v.fecha ? `vence ${fechaCorta(v.fecha)}` : "sin fecha", medio?.nombre].filter(Boolean).join(" · ")}>
      {children}
    </HeroMovimiento>
  );
}

// Campos de un pago, por bloques con preguntas simples. valor siempre positivo; el tipo pone el signo (T: sale / entra).
// partes: qué bloques mostrar ("que" = tipo, concepto e ítem · "cuanto" = valor, vencimiento y cómo se paga); sin partes, todos.
function CamposPago({ v, set, cat, partes = ["que", "cuanto"] }) {
  const activos = (lista, id) => lista.filter((x) => x.activo || x.id === Number(id));
  const campo = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ ...v, [k]: e.target.value }) });
  const hoy = hoyCO();
  const rapidas = [["Hoy", hoy], ["En una semana", masDias(hoy, 7)], ["Fin de mes", finDeMes(hoy)]];
  return (
    <div className="pg-form">
      {partes.includes("que") && <>
        <section className="pg-bloque">
          <h4 className="pg-bloque-t">¿Qué tipo de pago es?</h4>
          <div className="pg-tipos" role="radiogroup" aria-label="Tipo">
            {TIPOS_FORM.map((x) => (
              <button key={x.k} type="button" role="radio" aria-checked={v.tipo === x.k} className={`pg-tipo ${x.cls}${v.tipo === x.k ? " on" : ""}`} onClick={() => set({ ...v, tipo: x.k })}>
                <span className="pg-tipo-ic" aria-hidden="true">{x.flecha}</span>
                <strong>{x.t}</strong>
                <small>{x.d}</small>
              </button>
            ))}
          </div>
          {v.tipo === "T" && (
            <div className="pg-sentido">
              <span>El traslado…</span>
              <div className="tes-seg"><button type="button" className={v.sentido !== "entra" ? "on" : ""} onClick={() => set({ ...v, sentido: "sale" })}>↑ Sale de la cuenta</button><button type="button" className={v.sentido === "entra" ? "on" : ""} onClick={() => set({ ...v, sentido: "entra" })}>↓ Entra a la cuenta</button></div>
            </div>
          )}
        </section>
        <section className="pg-bloque">
          <h4 className="pg-bloque-t">¿De qué se trata?</h4>
          <div className="pg-grid">
            <div className="field"><label htmlFor="pg-concepto">Concepto *</label>
              <select id="pg-concepto" value={v.conceptoId || ""} onChange={(e) => { const c = cat.conceptos.find((x) => x.id === Number(e.target.value)); set({ ...v, conceptoId: e.target.value, itemId: v.itemId || c?.itemId || "" }); }}>
                <option value="">Elige el concepto…</option>{activos(cat.conceptos, v.conceptoId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <small className="pg-ayuda">Ej.: «Impuesto predial», «Arreglo de techo». ¿No está? Créalo en Maestros › Conceptos.</small>
            </div>
            <div className="field"><label htmlFor="pg-item">Ítem (propiedad o grupo)</label>
              <select id="pg-item" {...campo("itemId")}><option value="">Sin ítem</option>{activos(cat.items, v.itemId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              <small className="pg-ayuda">Se llena solo con el ítem del concepto; cámbialo si es otro.</small>
            </div>
          </div>
        </section>
      </>}
      {partes.includes("cuanto") && <>
        <section className="pg-bloque">
          <h4 className="pg-bloque-t">¿Cuánto y para cuándo?</h4>
          <div className="pg-grid">
            <div className="field pgf-valor"><label htmlFor="pg-valor">Valor *</label><MoneyInput id="pg-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix="COP" decimales={2} /><small className="pg-ayuda">Escríbelo sin signo: el tipo dice si entra o sale.</small></div>
            <div className="field"><label htmlFor="pg-fecha">Vence *</label><input id="pg-fecha" type="date" {...campo("fecha")} />
              <div className="pg-rapidas">{rapidas.map(([t, f]) => <button key={t} type="button" className={`pg-rapida${v.fecha === f ? " on" : ""}`} onClick={() => set({ ...v, fecha: f })}>{t}</button>)}</div>
            </div>
          </div>
        </section>
        <section className="pg-bloque">
          <h4 className="pg-bloque-t">¿Cómo se paga? <em>opcional</em></h4>
          <div className="pg-grid">
            <div className="field"><label htmlFor="pg-medio">Medio de pago</label><select id="pg-medio" {...campo("medioPagoId")}><option value="">Sin definir</option>{activos(cat.medios, v.medioPagoId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select><small className="pg-ayuda">La cuenta o tarjeta con que se paga: ayuda a encontrar el movimiento del banco.</small></div>
            <div className="field"><label htmlFor="pg-paga">¿Quién paga?</label><select id="pg-paga" {...campo("pagadorId")}><option value="">Sin definir</option>{activos(cat.pagadores, v.pagadorId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="field pg-ancho"><label htmlFor="pg-obs">Observación</label><textarea id="pg-obs" rows={2} maxLength={1000} placeholder="Algo que convenga recordar (número de factura, a quién, por qué)…" {...campo("observacion")} /></div>
          </div>
        </section>
      </>}
    </div>
  );
}

// Fechas que tendría el pago si se vuelve periódico: desde su fecha hasta diciembre de ESE año (o la fecha fin), con la
// misma regla del backend (periodicos.js#periodosDe): el día de corte es el día de la fecha; quincenal = ese día y 15
// días después; en meses cortos, el último día.
const PASO_MESES = { quincenal: 1, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
function fechasPeriodicas(fecha, periodicidad, fechaFin) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return [];
  const fin = fechaFin && fechaFin < `${fecha.slice(0, 4)}-12-31` ? fechaFin : `${fecha.slice(0, 4)}-12-31`;
  const dia = Number(fecha.slice(8, 10));
  let a = Number(fecha.slice(0, 4));
  let m = Number(fecha.slice(5, 7));
  const out = [];
  for (let i = 0; i < 60; i++) {
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const f1 = `${a}-${String(m).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
    const lista = [f1];
    if (periodicidad === "quincenal") lista.push(new Date(Date.parse(`${f1}T12:00:00Z`) + 15 * 86400000).toISOString().slice(0, 10));
    for (const f of lista) if (f >= fecha && f <= fin) out.push(f);
    if (f1 > fin) break;
    m += PASO_MESES[periodicidad] || 1;
    while (m > 12) { m -= 12; a += 1; }
  }
  return out;
}

// Pestañas grandes de los pasos del pago (crear y editar usan las mismas): cada una dice su estado.
function PasosPago({ pasos, paso, onPaso }) {
  return (
    <div className="mv-pasos" role="tablist" aria-label="Pasos" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
      {pasos.map((p, i) => (
        <button key={p.k} type="button" role="tab" aria-selected={paso === p.k} className={`mv-paso${p.ok ? " ok" : ""}`} onClick={() => onPaso(p.k)}>
          <span className="mv-paso-n">{p.ok ? <IconCheck size={13} /> : i + 1}</span>
          <span className="mv-paso-txt"><strong>{p.titulo}</strong><small title={p.nota}>{p.nota}</small></span>
        </button>
      ))}
    </div>
  );
}
// Los dos pasos de los datos de un pago, con lo que falta en cada uno.
function pasosDeDatos(v, cat) {
  const tipo = TIPOS_FORM.find((x) => x.k === v.tipo) || TIPOS_FORM[0];
  const concepto = cat.conceptos.find((c) => c.id === Number(v.conceptoId));
  const valor = num(v.valor);
  return [
    { k: "que", titulo: "Qué pago es", nota: concepto ? `${tipo.t} · ${concepto.nombre}` : "Falta el concepto", ok: !!concepto },
    { k: "cuanto", titulo: "Cuánto y cuándo", nota: valor && v.fecha ? `${fmtMoneda(valor, "COP")} · vence ${fechaCorta(v.fecha)}` : !valor ? "Falta el valor" : "Falta la fecha", ok: !!(valor && v.fecha) },
  ];
}
const faltaDe = (v) => [!v.conceptoId && "el concepto", !num(v.valor) && "el valor", !v.fecha && "la fecha"].filter(Boolean);

// inicial: valores con que arranca el formulario. paraAsociar: se abre desde el asociador de un movimiento; crea un solo
// pago (sin «¿Se repite?») y onSaved lo recibe para dejarlo asociado.
// Mismo formato que el movimiento: resumen arriba y pasos (Qué pago es · Cuánto y cuándo · ¿Se repite?).
export function PagoFormModal({ cat, inicial = null, paraAsociar = false, onClose, onSaved }) {
  const [v, set] = useState({ tipo: "E", sentido: "sale", conceptoId: "", itemId: "", valor: "", fecha: hoyCO(), medioPagoId: "", pagadorId: "", observacion: "", ...(inicial || {}) });
  const [repite, setRepite] = useState(false);
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [fechaFin, setFechaFin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("que");
  const fechas = repite ? fechasPeriodicas(v.fecha, periodicidad, fechaFin) : [];
  const anioPago = (v.fecha || hoyCO()).slice(0, 4);
  async function guardar() {
    setGuardando(true); setError("");
    try {
      if (repite) {
        // Se vuelve gasto periódico: el gasto crea sus pagos en P desde esta fecha hasta diciembre de ese año.
        const g = await tesCrearPeriodico({
          tipo: v.tipo, sentido: v.sentido, conceptoId: v.conceptoId, itemId: v.itemId, medioPagoId: v.medioPagoId, pagadorId: v.pagadorId, valor: v.valor,
          periodicidad, diaCorte: Number(v.fecha.slice(8, 10)), fechaInicio: v.fecha, fechaFin: fechaFin || null, activo: true, observacion: v.observacion, desdeSuFecha: true,
        });
        onSaved(null, `Gasto periódico creado: ${g.pagosCreados} pago(s) en P hasta ${fechaFin && fechaFin < `${anioPago}-12-31` ? fechaCorta(fechaFin) : `diciembre de ${anioPago}`}. Lo ves en Gastos periódicos.`);
      } else {
        const p = await tesCrearPago({ ...v, estado: "P" });
        onSaved(p, "Pago extraordinario creado en P.");
      }
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  const faltan = faltaDe(v);
  const hasta = fechaFin && fechaFin < `${anioPago}-12-31` ? fechaCorta(fechaFin) : `diciembre de ${anioPago}`;
  const PASOS = [
    ...pasosDeDatos(v, cat),
    ...(paraAsociar ? [] : [{ k: "repite", titulo: "¿Se repite?", nota: repite ? `${PERIODICIDADES[periodicidad]} · ${fechas.length} pago(s) hasta ${hasta}` : "No · es un solo pago", ok: repite && fechas.length > 0 }]),
  ];
  const idx = PASOS.findIndex((p) => p.k === paso);
  const siguiente = PASOS[idx + 1];
  return (
    <Modal titulo={paraAsociar ? "Nuevo pago para este movimiento" : repite ? "Nuevo pago que se repite" : "Nuevo pago programado"} sub={paraAsociar ? "El pago no estaba en la lista: créalo aquí y queda elegido en el movimiento. Pasa a pagado (E) cuando guardes la asociación." : repite ? "Se crea como gasto periódico: sus pagos quedan pendientes (P) desde esta fecha hasta diciembre." : "Queda pendiente (P) hasta que lo pagues o le asocies el movimiento del banco."} onClose={onClose} ancho={920}
      pie={<>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        {faltan.length > 0 && <span className="mv-falta">Para crear falta {faltan.join(", ")}.</span>}
        <div className="spacer" />
        {siguiente && <button type="button" className="btn" onClick={() => setPaso(siguiente.k)}>Siguiente: {siguiente.titulo.toLowerCase()} <IconArrowRight size={12} /></button>}
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || faltan.length > 0 || (repite && !fechas.length)}>{guardando ? <span className="spinner" /> : null} {paraAsociar ? "Crear y elegir" : repite ? `Crear ${fechas.length} pago(s) periódicos` : "Crear pago pendiente"}</button>
      </>}>
      <HeroPago v={v} cat={cat}>
        <span className="pill warning">Queda pendiente (P)</span>
        {!paraAsociar && <span className={`pill ${repite ? "accent" : "muted"}`}>{repite ? `Se repite · ${PERIODICIDADES[periodicidad].toLowerCase()}` : "No se repite"}</span>}
      </HeroPago>
      <PasosPago pasos={PASOS} paso={paso} onPaso={setPaso} />
      {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}
      {paso !== "repite" && <CamposPago v={v} set={set} cat={cat} partes={[paso]} />}
      {paso === "repite" && !paraAsociar && (
        <section className={`pg-bloque pg-repite${repite ? " on" : ""}`}>
          <label className="pg-repite-t">
            <span>¿Este pago vuelve cada cierto tiempo?<small>Márcalo si se repite (arriendo, servicio, cuota…): se convierte en gasto periódico y crea todos sus pagos del año.</small></span>
            <input type="checkbox" role="switch" checked={repite} onChange={(e) => setRepite(e.target.checked)} aria-label="Se repite" />
          </label>
          {!repite && <small className="mv-pista">Si no lo marcas, se crea un solo pago para el {v.fecha ? fechaCorta(v.fecha) : "día que elijas"}.</small>}
          {repite && (
            <>
              <div className="field"><label>¿Cada cuánto?</label>
                <div className="tes-seg" style={{ flexWrap: "wrap" }}>{Object.entries(PERIODICIDADES).map(([k, t]) => <button key={k} type="button" className={periodicidad === k ? "on" : ""} onClick={() => setPeriodicidad(k)}>{t}</button>)}</div>
                <small className="pg-ayuda">{periodicidad === "quincenal" ? `El día ${Number(v.fecha.slice(8, 10))} de cada mes y 15 días después.` : `El día ${Number(v.fecha.slice(8, 10))} (el de la fecha de vencimiento); en meses más cortos, el último día.`}</small>
              </div>
              <div className="pg-grid">
                <div className="field"><label htmlFor="pg-hasta">Hasta (opcional)</label><input id="pg-hasta" type="date" min={v.fecha} max={`${anioPago}-12-31`} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /><small className="pg-ayuda">Vacío = hasta diciembre de {anioPago}. Para el año siguiente usa «Llenar un año» en Pagos programados.</small></div>
              </div>
              <div className="pg-repite-res" aria-live="polite">
                <strong>{fechas.length ? `Se van a crear ${fechas.length} pago(s) hasta ${hasta}` : "Con esa fecha no queda ningún pago este año"}</strong>
                {fechas.length > 0 && <div className="pg-repite-fechas">{fechas.map((f) => <span key={f} className="pill accent">{fechaCorta(f)}</span>)}</div>}
                {fechas.length > 0 && num(v.valor) > 0 && <small>Cada uno por {fmtMoneda(num(v.valor), "COP")} · en total {fmtMoneda(num(v.valor) * fechas.length, "COP")}.</small>}
              </div>
            </>
          )}
        </section>
      )}
    </Modal>
  );
}

// Movimientos que pagan este pago (asociar desde el pago): busca movimientos con valor sin asignar. Si el movimiento no
// está, «Registrarlo con soporte» (siempre visible junto al buscador) lo crea — Nova lee el comprobante — ya asociado a
// este pago y lo agrega a la lista.
const MOVS_POR_PAGINA = 5;
const TEXTOS_CUADRE_PAGO = { mal: (x) => `Sobran ${x} frente a lo programado`, ok: "Cuadra con lo programado", parcial: (x) => `Faltan ${x} para completar el pago`, nada: "Aún sin movimiento del banco" };
function AsociadorMovimientos({ pago, cat, lista, onCambio }) {
  const [q, setQ] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cands, setCands] = useState([]);
  const [pag, setPag] = useState(1);
  const prog = Math.abs(pago.valor);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const base = q.trim() ? { q: q.trim() } : { anio: pago.anio, mes: pago.mes };
        const r = await tesMovimientos({ ...base, asociacion: "porAsignar", tipo: pago.valor < 0 ? "debito" : "credito", size: 100 });
        const orden = [...r.items].sort((a, b) => Math.abs(a.sinAsignar - prog) - Math.abs(b.sinAsignar - prog));
        if (vivo) { setCands(orden.slice(0, 25)); setPag(1); }
      } catch { if (vivo) setCands([]); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, pago.anio, pago.mes, pago.valor, prog]);
  const total = lista.reduce((s, a) => s + num(a.valor), 0);
  const ya = new Set(lista.map((a) => a.movimientoId));
  const paginas = Math.max(1, Math.ceil(cands.length / MOVS_POR_PAGINA));
  const visibles = cands.slice((pag - 1) * MOVS_POR_PAGINA, pag * MOVS_POR_PAGINA);
  const registrar = () => { setAviso(""); setRegistrando(true); };
  return (
    <div className="mv-asoc">
      <BarraCuadre valor={prog} repartido={total} etiqueta="Pagado con movimientos" textos={TEXTOS_CUADRE_PAGO} />
      {aviso && <div className="tes-ayuda"><div>{aviso}</div></div>}
      {lista.length > 0 && (
        <div className="mv-bloque">
          <h5>Movimientos elegidos · {lista.length}</h5>
          {lista.map((a) => (
            <div key={a.movimientoId} className="mv-elegido">
              <div className="mv-elegido-txt"><strong>{a.mov?.descripcion || `Movimiento #${a.movimientoId}`}</strong><small>{[a.mov?.banco, a.mov && fechaCorta(a.mov.fecha), a.mov?.concepto && `concepto «${a.mov.concepto}»`, a.mov && `valor ${a.mov.valorTexto}`].filter(Boolean).join(" · ")}</small></div>
              <div className="field" style={{ margin: 0 }}><label htmlFor={`am-${a.movimientoId}`}>Va a este pago</label><MoneyInput id={`am-${a.movimientoId}`} value={a.valor} onChange={(v) => onCambio(lista.map((x) => (x.movimientoId === a.movimientoId ? { ...x, valor: v } : x)))} prefix="COP" decimales={2} /></div>
              <button type="button" className="btn small btn-ghost" onClick={() => onCambio(lista.filter((x) => x.movimientoId !== a.movimientoId))}>Quitar</button>
            </div>
          ))}
        </div>
      )}
      <div className="mv-bloque">
        <h5>{lista.length ? "Agregar otro movimiento" : "Elige el movimiento del banco que pagó este pago"}</h5>
        <div className="mv-buscar">
          <div className="maestros-search-wrap" style={{ maxWidth: "none", flex: 1 }}><input id="am-buscar" type="search" aria-label="Buscar un movimiento" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por descripción, concepto, tercero o valor…" /><span className="ic"><IconSearch size={14} /></span></div>
          {cat && <button type="button" className="btn mv-btn-crear" onClick={registrar} title="Si el movimiento no está, regístralo con su comprobante: queda asociado a este pago"><IconPlus size={13} /> Registrarlo con soporte</button>}
        </div>
        <small className="mv-pista">{q.trim() ? "Resultados de la búsqueda." : `Sugeridos: movimientos de ${MESES[pago.mes - 1]?.toLowerCase()} con valor sin asignar, del más parecido al más distinto.`} ¿No está? Regístralo con su comprobante.</small>
        {!cands.length && (
          <div className="mv-vacio">
            <strong>No hay movimientos con valor sin asignar {q.trim() ? "con esa búsqueda" : "en ese mes"}.</strong>
            <span>Prueba con otra palabra, o registra el movimiento con la foto o el PDF del comprobante: Nova lo lee y queda asociado a este pago.</span>
            {cat && <button type="button" className="btn btn-primary small" onClick={registrar}><IconPlus size={12} /> Registrarlo con soporte</button>}
          </div>
        )}
        {visibles.map((m) => (
          <div key={m.id} className={`mv-cand${ya.has(m.id) ? " elegido" : ""}`}>
            <div className="mv-cand-txt"><strong>{m.descripcion}</strong><small>{[m.banco, fechaCorta(m.fecha), m.concepto && `«${m.concepto}»`, m.tercero].filter(Boolean).join(" · ")}</small></div>
            {Math.abs(m.sinAsignar - prog) < 0.5 && <span className="pill good">Mismo valor</span>}
            {m.pagos > 0 && <span className="pill secondary">sin asignar {m.sinAsignarTexto}</span>}
            <span className="tes-num mv-cand-valor">{m.valorTexto}</span>
            <button type="button" className={`btn small${ya.has(m.id) ? "" : " btn-primary"}`} disabled={ya.has(m.id)} onClick={() => onCambio([...lista, { movimientoId: m.id, valor: String(Math.min(m.sinAsignar, Math.max(0, prog - total)) || m.sinAsignar), mov: m }])}>{ya.has(m.id) ? "✓ Elegido" : "Elegir"}</button>
          </div>
        ))}
        {cands.length > MOVS_POR_PAGINA && (
          <div className="mv-pager">
            <button type="button" className="btn small" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>Anterior</button>
            <span className="count-note">Página {pag} de {paginas} · {cands.length} movimiento(s)</span>
            <button type="button" className="btn small" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Siguiente</button>
          </div>
        )}
      </div>
      {registrando && cat && (
        <FormMovimientoModal
          cat={cat}
          conSoporte
          inicial={{ tipo: pago.valor < 0 ? "debito" : "credito", fecha: pago.fecha, valor: String(Math.max(0, Math.round((prog - total) * 100) / 100) || prog), concepto: pago.concepto || "" }}
          pagoInicial={{ pagoId: pago.id, valor: String(Math.max(0, Math.round((prog - total) * 100) / 100) || prog), pago: { concepto: pago.concepto, item: pago.item, mes: pago.mes, anio: pago.anio, valor: pago.valor } }}
          onClose={() => setRegistrando(false)}
          onSaved={async (m, msg) => {
            setRegistrando(false);
            if (msg) setAviso(msg);
            try {
              const full = await tesMovimiento(m.id);
              if (lista.some((a) => a.movimientoId === full.id)) return;
              const deEste = (full.listaPagos || []).find((a) => a.pagoId === pago.id);
              const valor = deEste ? deEste.valor : Math.min(full.sinAsignar ?? full.valor, Math.max(0, prog - total) || full.valor);
              onCambio([...lista, { movimientoId: full.id, valor: String(valor), mov: { descripcion: full.descripcion, banco: full.banco, fecha: full.fecha, concepto: full.concepto, valorTexto: full.valorTexto } }]);
            } catch { /* el movimiento ya quedó guardado; si no se puede leer, se ve al recargar */ }
          }}
        />
      )}
    </div>
  );
}

// Detalle de un pago: resumen arriba, el estado (P / E) y dos pestañas — Movimientos (asociar o cambiar) y Datos. Editar
// usa los mismos pasos del formulario de crear.
const ORIGEN_PAGO = { importacion: "Plantilla de Excel", periodico: "Gasto periódico", ia: "Propuesto por Nova", manual: "A mano" };
export function DetallePagoModal({ id, cat, puedeRegistrar, onClose, onCambio }) {
  const { confirmar } = useConfirmar();
  const [p, setP] = useState(null);
  const [v, set] = useState(null);
  const [asoc, setAsoc] = useState([]);
  const [modo, setModo] = useState("ver"); // ver | editar | asociar
  const [tab, setTab] = useState("movimientos");
  const [paso, setPaso] = useState("que");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cargar = () => tesPago(id).then((x) => {
    setP(x);
    set({ tipo: x.tipo, sentido: x.valor < 0 ? "sale" : "entra", conceptoId: x.conceptoId, itemId: x.itemId || "", valor: String(Math.abs(x.valor)), fecha: x.fecha, medioPagoId: x.medioPagoId || "", pagadorId: x.pagadorId || "", observacion: x.observacion || "" });
    setAsoc(x.listaMovimientos.map((a) => ({ movimientoId: a.movimientoId, valor: String(a.valor), mov: { descripcion: a.descripcion, banco: a.banco, fecha: a.fecha, concepto: a.concepto, valorTexto: a.valorMovimientoTexto } })));
  }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = async (fn, msg) => {
    setOcupado(true); setError("");
    try { await fn(); await cargar(); setModo("ver"); onCambio(msg); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  async function eliminar() {
    if (!(await confirmar({ titulo: "Eliminar el pago", mensaje: `¿Eliminar «${p.concepto}» por ${p.valorTexto}?`, detalle: "Sale de Pagos programados y de los totales del mes. No se puede deshacer.", boton: "Sí, eliminar", peligro: true }))) return;
    setOcupado(true); setError("");
    try { await tesBorrarPago(id); onCambio("Pago eliminado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  if (!p) return <Modal titulo="Pago programado" onClose={onClose}>{error ? <p className="modal-error">{error}</p> : <span className="spinner" />}</Modal>;
  const vencido = p.estado === "P" && p.fecha < hoyCO();
  const conDiferencia = p.diferencia != null && Math.abs(p.diferencia) > 0.5;
  const faltan = v ? faltaDe(v) : [];
  const pasosEdicion = v ? pasosDeDatos(v, cat) : [];
  const dato = (etiqueta, valor) => (<div><span>{etiqueta}</span><strong>{valor || "—"}</strong></div>);
  return (
    <Modal titulo={modo === "editar" ? "Editar pago programado" : "Pago programado"} sub={`#${p.id} · ${p.periodicidad ? `gasto periódico ${p.periodicidad.toLowerCase()}` : "pago extraordinario"} · ${ORIGEN_PAGO[p.origen] || p.origen}`} onClose={onClose} ancho={920}
      pie={modo === "ver" ? <>
        {puedeRegistrar && <button type="button" className="btn btn-ghost btn-danger-text" onClick={eliminar} disabled={ocupado || p.movimientos > 0} title={p.movimientos ? "Tiene movimientos asociados: quítalos primero" : undefined}><IconTrash size={13} /> Eliminar</button>}
        <div className="spacer" />
        {puedeRegistrar && <button type="button" className="btn" onClick={() => { setPaso("que"); setModo("editar"); }} disabled={ocupado}><IconEdit size={13} /> Editar datos</button>}
        <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button>
      </> : <>
        <button type="button" className="btn" onClick={() => { setModo("ver"); cargar(); }} disabled={ocupado}>Cancelar</button>
        {modo === "editar" && faltan.length > 0 && <span className="mv-falta">Para guardar falta {faltan.join(", ")}.</span>}
        <div className="spacer" />
        {modo === "editar" && paso === "que" && <button type="button" className="btn" onClick={() => setPaso("cuanto")}>Siguiente: cuánto y cuándo <IconArrowRight size={12} /></button>}
        {modo === "editar" && <button type="button" className="btn btn-primary" disabled={ocupado || faltan.length > 0} onClick={() => hacer(() => tesEditarPago(id, v), "Pago guardado.")}>{ocupado ? <span className="spinner" /> : null} Guardar cambios</button>}
        {modo === "asociar" && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => hacer(() => tesAsociarPago(id, asoc.map((a) => ({ movimientoId: a.movimientoId, valor: a.valor }))), "Movimientos asociados.")}>{ocupado ? <span className="spinner" /> : null} Guardar asociaciones</button>}
      </>}>
      {modo === "editar" && v ? (
        <HeroPago v={v} cat={cat}><EstadoPago estado={p.estado} vencido={vencido} /></HeroPago>
      ) : (
        <HeroMovimiento tipo={p.valor < 0 ? "debito" : "credito"} valor={Math.abs(p.valor)} moneda={p.moneda} etiqueta={`${p.tipoTexto} programado`} titulo={p.concepto}
          sub={[p.item || "Sin ítem", `vence ${fechaCorta(p.fecha)}${p.fechaAproximada ? " (del Excel, solo el mes)" : ""}`, p.medioPago].filter(Boolean).join(" · ")}>
          <EstadoPago estado={p.estado} vencido={vencido} />
          <span className={`pill ${!p.movimientos ? "muted" : conDiferencia ? "warning" : "good"}`}>{!p.movimientos ? "Sin movimiento del banco" : conDiferencia ? (p.diferencia > 0 ? `Faltan ${p.diferenciaTexto}` : `Sobran ${fmtMoneda(-p.diferencia, p.moneda)}`) : `${p.movimientos} movimiento(s) · cuadra`}</span>
        </HeroMovimiento>
      )}
      {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}

      {/* ---------- Editar: los mismos pasos de crear ---------- */}
      {modo === "editar" && v && <>
        <PasosPago pasos={pasosEdicion} paso={paso} onPaso={setPaso} />
        <CamposPago v={v} set={set} cat={cat} partes={[paso]} />
      </>}

      {/* ---------- Asociar movimientos ---------- */}
      {modo === "asociar" && <div className="mv-panel"><AsociadorMovimientos pago={p} cat={cat} lista={asoc} onCambio={setAsoc} /></div>}

      {modo === "ver" && <>
        {puedeRegistrar && (
          <div className="mv-estado">
            <div><strong>¿Ya se pagó?</strong><small>{p.movimientos ? "Tiene movimientos del banco: por eso está pagado." : "Puedes marcarlo a mano, aunque no haya movimiento ni soporte."}</small></div>
            <div className="tes-seg" role="group" aria-label="Estado del pago">
              <button type="button" className={p.estado === "P" ? "on" : ""} disabled={ocupado || p.movimientos > 0} title={p.movimientos ? "Tiene movimientos asociados" : undefined} onClick={() => p.estado !== "P" && hacer(() => tesEditarPago(id, { estado: "P" }), "Pago marcado como pendiente.")}>P · Pendiente</button>
              <button type="button" className={p.estado === "E" ? "on" : ""} disabled={ocupado} onClick={() => p.estado !== "E" && hacer(() => tesEditarPago(id, { estado: "E" }), "Pago marcado como pagado.")}>E · Pagado</button>
            </div>
          </div>
        )}
        <div className="dash-tabs mv-tabs" role="tablist" aria-label="Secciones del pago">
          <button type="button" role="tab" className="dash-tab" aria-selected={tab === "movimientos"} onClick={() => setTab("movimientos")}>Movimientos<span className="ag-num">{p.listaMovimientos.length}</span></button>
          <button type="button" role="tab" className="dash-tab" aria-selected={tab === "datos"} onClick={() => setTab("datos")}>Datos</button>
        </div>

        {tab === "movimientos" && (
          <div className="mv-panel">
            <BarraCuadre valor={Math.abs(p.valor)} repartido={p.movimientos ? Math.abs(p.valor) - (p.diferencia || 0) : 0} moneda={p.moneda} etiqueta="Pagado con movimientos" textos={TEXTOS_CUADRE_PAGO} />
            {conDiferencia && <div className="tes-ayuda"><div>Lo asociado no da igual a lo programado. Si el recibo vino por otro valor, corrige el valor del pago en «Editar datos»; si falta otro movimiento, asócialo.</div></div>}
            {p.listaMovimientos.length ? p.listaMovimientos.map((a) => (
              <a key={a.asociacionId} className="mv-pago" href={`/tesoreria/movimientos?id=${a.movimientoId}`} title="Abrir el movimiento">
                <div className="mv-cand-txt">
                  <strong>{a.descripcion}</strong>
                  <small>{[a.banco, fechaCorta(a.fecha), a.concepto && `«${a.concepto}»`, `movimiento por ${a.valorMovimientoTexto}`, a.origen === "agente" ? "lo propuso el agente" : null].filter(Boolean).join(" · ")}</small>
                </div>
                <span className="mv-pago-valor"><small>Va a este pago</small><strong className="tes-num">{a.valorTexto}</strong></span>
                <IconArrowRight size={14} />
              </a>
            )) : (
              <div className="mv-vacio">
                <strong>Este pago todavía no tiene movimiento del banco</strong>
                <span>{p.estado === "E" ? "Está pagado sin movimiento: asócialo al movimiento que lo pagó, o deja que el agente te proponga cuál fue." : "Cuando se pague, asócialo al movimiento del banco: el pago pasa a pagado. Si el movimiento no está, lo registras ahí mismo con su comprobante."}</span>
              </div>
            )}
            {puedeRegistrar && <button type="button" className={`btn${p.listaMovimientos.length ? "" : " btn-primary"}`} style={{ alignSelf: "flex-start" }} onClick={() => setModo("asociar")}>{p.listaMovimientos.length ? "Cambiar los movimientos asociados" : "Asociar un movimiento"}</button>}
          </div>
        )}

        {tab === "datos" && (
          <div className="mv-panel">
            <div className="tes-detalle mv-datos">
              {dato("Concepto", p.concepto)}
              {dato("Ítem", p.item)}
              {dato("Tipo", p.tipoTexto)}
              {dato("Valor programado", p.valorTexto)}
              {dato("Vence", `${fechaCorta(p.fecha)}${p.fechaAproximada ? " (del Excel, solo el mes)" : ""}`)}
              {dato("Medio de pago", p.medioPago)}
              {dato("Paga", p.pagador)}
              {dato("Se repite", p.periodicidad ? `Sí · ${p.periodicidad.toLowerCase()}` : "No · extraordinario")}
              {dato("Origen", ORIGEN_PAGO[p.origen] || p.origen)}
              {p.observacion && <div className="ancho"><span>Observación</span><strong>{p.observacion}</strong></div>}
            </div>
            {puedeRegistrar && <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => { setPaso("que"); setModo("editar"); }}><IconEdit size={13} /> Editar estos datos</button>}
          </div>
        )}
      </>}
    </Modal>
  );
}

// «Proponer pagos con IA»: un mes o el año. Nada se crea hasta aprobar; el valor se puede ajustar.
// «Todo el año»: las propuestas discriminadas por mes. Los meses son los mismos chips de mes de Pagos programados y
// Conciliación (tes-mes): al tocar uno se muestra SOLO ese mes, con sus totales marcados y «Marcar el mes».
function PorMes({ propuestas, anio, sel, setSel, valores, grupo }) {
  const meses = MESES.map((nombre, i) => ({ mes: i + 1, nombre, lista: propuestas.filter((p) => p.mes === i + 1) }));
  const conPagos = meses.filter((m) => m.lista.length);
  const [elegido, setElegido] = useState(conPagos[0]?.mes || 1);
  const totales = (lista) => {
    let egresos = 0, ingresos = 0, marcados = 0;
    for (const p of lista) {
      if (!sel[p.clave]) continue;
      marcados++;
      const v = num(valores[p.clave]);
      if (p.valor < 0) egresos += v; else if (p.tipo !== "S" && p.tipo !== "T") ingresos += v;
    }
    return { egresos, ingresos, marcados };
  };
  if (!conPagos.length) return <div className="empty compacta">Nada que proponer para {anio}: todos los gastos periódicos ya tienen sus pagos.</div>;
  const m = meses[elegido - 1];
  const t = totales(m.lista);
  const todos = m.lista.length > 0 && m.lista.every((p) => sel[p.clave]);
  return (
    <div className="tes-seccion">
      <div className="tes-meses" role="tablist" aria-label="Mes">
        {meses.map((x) => {
          const tx = totales(x.lista);
          return (
            <button key={x.mes} type="button" role="tab" aria-selected={elegido === x.mes} className={`tes-mes${elegido === x.mes ? " on" : ""}`} disabled={!x.lista.length} onClick={() => crossfade(() => setElegido(x.mes))} title={x.lista.length ? `${tx.marcados} de ${x.lista.length} marcados` : "Sin propuestas"}>
              <b>{x.nombre.slice(0, 3)}</b><span>{x.lista.length ? `${tx.marcados}/${x.lista.length}` : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="tes-cuadre">
        <div><span>{m.nombre} {anio}</span><strong>{t.marcados} de {m.lista.length} pago(s) marcados</strong></div>
        <div><span>Egresos marcados</span><strong className="tes-num tes-neg">{t.egresos ? `−${fmtMoneda(t.egresos, "COP")}` : "—"}</strong></div>
        <div><span>Ingresos marcados</span><strong className="tes-num tes-pos">{t.ingresos ? `+${fmtMoneda(t.ingresos, "COP")}` : "—"}</strong></div>
        <div style={{ justifyContent: "center" }}><button type="button" className="btn small" onClick={() => setSel((sx) => ({ ...sx, ...Object.fromEntries(m.lista.map((p) => [p.clave, !todos])) }))}>{todos ? "Desmarcar el mes" : "Marcar el mes"}</button></div>
      </div>
      <div key={m.mes} className="tes-seccion">
        {m.lista.some((p) => p.origen === "periodico") && grupo("De tus gastos periódicos", "calculado, sin IA · valor = último pagado", m.lista.filter((p) => p.origen === "periodico"))}
        {m.lista.some((p) => p.origen === "anioAnterior") && grupo(`Del mismo mes de ${anio - 1}`, "Nova dice si parece repetirse", m.lista.filter((p) => p.origen === "anioAnterior"))}
      </div>
    </div>
  );
}

export function ProponerModal({ anio: anioIni, mes: mesIni, onClose, onListo }) {
  const [alcance, setAlcance] = useState(mesIni ? "mes" : "anio");
  const [anio, setAnio] = useState(anioIni);
  const [mes, setMes] = useState(mesIni || 1);
  const [r, setR] = useState(null);
  const [sel, setSel] = useState({});
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  async function proponer() {
    setCargando(true); setError(""); setR(null);
    try {
      const x = await tesProponerPagos(anio, alcance === "mes" ? mes : null);
      setR(x);
      setSel(Object.fromEntries(x.propuestas.map((p) => [p.clave, p.sugerida])));
      setValores(Object.fromEntries(x.propuestas.map((p) => [p.clave, String(Math.abs(p.valor))])));
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  }
  const marcadas = r ? r.propuestas.filter((p) => sel[p.clave]) : [];
  async function crear() {
    setCreando(true); setError("");
    try {
      const items = marcadas.map((p) => ({ ...p, valor: (p.valor < 0 ? -1 : 1) * num(valores[p.clave]) }));
      const x = await tesAplicarPropuestos(items);
      onListo(`${x.creados} pago(s) creados en P.${x.errores.length ? ` ${x.errores.length} no se pudieron crear.` : ""}`);
    } catch (e) { setError(e.message); } finally { setCreando(false); }
  }
  // vacio: por qué no hay nada en ese grupo (si no, un texto general).
  const grupo = (titulo, sub, lista, vacio = "Nada que proponer aquí.") => (
    <div className="tes-seccion">
      <div className="tes-seccion-t"><h4>{titulo}</h4><small>{sub}</small><div className="spacer" style={{ flex: 1 }} />{lista.length > 0 && <button type="button" className="btn small" onClick={() => setSel((s) => ({ ...s, ...Object.fromEntries(lista.map((p) => [p.clave, !lista.every((x) => s[x.clave])])) }))}>Marcar / desmarcar todos</button>}</div>
      {!lista.length && <div className="empty compacta">{vacio}</div>}
      {lista.map((p) => (
        <div key={p.clave} className="tes-cand">
          <input type="checkbox" checked={!!sel[p.clave]} onChange={() => setSel((s) => ({ ...s, [p.clave]: !s[p.clave] }))} aria-label={`Crear ${p.concepto}`} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
          <div><strong>{p.concepto}</strong><small>{[p.item, `vence ${fechaCorta(p.fecha)}`, p.medioPago].filter(Boolean).join(" · ")} — {p.motivo}</small></div>
          <TipoPago tipo={p.tipo} />
          {p.origen === "anioAnterior" && <span className={`pill ${p.sugerida ? "good" : "muted"}`}>{p.sugerida ? "Nova: se repite" : "Nova: fue puntual"}</span>}
          <div style={{ width: 180 }}><MoneyInput value={valores[p.clave] ?? ""} onChange={(x) => setValores((s) => ({ ...s, [p.clave]: x }))} prefix="COP" decimales={2} ariaLabel="Valor" /></div>
        </div>
      ))}
    </div>
  );
  return (
    <Modal titulo="Proponer pagos con Nova" sub="Nada se crea hasta que apruebes. Puedes cambiar el valor antes de crear." onClose={onClose} ancho={alcance === "anio" ? 1240 : 980}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" />{r && <button type="button" className="btn btn-primary" onClick={crear} disabled={!marcadas.length || creando}>{creando ? <span className="spinner" /> : null} Crear {marcadas.length} pago(s)</button>}</>}>
      <div className="tes-filtros">
        <div className="field"><label>¿Para cuándo?</label><div className="tes-seg"><button type="button" className={alcance === "mes" ? "on" : ""} onClick={() => setAlcance("mes")}>Un mes</button><button type="button" className={alcance === "anio" ? "on" : ""} onClick={() => setAlcance("anio")}>Todo el año</button></div></div>
        <SelectorAnio id="pp-anio" value={anio} onChange={(x) => x && setAnio(x)} ancho={150} />
        {alcance === "mes" && <div className="field" style={{ width: 150 }}><label htmlFor="pp-mes">Mes</label><select id="pp-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>}
        <button type="button" className="btn btn-primary" onClick={proponer} disabled={cargando}>{cargando ? <span className="spinner" /> : <IconSpark size={13} />} {r ? "Proponer de nuevo" : "Proponer"}</button>
      </div>
      {cargando && <p className="muted">Revisando tus gastos periódicos y lo que pagaste el año pasado…</p>}
      {r && <>
        {!r.novaRespondio && r.delAnioAnterior > 0 && <div className="tes-ayuda"><div>Nova no respondió: lo del año anterior queda sin marcar para que lo revises tú.</div></div>}
        {r.mes ? <>
          {grupo("De tus gastos periódicos", "calculado, sin IA · valor = último pagado", r.propuestas.filter((p) => p.origen === "periodico"), `Todos tus gastos periódicos activos ya tienen su pago en ${MESES[r.mes - 1].toLowerCase()} ${r.anio}.`)}
          {grupo("Del mismo mes del año pasado", "Nova dice si parece repetirse", r.propuestas.filter((p) => p.origen === "anioAnterior"), r.pagosAnioAnterior ? `Lo que se pagó en ${MESES[r.mes - 1].toLowerCase()} ${r.anio - 1} ya está en ${r.anio} o lo cubre un gasto periódico.` : `No hay pagos de ${MESES[r.mes - 1].toLowerCase()} ${r.anio - 1} con qué comparar (tus datos empiezan después). Cuando haya un año completo de historia, Nova propondrá aquí primas, impuestos, pólizas y otros pagos que no son periódicos.`)}
        </> : <PorMes propuestas={r.propuestas} anio={r.anio} sel={sel} setSel={setSel} valores={valores} grupo={grupo} />}
      </>}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
