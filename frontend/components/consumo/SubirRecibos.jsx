"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { conLeerRecibo, conCrearRecibo, conAgregarSoporte } from "@/lib/consumoApi";
import { fmtMoneda } from "@/lib/moneda";
import { useConfirmar } from "@/components/Confirmar";
import EstadoVacio from "@/components/EstadoVacio";
import { IconFile, IconCheck, IconSpark } from "@/components/icons";
import { SERVICIOS, GRUPOS_CARGO, TIPOS_LECTURA, PuntoServicio, EtiquetaServicio, useCatalogosConsumo, Aviso, fechaCorta, fmtNum, fmtConsumo } from "@/components/consumo/comun";
import { DetalleReciboModal, FormReciboModal } from "@/components/consumo/ReciboModales";

// Subir recibos con Nova: se sueltan varios archivos, Nova lee uno por uno (nada se guarda), propone la sede por
// cuenta, medidor y dirección, y la persona SIEMPRE confirma la sede antes de guardar. Estados de cada archivo:
// cola → leyendo → revisar (falta confirmar) → guardado | duplicado | error | descartado.
const ESTADO = {
  cola: ["En cola", "muted"], leyendo: ["Leyendo…", "muted"], revisar: ["Confirmar sede", "warning"], elegir: ["Elegir sede", "warning"],
  guardado: ["Guardado", "good"], duplicado: ["Ya estaba cargado", "critical"], error: ["No se pudo leer", "critical"], norecibo: ["No es un recibo", "critical"], descartado: ["Descartado", "muted"],
};
const estadoDe = (a) => (a.estado === "revisar" && !a.r?.propuesta?.sedeId ? "elegir" : a.estado);
let consecutivo = 0;

