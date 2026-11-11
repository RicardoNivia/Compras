"use client";

import { useEffect, useState } from "react";
import { tesCrearPeriodico, tesPago, tesCrearPago, tesEditarPago, tesBorrarPago, tesAsociarPago, tesMovimientos, tesProponerPagos, tesAplicarPropuestos } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { IconSpark, IconTrash, IconSearch } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";
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

// Campos de un pago (extraordinario o al editar), por bloques con preguntas simples. valor siempre positivo; el tipo pone
// el signo (T: sale / entra). Abajo, cómo va a quedar el pago antes de guardarlo.
function CamposPago({ v, set, cat }) {
  const activos = (lista, id) => lista.filter((x) => x.activo || x.id === Number(id));
  const campo = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ ...v, [k]: e.target.value }) });
  const hoy = hoyCO();
  const tipo = TIPOS_FORM.find((x) => x.k === v.tipo) || TIPOS_FORM[0];
  const concepto = cat.conceptos.find((c) => c.id === Number(v.conceptoId));
  const item = cat.items.find((c) => c.id === Number(v.itemId));
  const medio = cat.medios.find((c) => c.id === Number(v.medioPagoId));
  const sale = v.tipo === "E" || (v.tipo === "T" && v.sentido !== "entra");
  const valor = num(v.valor);
  const rapidas = [["Hoy", hoy], ["En una semana", masDias(hoy, 7)], ["Fin de mes", finDeMes(hoy)]];
  return (
    <div className="pg-form">
      <section className="pg-bloque">
        <h4 className="pg-bloque-t"><span>1</span> ¿Qué tipo de movimiento es?</h4>
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
        <h4 className="pg-bloque-t"><span>2</span> ¿De qué se trata?</h4>
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

      <section className="pg-bloque">
        <h4 className="pg-bloque-t"><span>3</span> ¿Cuánto y para cuándo?</h4>
        <div className="pg-grid">
          <div className="field pgf-valor"><label htmlFor="pg-valor">Valor *</label><MoneyInput id="pg-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix="COP" decimales={2} /><small className="pg-ayuda">Escríbelo sin signo: el tipo dice si entra o sale.</small></div>
          <div className="field"><label htmlFor="pg-fecha">Vence *</label><input id="pg-fecha" type="date" {...campo("fecha")} />
            <div className="pg-rapidas">{rapidas.map(([t, f]) => <button key={t} type="button" className={`pg-rapida${v.fecha === f ? " on" : ""}`} onClick={() => set({ ...v, fecha: f })}>{t}</button>)}</div>
          </div>
        </div>
      </section>

      <section className="pg-bloque">
        <h4 className="pg-bloque-t"><span>4</span> ¿Cómo se paga? <em>opcional</em></h4>
        <div className="pg-grid">
          <div className="field"><label htmlFor="pg-medio">Medio de pago</label><select id="pg-medio" {...campo("medioPagoId")}><option value="">Sin definir</option>{activos(cat.medios, v.medioPagoId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select><small className="pg-ayuda">La cuenta o tarjeta con que se paga: ayuda a encontrar el movimiento del banco.</small></div>
          <div className="field"><label htmlFor="pg-paga">¿Quién paga?</label><select id="pg-paga" {...campo("pagadorId")}><option value="">Sin definir</option>{activos(cat.pagadores, v.pagadorId).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="field pg-ancho"><label htmlFor="pg-obs">Observación</label><textarea id="pg-obs" rows={2} maxLength={1000} placeholder="Algo que convenga recordar (número de factura, a quién, por qué)…" {...campo("observacion")} /></div>
        </div>
      </section>

      <div className={`pg-resumen ${tipo.cls}`} aria-live="polite">
        <span className="pg-resumen-ic" aria-hidden="true">{tipo.flecha}</span>
        <div>
          <small>Así va a quedar</small>
          <strong>{tipo.t}{concepto ? ` · ${concepto.nombre}` : ""}</strong>
          <span>{[item?.nombre, v.fecha ? `vence ${fechaCorta(v.fecha)}` : null, medio?.nombre].filter(Boolean).join(" · ") || "Completa el concepto, el valor y la fecha"}</span>
        </div>
        <span className={`pg-resumen-v tes-num${valor ? (sale ? " tes-neg" : " tes-pos") : ""}`}>{valor ? fmtMoneda(sale ? -valor : valor, "COP") : "COP —"}</span>
      </div>
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

export function PagoFormModal({ cat, onClose, onSaved }) {
  const [v, set] = useState({ tipo: "E", sentido: "sale", conceptoId: "", itemId: "", valor: "", fecha: hoyCO(), medioPagoId: "", pagadorId: "", observacion: "" });
  const [repite, setRepite] = useState(false);
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [fechaFin, setFechaFin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
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
  return (
    <Modal titulo={repite ? "Nuevo pago que se repite" : "Nuevo pago extraordinario"} sub={repite ? "Se crea como gasto periódico: sus pagos quedan pendientes (P) desde esta fecha hasta diciembre." : "Un pago que no se repite: un arreglo, una compra, un impuesto puntual. Queda pendiente (P) hasta que lo pagues o le asocies el movimiento del banco."} onClose={onClose} ancho={820}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !v.conceptoId || !num(v.valor) || !v.fecha || (repite && !fechas.length)}>{guardando ? <span className="spinner" /> : null} {repite ? `Crear ${fechas.length} pago(s) periódicos` : "Crear pago pendiente"}</button></>}>
      <CamposPago v={v} set={set} cat={cat} />
      <section className={`pg-bloque pg-repite${repite ? " on" : ""}`}>
        <label className="pg-repite-t">
          <span><span className="pg-bloque-num">5</span> ¿Se repite?<small>Márcalo si este pago vuelve cada cierto tiempo (arriendo, servicio, cuota…): se convierte en gasto periódico.</small></span>
          <input type="checkbox" role="switch" checked={repite} onChange={(e) => setRepite(e.target.checked)} aria-label="Se repite" />
        </label>
        {repite && (
          <>
            <div className="field"><label>¿Cada cuánto?</label>
              <div className="tes-seg" style={{ flexWrap: "wrap" }}>{Object.entries(PERIODICIDADES).map(([k, t]) => <button key={k} type="button" className={periodicidad === k ? "on" : ""} onClick={() => setPeriodicidad(k)}>{t}</button>)}</div>
              <small className="pg-ayuda">{periodicidad === "quincenal" ? `El día ${Number(v.fecha.slice(8, 10))} de cada mes y 15 días después.` : `El día ${Number(v.fecha.slice(8, 10))} (el de la fecha de vencimiento); en meses más cortos, el último día.`}</small>
            </div>
            <div className="pg-grid">
              <div className="field"><label htmlFor="pg-hasta">Hasta (opcional)</label><input id="pg-hasta" type="date" min={v.fecha} max={`${anioPago}-12-31`} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /><small className="pg-ayuda">Vacío = hasta diciembre de {anioPago}. Para el año siguiente usa «Llenar un año» en Gastos periódicos.</small></div>
            </div>
            <div className="pg-repite-res" aria-live="polite">
              <strong>{fechas.length ? `Se van a crear ${fechas.length} pago(s) hasta ${fechaFin && fechaFin < `${anioPago}-12-31` ? fechaCorta(fechaFin) : `diciembre de ${anioPago}`}` : "Con esa fecha no queda ningún pago este año"}</strong>
              {fechas.length > 0 && <div className="pg-repite-fechas">{fechas.map((f) => <span key={f} className="pill accent">{fechaCorta(f)}</span>)}</div>}
              {fechas.length > 0 && num(v.valor) > 0 && <small>Cada uno por {fmtMoneda(num(v.valor), "COP")} · en total {fmtMoneda(num(v.valor) * fechas.length, "COP")}.</small>}
            </div>
          </>
        )}
      </section>
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// Movimientos que pagan este pago (asociar desde el pago): busca movimientos con valor sin asignar.
function AsociadorMovimientos({ pago, lista, onCambio }) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState([]);
  const prog = Math.abs(pago.valor);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const base = q.trim() ? { q: q.trim() } : { anio: pago.anio, mes: pago.mes };
        const r = await tesMovimientos({ ...base, asociacion: "porAsignar", tipo: pago.valor < 0 ? "debito" : "credito", size: 100 });
        const orden = [...r.items].sort((a, b) => Math.abs(a.sinAsignar - prog) - Math.abs(b.sinAsignar - prog));
        if (vivo) setCands(orden.slice(0, 25));
      } catch { if (vivo) setCands([]); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, pago.anio, pago.mes, pago.valor, prog]);
  const total = lista.reduce((s, a) => s + num(a.valor), 0);
  const ya = new Set(lista.map((a) => a.movimientoId));
  return (
    <div className="tes-seccion">
      {lista.map((a) => (
        <div key={a.movimientoId} className="tes-asoc">
          <div><strong>{a.mov?.descripcion || `Movimiento #${a.movimientoId}`}</strong><small>{[a.mov?.banco, a.mov && fechaCorta(a.mov.fecha), a.mov?.concepto && `concepto «${a.mov.concepto}»`, a.mov && `valor ${a.mov.valorTexto}`].filter(Boolean).join(" · ")}</small></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor={`am-${a.movimientoId}`}>Va a este pago</label><MoneyInput id={`am-${a.movimientoId}`} value={a.valor} onChange={(v) => onCambio(lista.map((x) => (x.movimientoId === a.movimientoId ? { ...x, valor: v } : x)))} prefix="COP" decimales={2} /></div>
          <button type="button" className="btn small" onClick={() => onCambio(lista.filter((x) => x.movimientoId !== a.movimientoId))}>Quitar</button>
        </div>
      ))}
      <div className="tes-cuadre">
        <div><span>Programado</span><strong className="tes-num">{fmtMoneda(prog, "COP")}</strong></div>
        <div><span>Asociado</span><strong className="tes-num">{fmtMoneda(total, "COP")}</strong></div>
        <div><span>Diferencia</span><strong className={`tes-num ${Math.abs(prog - total) < 0.5 ? "tes-pos" : "tes-neg"}`}>{lista.length ? fmtMoneda(prog - total, "COP") : "—"}</strong></div>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="am-buscar">Buscar un movimiento con valor sin asignar</label>
        <div className="maestros-search-wrap" style={{ maxWidth: "none" }}><input id="am-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descripción, concepto, tercero o valor (vacío = del mismo mes)" /><span className="ic"><IconSearch size={14} /></span></div>
      </div>
      <div className="tes-lista-cands">
        {!cands.length && <div className="empty compacta">No hay movimientos con valor sin asignar con este criterio.</div>}
        {cands.map((m) => (
          <div key={m.id} className="tes-cand">
            <div><strong>{m.descripcion}</strong><small>{[m.banco, fechaCorta(m.fecha), m.concepto && `«${m.concepto}»`, m.tercero].filter(Boolean).join(" · ")}</small></div>
            <span className="tes-num">{m.valorTexto}</span>
            {m.pagos > 0 && <span className="pill secondary">sin asignar {m.sinAsignarTexto}</span>}
            {Math.abs(m.sinAsignar - prog) < 0.5 && <span className="pill good">Mismo valor</span>}
            <button type="button" className="btn small" disabled={ya.has(m.id)} onClick={() => onCambio([...lista, { movimientoId: m.id, valor: String(Math.min(m.sinAsignar, Math.max(0, prog - total)) || m.sinAsignar), mov: m }])}>{ya.has(m.id) ? "Agregado" : "+ Asociar"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetallePagoModal({ id, cat, puedeRegistrar, onClose, onCambio }) {
  const [p, setP] = useState(null);
  const [v, set] = useState(null);
  const [asoc, setAsoc] = useState([]);
  const [modo, setModo] = useState("ver"); // ver | editar | asociar
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [borrar, setBorrar] = useState(false);
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
  if (!p) return <Modal titulo="Pago programado" onClose={onClose}>{error ? <p className="modal-error">{error}</p> : <span className="spinner" />}</Modal>;
  const vencido = p.estado === "P" && p.fecha < hoyCO();
  return (
    <Modal titulo={p.concepto} sub={`${p.item || "Sin ítem"} · ${p.tipoTexto} · vence ${fechaCorta(p.fecha)}${p.fechaAproximada ? " (del Excel, solo el mes)" : ""} · ${p.periodicidad ? `gasto periódico ${p.periodicidad.toLowerCase()}` : "extraordinario"}`} onClose={onClose} ancho={900}
      pie={!puedeRegistrar ? null : modo === "ver" ? <>
        {borrar ? <><span>¿Eliminar este pago?</span><button type="button" className="btn btn-danger-solid small" disabled={ocupado} onClick={async () => { setOcupado(true); try { await tesBorrarPago(id); onCambio("Pago eliminado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); } }}>Sí</button><button type="button" className="btn small" onClick={() => setBorrar(false)}>No</button></> : <button type="button" className="btn" onClick={() => setBorrar(true)} disabled={p.movimientos > 0} title={p.movimientos ? "Tiene movimientos: quítalos primero" : undefined}><IconTrash size={13} /> Eliminar</button>}
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => setModo("asociar")}>Asociar movimientos</button>
        <button type="button" className="btn btn-primary" onClick={() => setModo("editar")}>Editar datos</button>
      </> : <>
        <button type="button" className="btn" onClick={() => { setModo("ver"); cargar(); }}>Cancelar</button>
        <div className="spacer" />
        {modo === "editar" && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => hacer(() => tesEditarPago(id, v), "Pago guardado.")}>{ocupado ? <span className="spinner" /> : null} Guardar cambios</button>}
        {modo === "asociar" && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => hacer(() => tesAsociarPago(id, asoc.map((a) => ({ movimientoId: a.movimientoId, valor: a.valor }))), "Movimientos asociados.")}>{ocupado ? <span className="spinner" /> : null} Guardar asociaciones</button>}
      </>}>
      <div className="tes-cuadre">
        <div><span>Programado</span><strong className={`tes-num ${p.valor < 0 ? "tes-neg" : "tes-pos"}`}>{p.valorTexto}</strong></div>
        <div><span>Asociado</span><strong className="tes-num">{p.movimientos ? p.asignadoTexto : "—"}</strong></div>
        <div><span>Diferencia</span><strong className={`tes-num ${p.diferencia && Math.abs(p.diferencia) > 0.5 ? "tes-neg" : ""}`}>{p.diferencia == null ? "Sin movimientos" : Math.abs(p.diferencia) < 0.5 ? "Cuadra" : p.diferencia > 0 ? `Faltan ${p.diferenciaTexto}` : `Sobran ${fmtMoneda(-p.diferencia, p.moneda)}`}</strong></div>
        <div><span>Estado</span><EstadoPago estado={p.estado} vencido={vencido} /></div>
      </div>
      {p.diferencia != null && Math.abs(p.diferencia) > 0.5 && modo === "ver" && <div className="tes-ayuda"><div>Lo asociado no da igual a lo programado. Si el recibo vino por otro valor, corrige el valor del pago en «Editar datos»; si falta otro movimiento, asócialo.</div></div>}
      {puedeRegistrar && modo === "ver" && (
        <div className="tes-seccion">
          <div className="tes-seccion-t"><h4>Estado</h4><small>puedes cambiarlo a mano, aunque no haya soporte</small></div>
          <div className="tes-seg" role="group" aria-label="Estado del pago">
            <button type="button" className={p.estado === "P" ? "on" : ""} disabled={ocupado || p.movimientos > 0} title={p.movimientos ? "Tiene movimientos asociados" : undefined} onClick={() => p.estado !== "P" && hacer(() => tesEditarPago(id, { estado: "P" }), "Pago marcado como pendiente.")}>P · Pendiente</button>
            <button type="button" className={p.estado === "E" ? "on" : ""} disabled={ocupado} onClick={() => p.estado !== "E" && hacer(() => tesEditarPago(id, { estado: "E" }), "Pago marcado como pagado.")}>E · Pagado</button>
          </div>
        </div>
      )}
      {modo === "editar" && v && <CamposPago v={v} set={set} cat={cat} />}
      {modo === "asociar" && <AsociadorMovimientos pago={p} lista={asoc} onCambio={setAsoc} />}
      {modo === "ver" && (
        <>
          <h4 className="tes-sub">Movimientos que lo pagan</h4>
          {p.listaMovimientos.length ? (
            <div className="table-scroll">
              <table className="records tes-tabla">
                <thead><tr><th>Fecha</th><th>Banco</th><th>Descripción</th><th>Concepto</th><th style={{ textAlign: "right" }}>Movimiento</th><th style={{ textAlign: "right" }}>Va a este pago</th></tr></thead>
                <tbody>{p.listaMovimientos.map((a) => (
                  <tr key={a.asociacionId} className="clickable" onClick={() => { window.location.href = `/tesoreria/movimientos?id=${a.movimientoId}`; }}>
                    <td>{fechaCorta(a.fecha)}</td><td>{a.banco}</td><td>{a.descripcion}</td><td>{a.concepto || "—"}</td>
                    <td style={{ textAlign: "right" }} className="tes-num">{a.valorMovimientoTexto}</td><td style={{ textAlign: "right" }} className="tes-num"><strong>{a.valorTexto}</strong>{a.origen === "agente" ? " ✨" : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="empty compacta">Todavía no tiene movimientos asociados{p.estado === "E" ? " (está pagado sin movimiento: el agente puede proponerte cuál fue)" : ""}.</div>}
          <div className="tes-detalle">
            <div><span>Medio de pago</span><strong>{p.medioPago || "—"}</strong></div>
            <div><span>Paga</span><strong>{p.pagador || "—"}</strong></div>
            <div><span>Origen</span><strong>{{ importacion: "Plantilla de Excel", periodico: "Gasto periódico", ia: "Propuesto por Nova", manual: "A mano" }[p.origen] || p.origen}</strong></div>
            {p.observacion && <div><span>Observación</span><strong>{p.observacion}</strong></div>}
          </div>
        </>
      )}
      {error && <p className="modal-error">{error}</p>}
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
