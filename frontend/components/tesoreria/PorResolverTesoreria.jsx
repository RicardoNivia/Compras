"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EstadoVacio from "@/components/EstadoVacio";
import { tesPorResolver, tesResolverPendiente, tesVencidosHeredados, tesMarcarPagadosLote } from "@/lib/tesoreriaApi";
import { IconCheck, IconAlert, IconSpark } from "@/components/icons";
import { Aviso, Modal, useCatalogos, fechaCorta, fechaSinAnio, MESES } from "@/components/tesoreria/comun";
import { ExtractoModal, SoportesLoteModal } from "@/components/tesoreria/MovimientoModales";
import SoportesCorreo from "@/components/tesoreria/SoportesCorreo";

const PAGE = 10;

// «Por resolver»: la bandeja del operador. Arriba el flujo del mes (extractos → asociar → diferencias → soportes) con lo
// que falta en cada paso; debajo, cada pendiente con su acción. Al final, la limpieza de vencidos heredados (pendientes
// viejos del Excel que distorsionan lo que ve el gerente), que se revisa uno por uno y se marca en bloque.
export default function PorResolverTesoreria({ acceso }) {
  const { cat } = useCatalogos();
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [pLineas, setPLineas] = useState(1);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;
  const cargar = useCallback(() => tesPorResolver().then((r) => { setD(r); setError(""); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  async function hacer(clave, fn, msg) {
    setOcupado(clave); setError("");
    try { await fn(); setAviso(msg); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  if (error && !d) return <p className="modal-error">{error}</p>;
  if (!d) return <div className="card"><span className="spinner" /></div>;
  const totalPendiente = d.pasos.reduce((s, p) => s + p.pendiente, 0);
  const lineasPag = d.lineasPendientes.slice((pLineas - 1) * PAGE, pLineas * PAGE);
  return (
    <div className="tes-vista pr">
      {/* Flujo del mes */}
      <section className="pr-flujo" aria-label="Flujo del mes">
        {d.pasos.map((p, i) => (
          <a key={p.k} href={`#pr-${p.k}`} className={`pr-paso${p.pendiente ? "" : " ok"}`}>
            <span className="pr-paso-n">{p.pendiente ? i + 1 : <IconCheck size={14} />}</span>
            <span className="pr-paso-txt"><strong>{p.titulo}</strong><small>{p.pendiente ? `${p.pendiente.toLocaleString("es-CO")} pendiente(s)` : "Al día"}</small></span>
          </a>
        ))}
      </section>
      {totalPendiente === 0 && <div className="card"><EstadoVacio titulo="Todo al día">No hay soportes del correo, extractos, asociaciones, diferencias ni soportes pendientes.</EstadoVacio></div>}

      {/* 1. Soportes que llegaron al correo de soportes */}
      <SoportesCorreo cat={cat} puede={puede} onCambio={cargar} />

      {/* 2. Extractos */}
      <section id="pr-extractos" className="card pr-sec">
        <div className="card-head"><div><h3>2 · Extractos</h3><span className="card-sub">Sin el extracto de un mes ya cerrado, el saldo de esa cuenta no es real.</span></div>
          {puede && cat && <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "extracto" })}>Subir extracto</button>}</div>
        {d.mesesSinExtracto.length ? d.mesesSinExtracto.map((b) => (
          <div key={b.bancoId} className="tes-tarea">
            <span className="tes-punto" style={{ background: b.meses.length ? "var(--warning)" : "var(--critical)" }} />
            <div><strong>{b.banco}</strong><small>{b.meses.length ? `Falta el extracto de: ${b.mesesTexto}.` : ""}{b.noCuadran.length ? ` No cuadra en ${b.noCuadran.map((x) => `${MESES[x.mes - 1].toLowerCase()} (${x.diferenciaTexto})`).join(", ")}.` : ""}</small></div>
            {puede && cat && b.meses.length > 0 && <button type="button" className="btn small" onClick={() => setModal({ tipo: "extracto", bancoId: b.bancoId })}>Subir extracto</button>}
            {b.noCuadran.length > 0 && <Link className="btn small" href={`/tesoreria/conciliacion?anio=${d.hoy.slice(0, 4)}&mes=${b.noCuadran[0].mes}&bancoId=${b.bancoId}`}>Conciliar</Link>}
          </div>
        )) : <div className="empty compacta">Todas las cuentas tienen el extracto de los meses cerrados.</div>}
        {d.lineasPendientes.length > 0 && (
          <>
            <h4 className="pr-sub">Líneas de extractos que no se aprobaron · {d.lineasPendientes.length}</h4>
            {lineasPag.map((l) => (
              <div key={`${l.extractoId}-${l.clave}`} className="tes-cand">
                <div><strong>{l.descripcion}</strong><small>{fechaSinAnio(l.fecha)} · {l.banco} · extracto «{l.archivo}»</small></div>
                <span className={`tes-num ${l.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{l.valorTexto}</span>
                {puede && <button type="button" className="btn small btn-primary" disabled={ocupado === `r${l.clave}`} onClick={() => hacer(`r${l.clave}`, () => tesResolverPendiente(l.extractoId, l.clave, "registrar"), "Línea registrada.")}>Registrar</button>}
                {puede && <button type="button" className="btn small" disabled={ocupado === `d${l.clave}`} onClick={() => hacer(`d${l.clave}`, () => tesResolverPendiente(l.extractoId, l.clave, "descartar"), "Línea descartada.")}>Descartar</button>}
              </div>
            ))}
            {d.lineasPendientes.length > PAGE && <Paginita total={d.lineasPendientes.length} page={pLineas} onPage={setPLineas} />}
          </>
        )}
      </section>

      {/* 3. Asociar */}
      <section id="pr-asociar" className="card pr-sec">
        <div className="card-head"><div><h3>3 · Asociar movimientos y pagos</h3><span className="card-sub">{d.movimientosSinPago.total.toLocaleString("es-CO")} movimiento(s) del año sin su pago · {d.propuestas.movimientos + d.propuestas.pagos} propuesta(s) de los agentes por revisar ({d.propuestas.alta} de confianza alta).</span></div>
          <Link className="btn btn-primary" href="/tesoreria/agentes"><IconSpark size={13} /> Ir a los agentes</Link></div>
        {d.movimientosSinPago.recientes.length ? d.movimientosSinPago.recientes.map((m) => (
          <div key={m.id} className="tes-cand">
            <div><strong>{m.descripcion}</strong><small>{fechaSinAnio(m.fecha)} · {m.banco}</small></div>
            <span className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{m.valorTexto}</span>
            <Link className="btn small" href={`/tesoreria/movimientos?id=${m.id}`}>Asociar</Link>
          </div>
        )) : <div className="empty compacta">Cada movimiento tiene su pago.</div>}
        {d.movimientosSinPago.total > d.movimientosSinPago.recientes.length && <span className="card-sub" style={{ margin: 0 }}>Los {d.movimientosSinPago.recientes.length} más recientes. Todos en Movimientos › «Sin asociar».</span>}
      </section>

      {/* 4. Diferencias */}
      <section id="pr-conciliar" className="card pr-sec">
        <div className="card-head"><div><h3>4 · Pagos con diferencia</h3><span className="card-sub">Lo que se pagó no da lo que estaba programado: corrige el valor del pago o revisa el movimiento.</span></div></div>
        {d.pagosConDiferencia.length ? d.pagosConDiferencia.slice(0, 15).map((p) => (
          <div key={p.id} className="tes-cand">
            <div><strong>{p.concepto}</strong><small>{[fechaCorta(p.fecha), p.item].filter(Boolean).join(" · ")} · programado {p.programado} · asociado {p.asociado}</small></div>
            <span className="pill warning tes-num">{p.diferencia}</span>
            <Link className="btn small" href={`/tesoreria/pagos?id=${p.id}`}>Revisar</Link>
          </div>
        )) : <div className="empty compacta">Ningún pago tiene diferencia.</div>}
      </section>

      {/* 5. Soportes */}
      <section id="pr-soportes" className="card pr-sec">
        <div className="card-head"><div><h3>5 · Soportes que faltan</h3><span className="card-sub">Pagos de este mes y el anterior pagados con movimiento del banco pero sin comprobante.</span></div>
          {puede && <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "lote" })}>Subir varios soportes</button>}</div>
        {d.sinSoporte.length ? d.sinSoporte.slice(0, 15).map((p) => (
          <div key={p.id} className="tes-cand"><div><strong>{p.concepto}</strong><small>{[fechaCorta(p.fecha), p.item].filter(Boolean).join(" · ")}</small></div><span className="tes-num">{p.valorTexto}</span><Link className="btn small" href={`/tesoreria/pagos?id=${p.id}`}>Ver</Link></div>
        )) : <div className="empty compacta">Todos los pagos con movimiento tienen su soporte.</div>}
      </section>

      {/* Limpieza de vencidos heredados */}
      <section className="card pr-sec pr-limpieza">
        <div className="card-head"><div><h3>Vencidos heredados</h3><span className="card-sub">Pendientes que vencieron antes del {fechaCorta(d.vencidosHeredados.corte)}. Si ya se pagaron y nunca se marcaron, distorsionan lo que ve el gerente («pagos al día», pendientes).</span></div>
          {puede && d.vencidosHeredados.cantidad > 0 && <button type="button" className="btn" onClick={() => setModal({ tipo: "limpieza" })}>Revisar y marcar como pagados</button>}</div>
        {d.vencidosHeredados.cantidad ? <div className="tes-ayuda tes-ayuda-alerta"><div><IconAlert size={14} /> <strong>{d.vencidosHeredados.cantidad} pago(s) por {d.vencidosHeredados.valorTexto}</strong>, el más viejo del {fechaCorta(d.vencidosHeredados.masViejo)}.</div></div> : <div className="empty compacta">No hay vencidos viejos.</div>}
      </section>

      {modal?.tipo === "extracto" && cat && <ExtractoModal cat={cat} bancoId={modal.bancoId} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); setAviso(msg); cargar(); }} />}
      {modal?.tipo === "lote" && <SoportesLoteModal onClose={() => setModal(null)} onListo={(msg) => { setModal(null); setAviso(msg); cargar(); }} />}
      {modal?.tipo === "limpieza" && <LimpiezaModal corte={d.vencidosHeredados.corte} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); setAviso(msg); cargar(); }} />}
      {error && <p className="modal-error">{error}</p>}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}

function Paginita({ total, page, onPage }) {
  const paginas = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="table-footer">
      <div className="page-btns"><button type="button" className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><button type="button" className="btn small" disabled={page >= paginas} onClick={() => onPage(page + 1)}>Siguiente</button></div>
      <span className="count-note">Página {Math.min(page, paginas)} de {paginas}</span><div className="spacer" /><span className="count-note">{total} en total</span>
    </div>
  );
}

// Limpieza: lista de los vencidos antes de la fecha elegida, todos marcados; la persona desmarca los que de verdad
// siguen sin pagar y confirma. Queda una sola entrada de auditoría y no se envían avisos por cada uno.
function LimpiezaModal({ corte, onClose, onListo }) {
  const [hasta, setHasta] = useState(corte);
  const [d, setD] = useState(null);
  const [quitar, setQuitar] = useState(new Set());
  const [page, setPage] = useState(1);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setD(null); setQuitar(new Set()); setPage(1); tesVencidosHeredados(hasta).then(setD).catch((e) => setError(e.message)); }, [hasta]);
  const elegidos = useMemo(() => (d?.items || []).filter((p) => !quitar.has(p.id)), [d, quitar]);
  const totalElegido = elegidos.reduce((s, p) => s + Math.abs(p.valor), 0);
  async function marcar() {
    setOcupado(true); setError("");
    try { const r = await tesMarcarPagadosLote(elegidos.map((p) => p.id), `Limpieza de vencidos anteriores al ${hasta}`); onListo(`${r.marcados} pago(s) marcados como pagados (${r.total}).${r.omitidos ? ` ${r.omitidos} omitidos (mes cerrado o ya pagados).` : ""}`); }
    catch (e) { setError(e.message); setOcupado(false); }
  }
  const pag = (d?.items || []).slice((page - 1) * PAGE, page * PAGE);
  return (
    <Modal titulo="Limpiar vencidos heredados" sub="Desmarca los que de verdad siguen sin pagar. Los marcados pasan a pagados (E) sin movimiento, sin un aviso por cada uno; queda una sola entrada en auditoría." onClose={onClose} ancho={900}
      pie={confirmar
        ? <><span className="card-sub" style={{ margin: 0 }}>¿Marcar {elegidos.length} pago(s) como pagados?</span><div className="spacer" /><button type="button" className="btn" onClick={() => setConfirmar(false)}>No</button><button type="button" className="btn btn-primary" onClick={marcar} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Sí, marcarlos</button></>
        : <><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={() => setConfirmar(true)} disabled={!elegidos.length}>Marcar {elegidos.length} como pagados</button></>}>
      <div className="tes-cabecera">
        <div className="field" style={{ width: 210 }}><label htmlFor="lv-hasta">Vencidos antes del</label><input id="lv-hasta" type="date" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} /></div>
        <div className="spacer" />
        {d && <span className="card-sub" style={{ margin: 0 }}><strong>{elegidos.length}</strong> de {d.total} marcados · {totalElegido.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).replace("$", "COP ")}</span>}
        {d && <button type="button" className="btn small" onClick={() => setQuitar(quitar.size ? new Set() : new Set(d.items.map((p) => p.id)))}>{quitar.size ? "Marcar todos" : "Desmarcar todos"}</button>}
      </div>
      {!d && !error && <p className="muted"><span className="spinner" /> Cargando…</p>}
      {d && !d.total && <div className="empty compacta">No hay pagos pendientes antes de esa fecha.</div>}
      {d && d.total > 0 && (
        <div className="table-scroll tes-ex-lista">
          <table className="records tes-tabla">
            <thead><tr><th style={{ width: 36 }} /><th>Vencía</th><th>Concepto</th><th>Ítem</th><th>Medio</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
            <tbody>{pag.map((p) => (
              <tr key={p.id} className={quitar.has(p.id) ? "tes-ex-no" : ""} onClick={() => setQuitar((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} style={{ cursor: "pointer" }}>
                <td><input type="checkbox" checked={!quitar.has(p.id)} readOnly aria-label={`Marcar ${p.concepto}`} /></td>
                <td>{fechaCorta(p.fecha)}</td><td>{p.concepto}</td><td>{p.item || "—"}</td><td>{p.medio || "—"}</td>
                <td style={{ textAlign: "right" }} className={`tes-num ${p.valor < 0 ? "tes-neg" : "tes-pos"}`}>{p.valorTexto}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {d && d.total > PAGE && <Paginita total={d.total} page={page} onPage={setPage} />}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