export default function SubirRecibos({ acceso }) {
  const { cat, recargar } = useCatalogosConsumo();
  const { confirmar } = useConfirmar();
  const [lote, setLote] = useState([]);
  const [selId, setSelId] = useState(null);
  const [sedeElegida, setSedeElegida] = useState({}); // id del archivo → sedeId que la persona eligió
  const [cambiando, setCambiando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [detalleId, setDetalleId] = useState(null);
  const [editar, setEditar] = useState(null);
  const [sobre, setSobre] = useState(false);
  const input = useRef(null);
  const leyendo = useRef(false);
  const puede = !!acceso?.puedeRegistrar;
  const cambiarArchivo = (id, cambios) => setLote((l) => l.map((a) => (a.id === id ? { ...a, ...cambios } : a)));

  function agregar(files) {
    const nuevos = [...files].map((file) => ({ id: ++consecutivo, file, nombre: file.name, estado: "cola" }));
    if (nuevos.length) setLote((l) => [...l, ...nuevos]);
  }

  // Lee de a uno: el siguiente en cola empieza cuando termina el anterior.
  useEffect(() => {
    if (leyendo.current) return;
    const sig = lote.find((a) => a.estado === "cola");
    if (!sig) return;
    leyendo.current = true;
    cambiarArchivo(sig.id, { estado: "leyendo" });
    conLeerRecibo(sig.file)
      .then((r) => {
        const estado = !r.esRecibo ? "norecibo" : r.duplicado ? "duplicado" : "revisar";
        cambiarArchivo(sig.id, { estado, r });
        setSelId((s) => s ?? (estado === "revisar" ? sig.id : s));
      })
      .catch((e) => cambiarArchivo(sig.id, { estado: "error", error: e.message }))
      .finally(() => { leyendo.current = false; setLote((l) => [...l]); });
  }, [lote]);

  const sel = lote.find((a) => a.id === selId) || null;
  const l = sel?.r?.leido;
  const p = sel?.r?.propuesta;
  const sedeId = sel ? sedeElegida[sel.id] ?? null : null;
  const sede = cat?.sedes.find((s) => s.id === sedeId);
  const confirmada = !!sede;
  useEffect(() => { setCambiando(false); }, [selId]);
  const cuenta = useMemo(() => {
    if (!sede || !l) return null;
    const k = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return sede.cuentas.find((c) => c.servicio === l.servicio && !c.noAplica && c.numeroCuenta && k(c.numeroCuenta) === k(l.numeroCuenta)) || null;
  }, [sede, l]);
  const cuenta_txt = l?.numeroCuenta || "sin leer";
  const resumen = { guardado: 0, revisar: 0, leyendo: 0 };
  for (const a of lote) { if (a.estado === "guardado") resumen.guardado++; else if (a.estado === "revisar") resumen.revisar++; else if (a.estado === "cola" || a.estado === "leyendo") resumen.leyendo++; }

  async function guardar() {
    if (!sel || !confirmada) return;
    setGuardando(true);
    const empresa = cat.empresas.find((e) => l.empresa && (e.nombre.toLowerCase().includes(l.empresa.toLowerCase().split(" ")[0]) || l.empresa.toLowerCase().includes(e.nombre.toLowerCase().split(" ")[0])));
    const extras = Object.fromEntries((l.extras || []).map((e) => [e.nombre, e.valor]));
    const datos = {
      origen: "nova", numeroFactura: l.numeroFactura, periodoDesde: l.periodoDesde, periodoHasta: l.periodoHasta, dias: l.dias, tipoLectura: l.tipoLectura,
      lecturaAnterior: l.lecturaAnterior, lecturaActual: l.lecturaActual, factor: l.factor, consumo: l.consumo, valorUnitario: l.valorUnitario, vigenciaTarifa: l.vigenciaTarifa,
      cargos: l.cargos, ...(l.cargos.length ? {} : { totalCargos: l.totalCargos ?? l.totalPagar }), saldoAnterior: l.saldoAnterior, totalPagar: l.totalPagar,
      fechaExpedicion: l.fechaExpedicion, fechaPagoOportuno: l.fechaPagoOportuno, fechaSuspension: l.fechaSuspension, medidor: l.medidor, historial: l.historial,
      extras: { ...extras, ...(l.dudas?.length ? { "Dudas de Nova al leer": l.dudas.join(" · ") } : {}), "Archivo leído": sel.nombre },
      ...(cuenta ? { cuentaId: cuenta.id } : { cuenta: { sedeId: sede.id, servicio: l.servicio, empresaId: empresa?.id || null, numeroCuenta: l.numeroCuenta, titular: l.titular, claseUso: l.claseUso, estrato: l.estrato, periodicidad: l.periodicidad || (l.servicio === "acueducto" ? "bimestral" : "mensual"), direccionRecibo: l.direccion, medidor: l.medidor } }),
    };
    try {
      let r = await conCrearRecibo(datos);
      let nota = "";
      try { r = await conAgregarSoporte(r.id, sel.file); } catch (e) { nota = ` El archivo no se adjuntó: ${e.message}`; }
      cambiarArchivo(sel.id, { estado: "guardado", reciboId: r.id });
      setAviso(`Recibo guardado en «${sede.nombre}».${nota}`);
      await recargar();
      const sig = lote.find((a) => a.id !== sel.id && a.estado === "revisar");
      setSelId(sig?.id ?? sel.id);
    } catch (e) {
      cambiarArchivo(sel.id, { error: e.message });
    } finally { setGuardando(false); }
  }
  async function descartar() {
    if (!(await confirmar({ titulo: "Descartar este archivo", mensaje: `«${sel.nombre}» sale del lote sin guardarse.`, detalle: "Si lo necesitas, lo puedes volver a subir.", boton: "Sí, descartar", peligro: true }))) return;
    cambiarArchivo(sel.id, { estado: "descartado" });
  }

  const Campo = ({ t, v }) => <div className="con-leido"><span>{t}</span><strong>{v ?? "—"}</strong></div>;

  return (
    <div className="con-subir">
      <ol className="con-como" aria-label="Cómo funciona">
        {[["Sube los archivos", "PDF, foto o escaneado; varios a la vez"], ["Nova los lee", "Todo lo que trae el recibo"], ["Confirma la sede", "La propone por cuenta y dirección"], ["Revisa y guarda", "Nada se registra solo"]].map(([t, d], i) => <li key={t}><span className="con-paso-n">{i + 1}</span><span><strong>{t}</strong><small>{d}</small></span></li>)}
      </ol>

      <div className="con-subir-cols">
        <div className="con-subir-izq">
          <input ref={input} type="file" multiple accept="application/pdf,image/*" hidden onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
          <button type="button" className={`con-soltar grande${sobre ? " sobre" : ""}`} disabled={!puede} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={(e) => { e.preventDefault(); setSobre(false); if (puede) agregar(e.dataTransfer.files); }}>
            <strong>Arrastra aquí los recibos o elige los archivos</strong>
            <span>{puede ? "Varios a la vez · PDF, JPG o PNG · hasta 10 MB cada uno" : "Necesitas el permiso de registrar en Consumo."}</span>
          </button>

          <div className="card con-lote">
            <div className="con-lote-head"><h3>Este lote · {lote.length} archivo(s)</h3>{lote.length > 0 && <span className="card-sub" style={{ margin: 0 }}>{resumen.guardado} guardado(s) · {resumen.revisar} por revisar{resumen.leyendo ? ` · ${resumen.leyendo} leyendo` : ""}</span>}</div>
            {lote.length === 0 && <EstadoVacio compacto titulo="Aún no subes nada" icono={<IconFile size={20} />}>Los archivos aparecen aquí a medida que Nova los lee.</EstadoVacio>}
            {lote.map((a) => {
              const [texto, cls] = ESTADO[estadoDe(a)];
              const x = a.r?.leido;
              return (
                <button key={a.id} type="button" className={`con-lote-item${selId === a.id ? " activa" : ""}`} onClick={() => setSelId(a.id)}>
                  {x?.servicio ? <PuntoServicio servicio={x.servicio} /> : <span className="con-punto apagado" />}
                  <span className="con-lote-txt"><strong>{a.nombre}</strong><small>{a.estado === "error" ? a.error : a.estado === "norecibo" ? "Nova no lo reconoce como recibo de servicios." : a.r?.duplicado ? a.r.duplicado.motivo : x ? `${SERVICIOS[x.servicio]?.corto || "Servicio sin leer"} · ${x.totalPagar != null ? fmtMoneda(x.totalPagar) : "sin total"}${a.r.propuesta?.sede ? ` · ${a.r.propuesta.sede}` : " · cuenta sin sede"}` : a.estado === "leyendo" ? "Nova lo está leyendo…" : "Esperando turno"}</small></span>
                  <span className={`pill ${cls}`}>{texto}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="card con-revision" aria-label="Revisión del recibo">
          {!sel && <EstadoVacio titulo="Sube un recibo para empezar" icono={<IconSpark size={22} />} accion={<Link className="btn" href="/consumo/recibos">Prefiero registrarlo a mano</Link>}>Aquí verás lo que Nova leyó, la sede que propone y las cuentas que comprobó.</EstadoVacio>}
          {sel && (sel.estado === "cola" || sel.estado === "leyendo") && <EstadoVacio titulo="Nova está leyendo este recibo" icono={<IconSpark size={22} />}>Suele tardar entre 10 y 40 segundos. Puedes seguir subiendo más archivos.</EstadoVacio>}
          {sel && sel.estado === "error" && <EstadoVacio titulo="No se pudo leer" icono={<IconFile size={22} />} accion={<button type="button" className="btn" onClick={() => cambiarArchivo(sel.id, { estado: "cola", error: null })}>Intentar de nuevo</button>}>{sel.error} También puedes registrarlo a mano en Recibos.</EstadoVacio>}
          {sel && sel.estado === "norecibo" && <EstadoVacio titulo="No parece un recibo de servicios" icono={<IconFile size={22} />}>Nova no encontró un recibo de energía, acueducto, gas o aseo en «{sel.nombre}».</EstadoVacio>}
          {sel && sel.estado === "descartado" && <EstadoVacio titulo="Archivo descartado" icono={<IconFile size={22} />}>«{sel.nombre}» no se guardó.</EstadoVacio>}
          {sel && sel.estado === "duplicado" && <EstadoVacio titulo="Este recibo ya estaba cargado" icono={<IconCheck size={22} />} accion={<button type="button" className="btn btn-primary" onClick={() => setDetalleId(sel.r.duplicado.reciboId)}>Ver el recibo cargado</button>}>{sel.r.duplicado.motivo} No se vuelve a registrar.</EstadoVacio>}
          {sel && sel.estado === "guardado" && <EstadoVacio titulo="Recibo guardado" icono={<IconCheck size={22} />} accion={<button type="button" className="btn btn-primary" onClick={() => setDetalleId(sel.reciboId)}>Abrir el recibo</button>}>Quedó registrado con su archivo adjunto. Si algo se leyó mal, ábrelo y edítalo.</EstadoVacio>}

          {sel && sel.estado === "revisar" && l && (
            <>
              <div className="con-rec-hero">
                <div style={{ minWidth: 0 }}>
                  <div className="con-hero-sobre">{[SERVICIOS[l.servicio]?.nombre, l.empresa, l.numeroFactura ? `factura ${l.numeroFactura}` : null].filter(Boolean).join(" · ")}</div>
                  <div className="con-rec-hero-t">{sel.nombre}</div>
                  <div className="con-rec-hero-s">{[l.periodoDesde && l.periodoHasta ? `${fechaCorta(l.periodoDesde)} – ${fechaCorta(l.periodoHasta)}` : "período sin leer", l.dias ? `${l.dias} días` : null, `lectura ${TIPOS_LECTURA[l.tipoLectura].toLowerCase()}`].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="con-rec-hero-total"><strong>{l.totalPagar != null ? fmtMoneda(l.totalPagar) : "—"}</strong><span>{[l.consumo != null ? fmtConsumo(l.consumo, SERVICIOS[l.servicio]?.unidad) : null, l.fechaPagoOportuno ? `pago oportuno ${fechaCorta(l.fechaPagoOportuno)}` : null].filter(Boolean).join(" · ")}</span></div>
              </div>

              <div className={`con-confirma${confirmada ? " lista" : ""}`}>
                {confirmada && !cambiando ? (
                  <>
                    <div><strong><IconCheck size={13} /> Sede confirmada: {sede.nombre}</strong><p>{cuenta ? `Se guarda en la cuenta ${cuenta.numeroCuenta} de esta sede.` : `La cuenta ${cuenta_txt} queda creada en esta sede y Nova la reconocerá en los próximos recibos.`}</p></div>
                    <button type="button" className="btn small" onClick={() => setCambiando(true)}>Cambiar sede</button>
                  </>
                ) : p.sedeId && !cambiando ? (
                  <>
                    <div><strong>¿Este recibo es de {p.sede}?</strong><p>{p.motivo} No se asocia hasta que lo confirmes.</p></div>
                    <div className="con-confirma-acc">
                      <button type="button" className="btn btn-primary" onClick={() => setSedeElegida((s) => ({ ...s, [sel.id]: p.sedeId }))}>Sí, asociar a esta sede</button>
                      <button type="button" className="btn" onClick={() => setCambiando(true)}>No, es de otra sede…</button>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{p.sedeId ? "Elige la sede correcta" : "Primera vez que llega esta cuenta: ¿de qué sede es?"}</strong>
                    <p>{p.sedeId ? "La cuenta del recibo quedará asociada a la sede que elijas." : `${p.motivo} Dime de cuál es y la recuerdo para los próximos recibos.`}{l.direccion ? ` Dirección del recibo: «${l.direccion}».` : ""}</p>
                    <div className="con-confirma-acc">
                      <label htmlFor="sr-sede" className="visually-hidden">Sede de este recibo</label>
                      <select id="sr-sede" defaultValue="" onChange={(e) => { if (e.target.value) { setSedeElegida((s) => ({ ...s, [sel.id]: Number(e.target.value) })); setCambiando(false); } }}>
                        <option value="">Elige la sede…</option>
                        {(cat?.sedes || []).filter((s) => s.activo).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                      {cambiando && <button type="button" className="btn" onClick={() => setCambiando(false)}>Cancelar</button>}
                      <Link className="con-enlace" href="/consumo/sedes">Crear una sede nueva</Link>
                    </div>
                  </div>
                )}
              </div>

              {(sel.r.falta.length > 0 || l.dudas.length > 0) && <div className="con-dudas"><strong>Revisa antes de guardar</strong><ul>{sel.r.falta.map((f) => <li key={f}>Nova no pudo leer {f}.</li>)}{l.dudas.map((d) => <li key={d}>{d}</li>)}</ul></div>}

              <div className="con-leidos">
                <Campo t="Empresa" v={l.empresa} /><Campo t="Número de cuenta" v={l.numeroCuenta} /><Campo t="Medidor" v={l.medidor} /><Campo t="Titular" v={l.titular} />
                <Campo t="Clase de uso" v={[l.claseUso, l.estrato ? `estrato ${l.estrato}` : null].filter(Boolean).join(" · ") || null} /><Campo t="Dirección del recibo" v={l.direccion} />
                <Campo t="Lectura anterior" v={l.lecturaAnterior != null ? fmtNum(l.lecturaAnterior, 2) : null} /><Campo t="Lectura actual" v={l.lecturaActual != null ? fmtNum(l.lecturaActual, 2) : null} />
                <Campo t="Consumo" v={l.consumo != null ? fmtConsumo(l.consumo, SERVICIOS[l.servicio]?.unidad) : null} /><Campo t="Valor unitario" v={l.valorUnitario != null ? `COP ${fmtNum(l.valorUnitario, 2)}` : null} />
                <Campo t="Vigencia de la tarifa" v={l.vigenciaTarifa} /><Campo t="Saldo anterior" v={fmtMoneda(l.saldoAnterior)} />
                <Campo t="Pago oportuno" v={l.fechaPagoOportuno ? fechaCorta(l.fechaPagoOportuno) : null} /><Campo t="Suspensión" v={l.fechaSuspension ? fechaCorta(l.fechaSuspension) : null} />
              </div>

              <h4 className="con-rec-sub">Cargos del recibo</h4>
              {l.cargos.length === 0 ? <p className="card-sub">Nova no pudo separar los cargos: se guarda solo el total.</p> : (
                <div className="con-cargos-lista">
                  {l.cargos.map((c, i) => <div key={i}><span className="con-cargo-grupo">{GRUPOS_CARGO[c.grupo]}</span><span className="con-cargo-concepto">{c.concepto}</span><strong>{fmtMoneda(c.valor)}</strong></div>)}
                  <div className="total"><span /><span className="con-cargo-concepto">Total a pagar</span><strong>{l.totalPagar != null ? fmtMoneda(l.totalPagar) : "—"}</strong></div>
                </div>
              )}

              <div className="con-subir-pie">
                <div className="con-comprobo">
                  <strong>Nova comprobó las cuentas</strong>
                  {sel.r.comprobaciones.length === 0 ? <p>No hubo datos suficientes para comprobar sumas.</p> : <ul>{sel.r.comprobaciones.map((c) => <li key={c.texto} className={c.ok ? "ok" : "mal"}>{c.ok ? "Bien: " : "Revisar: "}{c.texto}</li>)}</ul>}
                </div>
                <div className="con-extras">
                  <strong>También queda guardado (no sale en el informe)</strong>
                  <div>{l.historial.length > 0 && <span>Historial <b>{l.historial.length} período(s)</b></span>}{l.extras.map((e) => <span key={e.nombre}>{e.nombre} <b>{e.valor}</b></span>)}{!l.extras.length && !l.historial.length && <span>Sin datos adicionales</span>}</div>
                </div>
              </div>

              {sel.error && <div className="modal-error" style={{ marginTop: 12 }}>{sel.error}</div>}
              <div className="con-subir-acciones">
                <span className={confirmada ? "card-sub" : "con-falta"} style={{ margin: 0 }}>{confirmada ? "Sede confirmada: ya puedes guardar." : "Falta confirmar la sede para poder guardar."}</span>
                <div className="spacer" />
                <button type="button" className="btn btn-danger-outline" onClick={descartar} disabled={guardando}>Descartar</button>
                <button type="button" className="btn btn-primary" onClick={guardar} disabled={!confirmada || guardando || sel.r.falta.length > 0}>{guardando ? <span className="spinner" /> : null} Guardar recibo</button>
              </div>
              {sel.r.falta.length > 0 && <p className="card-sub" style={{ marginTop: 8 }}>Con esos datos sin leer no se puede guardar desde aquí: regístralo a mano en <Link href="/consumo/recibos">Recibos</Link> y adjunta el archivo.</p>}
            </>
          )}
        </section>
      </div>

      {detalleId && <DetalleReciboModal id={detalleId} acceso={acceso} onClose={() => setDetalleId(null)} onCambio={() => recargar()} onEditar={(r) => { setDetalleId(null); setEditar(r); }} />}
      {editar && cat && <FormReciboModal cat={cat} recibo={editar} onClose={() => setEditar(null)} onSaved={(m, r) => { setEditar(null); setAviso(m); setDetalleId(r.id); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
