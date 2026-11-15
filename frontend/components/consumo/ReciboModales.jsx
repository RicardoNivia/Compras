"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { conRecibo, conCrearRecibo, conEditarRecibo, conBorrarRecibo, conPagoRecibo, conAgregarSoporte, conBorrarSoporte, urlSoporteConsumo } from "@/lib/consumoApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { useConfirmar } from "@/components/Confirmar";
import MoneyInput from "@/components/MoneyInput";
import EstadoVacio from "@/components/EstadoVacio";
import { IconPlus, IconTrash, IconFile, IconCheck } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, PERIODICIDADES, TIPOS_LECTURA, ESTADOS_PAGO, GRUPOS_CARGO, GRUPO_DE_SERVICIO, MESES, PuntoServicio, EtiquetaServicio, Modal, PildoraPago, PildoraLectura, hoyCO, fechaCorta, fmtNum, fmtConsumo, fmtVar, claseVar, creadoPor } from "@/components/consumo/comun";

// Modales de un recibo: el formulario de cuatro pasos (registrar a mano y editar) y el detalle (cargos, soporte, datos
// y pago). Arriba va siempre el mismo encabezado con el resumen en vivo: sede, servicio, período, consumo y total.

const numTexto = (v) => (v == null ? "" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(v));
// "4.280" / "62,5" → 4280 / 62.5 (lecturas y consumos se escriben como en Colombia).
const aNumero = (t) => { const s = String(t ?? "").trim(); if (!s) return null; const x = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : null; };
const dinero = (v) => (v === "" || v == null || v === "-" ? null : Number(v));
const diasEntre = (a, b) => (a && b ? Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1 : null);

function HeroRecibo({ servicio, sede, empresa, periodo, dias, consumo, unidad, total, moneda, pie, etiqueta }) {
  return (
    <div className="con-rec-hero">
      <div style={{ minWidth: 0 }}>
        <div className="con-hero-sobre">{etiqueta}</div>
        <div className="con-rec-hero-t">{sede || "Elige la sede"}{servicio ? ` · ${SERVICIOS[servicio].corto}` : ""}</div>
        <div className="con-rec-hero-s">{[empresa, periodo, dias ? `${dias} días` : null, consumo != null ? fmtConsumo(consumo, unidad) : null].filter(Boolean).join(" · ") || "Completa los pasos y aquí ves cómo va quedando."}</div>
      </div>
      <div className="con-rec-hero-total">
        <strong>{total != null ? fmtMoneda(total, moneda) : "—"}</strong>
        <span>{pie}</span>
      </div>
    </div>
  );
}

const PASOS = [["cuenta", "Sede y cuenta"], ["periodo", "Período y lectura"], ["cargos", "Cargos"], ["pago", "Pago y soporte"]];

export function FormReciboModal({ cat, recibo = null, onClose, onSaved }) {
  const editando = !!recibo;
  const [paso, setPaso] = useState(editando ? "periodo" : "cuenta");
  const [v, set] = useState(() => (recibo ? {
    sedeId: recibo.sedeId, servicio: recibo.servicio, cuentaId: recibo.cuentaId, medidorId: recibo.medidorId || "", medidor: "",
    numeroFactura: recibo.numeroFactura || "", periodoDesde: recibo.periodoDesde, periodoHasta: recibo.periodoHasta, anio: recibo.anio, mes: recibo.mes, mesManual: true,
    tipoLectura: recibo.tipoLectura, lecturaAnterior: numTexto(recibo.lecturaAnterior), lecturaActual: numTexto(recibo.lecturaActual), factor: numTexto(recibo.factor), consumo: numTexto(recibo.consumo), consumoManual: true,
    valorUnitario: recibo.valorUnitario != null ? String(recibo.valorUnitario) : "", vigenciaTarifa: recibo.vigenciaTarifa || "",
    totalCargos: String(recibo.totalCargos), saldoAnterior: recibo.saldoAnterior ? String(recibo.saldoAnterior) : "",
    fechaExpedicion: recibo.fechaExpedicion || "", fechaPagoOportuno: recibo.fechaPagoOportuno || "", fechaSuspension: recibo.fechaSuspension || "",
    estadoPago: recibo.estadoPago, valorPagado: recibo.valorPagado != null ? String(recibo.valorPagado) : "", fechaPago: recibo.fechaPago || "", nota: recibo.nota || "",
  } : {
    sedeId: "", servicio: "energia", cuentaId: "", medidorId: "", medidor: "", numeroFactura: "", periodoDesde: "", periodoHasta: "", anio: "", mes: "", mesManual: false,
    tipoLectura: "real", lecturaAnterior: "", lecturaActual: "", factor: "1", consumo: "", consumoManual: false, valorUnitario: "", vigenciaTarifa: "",
    totalCargos: "", saldoAnterior: "", fechaExpedicion: "", fechaPagoOportuno: "", fechaSuspension: "", estadoPago: "pendiente", valorPagado: "", fechaPago: "", nota: "",
  }));
  const [nueva, setNueva] = useState({ empresaId: "", numeroCuenta: "", titular: "", periodicidad: "mensual" });
  const [cargos, setCargos] = useState(() => (recibo?.cargos || []).map((c) => ({ grupo: c.grupo, concepto: c.concepto, valor: String(c.valor) })));
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const inputArchivo = useRef(null);
  const c = (campo) => (e) => set((x) => ({ ...x, [campo]: e?.target ? e.target.value : e }));

  const sede = cat.sedes.find((s) => s.id === Number(v.sedeId));
  const cuentas = useMemo(() => (sede ? sede.cuentas.filter((x) => x.servicio === v.servicio && !x.noAplica && (x.activo || x.id === v.cuentaId)) : []), [sede, v.servicio, v.cuentaId]);
  const sinServicio = sede?.cuentas.some((x) => x.servicio === v.servicio && x.noAplica);
  const cuenta = cuentas.find((x) => x.id === Number(v.cuentaId));
  const esNueva = !editando && v.cuentaId === "nueva";
  const empresas = cat.empresas.filter((e) => e.activo);
  const unidad = SERVICIOS[v.servicio].unidad;
  const conLectura = v.servicio !== "aseo";

  // Al cambiar de sede o servicio se elige sola la cuenta si hay una; si no hay, se propone crearla.
  useEffect(() => {
    if (editando || !sede) return;
    set((x) => ({ ...x, cuentaId: cuentas.length === 1 ? cuentas[0].id : cuentas.length === 0 && !sinServicio ? "nueva" : cuentas.some((q) => q.id === x.cuentaId) ? x.cuentaId : "", medidorId: "" }));
    setNueva((n) => ({ ...n, periodicidad: v.servicio === "acueducto" ? "bimestral" : "mensual" }));
  }, [sede?.id, v.servicio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que se calcula solo: días, mes de reporte, consumo y totales.
  const dias = diasEntre(v.periodoDesde, v.periodoHasta);
  const anio = v.mesManual ? v.anio : v.periodoHasta ? Number(v.periodoHasta.slice(0, 4)) : "";
  const mes = v.mesManual ? v.mes : v.periodoHasta ? Number(v.periodoHasta.slice(5, 7)) : "";
  const [la, lc, factor] = [aNumero(v.lecturaAnterior), aNumero(v.lecturaActual), aNumero(v.factor) || 1];
  const consumoCalc = la != null && lc != null ? (lc - la) * factor : null;
  const consumo = v.consumoManual ? aNumero(v.consumo) : consumoCalc;
  const sumaCargos = cargos.reduce((s, x) => s + (dinero(x.valor) || 0), 0);
  const totalCargos = cargos.length ? Math.round(sumaCargos * 100) / 100 : dinero(v.totalCargos);
  const totalPagar = totalCargos != null ? Math.round((totalCargos + (dinero(v.saldoAnterior) || 0)) * 100) / 100 : null;
  const valorAseo = v.servicio === "aseo" ? 0 : cargos.filter((x) => x.grupo === "aseo").reduce((s, x) => s + (dinero(x.valor) || 0), 0);
  const costo = totalCargos != null ? totalCargos - valorAseo : null;

  const falta = [
    !sede && "la sede",
    sede && !v.cuentaId && "la cuenta",
    esNueva && !nueva.numeroCuenta.trim() && "el número de cuenta",
    (!v.periodoDesde || !v.periodoHasta) && "las fechas del período",
    dias != null && dias < 1 && "que el período termine después de empezar",
    totalCargos == null && "el total de cargos",
  ].filter(Boolean);

  async function guardar(e) {
    e.preventDefault();
    if (falta.length) return;
    setGuardando(true); setError("");
    const datos = {
      numeroFactura: v.numeroFactura, periodoDesde: v.periodoDesde, periodoHasta: v.periodoHasta, ...(v.mesManual ? { anio: Number(anio), mes: Number(mes) } : {}),
      tipoLectura: v.tipoLectura, lecturaAnterior: conLectura ? la : null, lecturaActual: conLectura ? lc : null, factor, consumo: conLectura ? consumo : null,
      valorUnitario: dinero(v.valorUnitario), vigenciaTarifa: v.vigenciaTarifa, saldoAnterior: dinero(v.saldoAnterior) || 0,
      cargos: cargos.map((x) => ({ grupo: x.grupo, concepto: x.concepto, valor: dinero(x.valor) || 0 })), ...(cargos.length ? {} : { totalCargos }),
      fechaExpedicion: v.fechaExpedicion, fechaPagoOportuno: v.fechaPagoOportuno, fechaSuspension: v.fechaSuspension, nota: v.nota,
      ...(v.medidorId ? { medidorId: Number(v.medidorId) } : { medidor: v.medidor }),
    };
    try {
      let r;
      if (editando) {
        r = await conEditarRecibo(recibo.id, datos);
        if (v.estadoPago !== recibo.estadoPago || dinero(v.valorPagado) !== recibo.valorPagado || (v.fechaPago || null) !== recibo.fechaPago) r = await conPagoRecibo(recibo.id, { estadoPago: v.estadoPago, valorPagado: dinero(v.valorPagado), fechaPago: v.fechaPago });
      } else {
        r = await conCrearRecibo({ ...datos, estadoPago: v.estadoPago, valorPagado: dinero(v.valorPagado), fechaPago: v.fechaPago, ...(esNueva ? { cuenta: { sedeId: sede.id, servicio: v.servicio, empresaId: Number(nueva.empresaId) || null, numeroCuenta: nueva.numeroCuenta, titular: nueva.titular, periodicidad: nueva.periodicidad, medidor: v.medidor } } : { cuentaId: Number(v.cuentaId) }) });
      }
      let avisoSoporte = "";
      if (archivo) { try { r = await conAgregarSoporte(r.id, archivo); } catch (err) { avisoSoporte = ` El soporte no se adjuntó: ${err.message}`; } }
      onSaved(`${editando ? "Recibo actualizado." : "Recibo registrado."}${avisoSoporte}`, r);
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }

  const cambiarCargo = (i, campo, valor) => setCargos((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  const empresaNombre = esNueva ? empresas.find((e) => e.id === Number(nueva.empresaId))?.nombre : cat.empresas.find((e) => e.id === cuenta?.empresaId)?.nombre;

  return (
    <Modal titulo={editando ? "Editar recibo" : "Registrar un recibo a mano"} ancho={900} onClose={onClose} onSubmit={guardar}
      pie={<>
        <span className={falta.length ? "con-falta" : "card-sub"} style={{ margin: 0 }}>{falta.length ? `Falta: ${falta.join(", ")}.` : "Listo para guardar."}</span>
        <div className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={guardando || falta.length > 0}>{guardando ? <span className="spinner" /> : null} {editando ? "Guardar cambios" : "Guardar recibo"}</button>
      </>}>
      <div className="con-rec-form">
        <HeroRecibo etiqueta={editando ? "Editando · así va quedando" : "Registrar a mano · así va quedando"} servicio={sede ? v.servicio : null} sede={sede?.nombre} empresa={empresaNombre}
          periodo={v.periodoDesde && v.periodoHasta ? `${fechaCorta(v.periodoDesde)} – ${fechaCorta(v.periodoHasta)}` : null} dias={dias > 0 ? dias : null} consumo={conLectura ? consumo : null} unidad={unidad}
          total={totalPagar} moneda="COP" pie={v.fechaPagoOportuno ? `vence ${fechaCorta(v.fechaPagoOportuno)}` : "total a pagar"} />

        <div className="con-pasos" role="tablist" aria-label="Pasos del recibo">
          {PASOS.map(([k, t], i) => (
            <button key={k} type="button" role="tab" aria-selected={paso === k} className={`con-paso${paso === k ? " activo" : ""}`} onClick={() => crossfade(() => setPaso(k))}>
              <span className="con-paso-n">{i + 1}</span>{t}
            </button>
          ))}
        </div>

        {paso === "cuenta" && (
          <div className="con-rec-grid">
            <div className="field full"><label htmlFor="rf-sede">Sede del recibo</label>
              <select id="rf-sede" value={v.sedeId} onChange={c("sedeId")} disabled={editando} autoFocus={!editando}>
                <option value="">Elige la sede…</option>
                {[...new Set(cat.sedes.map((s) => s.edificio || "Sin edificio"))].map((ed) => (
                  <optgroup key={ed} label={ed}>{cat.sedes.filter((s) => (s.edificio || "Sin edificio") === ed && (s.activo || s.id === v.sedeId)).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <div className="field full">
              <label id="rf-servicio-l">¿De qué servicio es?</label>
              <div className="con-opciones" role="radiogroup" aria-labelledby="rf-servicio-l">
                {ORDEN_SERVICIOS.map((s) => <button key={s} type="button" role="radio" aria-checked={v.servicio === s} disabled={editando} className={`con-opcion${v.servicio === s ? " activa" : ""}`} onClick={() => set((x) => ({ ...x, servicio: s }))}><PuntoServicio servicio={s} />{SERVICIOS[s].corto}</button>)}
              </div>
            </div>
            {sede && sinServicio && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>Esta sede está marcada sin {SERVICIOS[v.servicio].nombre.toLowerCase()}. Quita ese «no aplica» en Sedes y cuentas para cargarle recibos.</div>}
            {sede && !sinServicio && !editando && (
              <div className="field full">
                <label id="rf-cuenta-l">Cuenta</label>
                <div className="con-elegir" role="radiogroup" aria-labelledby="rf-cuenta-l">
                  {cuentas.map((q) => (
                    <button key={q.id} type="button" role="radio" aria-checked={v.cuentaId === q.id} className={`con-elegir-item${v.cuentaId === q.id ? " activa" : ""}`} onClick={() => set((x) => ({ ...x, cuentaId: q.id, medidorId: "" }))}>
                      <strong>{q.numeroCuenta}</strong><span>{[cat.empresas.find((e) => e.id === q.empresaId)?.nombre, q.titular, `${q.recibos} recibo(s)`].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={esNueva} className={`con-elegir-item${esNueva ? " activa" : ""}`} onClick={() => set((x) => ({ ...x, cuentaId: "nueva", medidorId: "" }))}>
                    <strong>{cuentas.length ? "Es otra cuenta" : "Cuenta nueva"}</strong><span>{cuentas.length ? "La sede cambió de cuenta o tiene más de una." : `Es el primer recibo de ${SERVICIOS[v.servicio].nombre.toLowerCase()} de esta sede: al guardar queda creada la cuenta.`}</span>
                  </button>
                </div>
              </div>
            )}
            {editando && <div className="field full"><label>Cuenta</label><div className="dvalue">{recibo.numeroCuenta}{recibo.empresa ? ` · ${recibo.empresa}` : ""} <span className="muted">(la sede y la cuenta no se cambian al editar)</span></div></div>}
            {esNueva && (
              <>
                <div className="field"><label htmlFor="rf-n-num">Número de cuenta o cuenta contrato</label><input id="rf-n-num" value={nueva.numeroCuenta} maxLength={40} placeholder="Como sale en el recibo" onChange={(e) => setNueva({ ...nueva, numeroCuenta: e.target.value })} /></div>
                <div className="field"><label htmlFor="rf-n-emp">Empresa que factura</label><select id="rf-n-emp" value={nueva.empresaId} onChange={(e) => setNueva({ ...nueva, empresaId: e.target.value })}><option value="">Sin definir</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                <div className="field"><label htmlFor="rf-n-tit">Titular del recibo</label><input id="rf-n-tit" value={nueva.titular} maxLength={200} onChange={(e) => setNueva({ ...nueva, titular: e.target.value })} /></div>
                <div className="field"><label htmlFor="rf-n-per">Cada cuánto llega</label><select id="rf-n-per" value={nueva.periodicidad} onChange={(e) => setNueva({ ...nueva, periodicidad: e.target.value })}>{Object.entries(PERIODICIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
              </>
            )}
            {(cuenta || esNueva || editando) && (
              <>
                <div className="field"><label htmlFor="rf-factura">Número de factura</label><input id="rf-factura" value={v.numeroFactura} maxLength={60} onChange={c("numeroFactura")} /></div>
                {conLectura && (cuenta?.medidores.length
                  ? <div className="field"><label htmlFor="rf-med">Medidor</label><select id="rf-med" value={v.medidorId} onChange={c("medidorId")}><option value="">{cuenta.medidores.length === 1 ? `${cuenta.medidores[0].numero} (el de la cuenta)` : "Sin indicar"}</option>{cuenta.medidores.length > 1 && cuenta.medidores.map((m) => <option key={m.id} value={m.id}>{m.numero}{m.hasta ? ` (hasta ${fechaCorta(m.hasta)})` : ""}</option>)}</select></div>
                  : <div className="field"><label htmlFor="rf-med-t">Medidor (opcional)</label><input id="rf-med-t" value={v.medidor} maxLength={40} placeholder={editando && recibo.medidor ? recibo.medidor : "Número del medidor"} onChange={c("medidor")} /></div>)}
              </>
            )}
          </div>
        )}

        {paso === "periodo" && (
          <div className="con-rec-grid tres">
            <div className="field"><label htmlFor="rf-desde">Desde</label><input id="rf-desde" type="date" value={v.periodoDesde} onChange={c("periodoDesde")} /></div>
            <div className="field"><label htmlFor="rf-hasta">Hasta</label><input id="rf-hasta" type="date" value={v.periodoHasta} min={v.periodoDesde || undefined} onChange={c("periodoHasta")} /></div>
            <div className="field"><label>Días facturados</label><div className="con-auto">{dias > 0 ? dias : "—"}<small>Se calcula con las fechas</small></div></div>
            <div className="field"><label htmlFor="rf-mes">Mes de reporte</label>
              <select id="rf-mes" value={mes} onChange={(e) => set((x) => ({ ...x, mesManual: true, mes: Number(e.target.value), anio: anio || Number(hoyCO().slice(0, 4)) }))}><option value="">—</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="rf-anio">Año de reporte</label><input id="rf-anio" type="number" min="2000" max="2100" value={anio} onChange={(e) => set((x) => ({ ...x, mesManual: true, anio: e.target.value, mes: mes || 1 }))} /></div>
            <div className="field"><label htmlFor="rf-tipo">Tipo de lectura</label><select id="rf-tipo" value={v.tipoLectura} onChange={c("tipoLectura")}>{Object.entries(TIPOS_LECTURA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            {conLectura && (
              <>
                <div className="field"><label htmlFor="rf-la">Lectura anterior</label><input id="rf-la" inputMode="decimal" value={v.lecturaAnterior} onChange={c("lecturaAnterior")} /></div>
                <div className="field"><label htmlFor="rf-lc">Lectura actual</label><input id="rf-lc" inputMode="decimal" value={v.lecturaActual} onChange={c("lecturaActual")} /></div>
                <div className="field"><label htmlFor="rf-factor">Factor del medidor</label><input id="rf-factor" inputMode="decimal" value={v.factor} onChange={c("factor")} /></div>
                <div className="field"><label htmlFor="rf-consumo">Consumo ({unidad === "m3" ? "m³" : unidad})</label>
                  <input id="rf-consumo" inputMode="decimal" value={v.consumoManual ? v.consumo : consumoCalc != null ? numTexto(consumoCalc) : ""} onChange={(e) => set((x) => ({ ...x, consumoManual: e.target.value !== "", consumo: e.target.value }))} />
                  <small className="con-nota-campo">{v.consumoManual ? (consumoCalc != null && Math.abs(consumoCalc - (consumo ?? 0)) > 0.001 ? `Las lecturas dan ${numTexto(consumoCalc)}: revisa si es lectura promediada.` : "Escrito a mano.") : consumoCalc != null ? `${numTexto(lc)} − ${numTexto(la)}${factor !== 1 ? ` × ${numTexto(factor)}` : ""}` : "Se calcula con las lecturas, o escríbelo."}</small>
                </div>
                <div className="field"><label htmlFor="rf-unit">Valor unitario (por {unidad === "m3" ? "m³" : unidad})</label><MoneyInput id="rf-unit" prefix="COP" decimales={4} value={v.valorUnitario} onChange={c("valorUnitario")} /></div>
                <div className="field"><label htmlFor="rf-vig">Vigencia de la tarifa</label><input id="rf-vig" value={v.vigenciaTarifa} maxLength={40} placeholder="SEP/2026" onChange={c("vigenciaTarifa")} /></div>
              </>
            )}
          </div>
        )}

        {paso === "cargos" && (
          <div className="con-rec-grid">
            <div className="field full">
              <label>Cargos del recibo</label>
              {cargos.length === 0 && <p className="card-sub" style={{ margin: "0 0 8px" }}>Puedes escribir solo el total, o detallar los cargos (energía, contribución, alumbrado, aseo…) para que los reportes muestren en qué se va la plata.</p>}
              <div className="con-cargos">
                {cargos.map((x, i) => (
                  <div key={i} className="con-cargo">
                    <select aria-label={`Grupo del cargo ${i + 1}`} value={x.grupo} onChange={(e) => cambiarCargo(i, "grupo", e.target.value)}>{Object.entries(GRUPOS_CARGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                    <input aria-label={`Concepto del cargo ${i + 1}`} value={x.concepto} maxLength={200} placeholder="Concepto, como sale en el recibo" onChange={(e) => cambiarCargo(i, "concepto", e.target.value)} />
                    <MoneyInput ariaLabel={`Valor del cargo ${i + 1}`} prefix="COP" decimales={2} permitirNegativo value={x.valor} onChange={(val) => cambiarCargo(i, "valor", val)} />
                    <button type="button" className="icon-action-btn delete" title="Quitar este cargo" aria-label={`Quitar el cargo ${x.concepto || i + 1}`} onClick={() => setCargos((l) => l.filter((_, j) => j !== i))}><IconTrash size={13} /></button>
                  </div>
                ))}
                <button type="button" className="btn small" onClick={() => setCargos((l) => [...l, { grupo: GRUPO_DE_SERVICIO[v.servicio], concepto: "", valor: "" }])}><IconPlus size={12} /> Agregar cargo</button>
              </div>
            </div>
            {cargos.length === 0
              ? <div className="field"><label htmlFor="rf-total">Total cargos del período</label><MoneyInput id="rf-total" prefix="COP" decimales={2} value={v.totalCargos} onChange={c("totalCargos")} /></div>
              : <div className="field"><label>Total cargos del período</label><div className="con-auto">{fmtMoneda(totalCargos, "COP")}<small>Suma de los cargos</small></div></div>}
            <div className="field"><label htmlFor="rf-saldo">Saldo anterior (negativo si es a favor)</label><MoneyInput id="rf-saldo" prefix="COP" decimales={2} permitirNegativo value={v.saldoAnterior} onChange={c("saldoAnterior")} /></div>
            <div className="field full"><div className="con-calculo">
              <div><span>Total a pagar</span><strong>{totalPagar != null ? fmtMoneda(totalPagar, "COP") : "—"}</strong></div>
              {valorAseo > 0 && <div><span>Aseo (no cuenta en el costo de {SERVICIOS[v.servicio].corto.toLowerCase()})</span><strong>{fmtMoneda(valorAseo, "COP")}</strong></div>}
              {conLectura && <div><span>Por día</span><strong>{consumo != null && dias > 0 ? `${fmtNum(consumo / dias, 1)} ${unidad === "m3" ? "m³" : unidad}` : "—"}</strong></div>}
              <div><span>Costo por día</span><strong>{costo != null && dias > 0 ? fmtMoneda(costo / dias, "COP") : "—"}</strong></div>
              {conLectura && <div><span>Costo efectivo por {unidad === "m3" ? "m³" : unidad}</span><strong>{costo != null && consumo ? fmtMoneda(costo / consumo, "COP") : "—"}</strong></div>}
            </div></div>
          </div>
        )}

        {paso === "pago" && (
          <div className="con-rec-grid tres">
            <div className="field"><label htmlFor="rf-exp">Fecha de expedición</label><input id="rf-exp" type="date" value={v.fechaExpedicion} onChange={c("fechaExpedicion")} /></div>
            <div className="field"><label htmlFor="rf-opo">Pago oportuno</label><input id="rf-opo" type="date" value={v.fechaPagoOportuno} onChange={c("fechaPagoOportuno")} /></div>
            <div className="field"><label htmlFor="rf-sus">Fecha de suspensión</label><input id="rf-sus" type="date" value={v.fechaSuspension} onChange={c("fechaSuspension")} /></div>
            <div className="field full">
              <label id="rf-pago-l">¿Ya se pagó?</label>
              <div className="con-opciones" role="radiogroup" aria-labelledby="rf-pago-l">
                {Object.entries(ESTADOS_PAGO).map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={v.estadoPago === k} className={`con-opcion${v.estadoPago === k ? " activa" : ""}`} onClick={() => set((x) => ({ ...x, estadoPago: k, fechaPago: k === "pagado" ? x.fechaPago || hoyCO() : "", valorPagado: k === "pagado" ? x.valorPagado : "" }))}>{t}</button>)}
              </div>
            </div>
            {v.estadoPago === "pagado" && (
              <>
                <div className="field"><label htmlFor="rf-vp">Valor pagado</label><MoneyInput id="rf-vp" prefix="COP" decimales={2} value={v.valorPagado} placeholder={totalPagar != null ? new Intl.NumberFormat("es-CO").format(totalPagar) : ""} onChange={c("valorPagado")} /><small className="con-nota-campo">En blanco = el total a pagar.</small></div>
                <div className="field"><label htmlFor="rf-fp">Fecha de pago</label><input id="rf-fp" type="date" value={v.fechaPago} onChange={c("fechaPago")} /></div>
              </>
            )}
            <div className="field full">
              <label>Soporte (el PDF o la foto del recibo)</label>
              <input ref={inputArchivo} type="file" accept="application/pdf,image/*" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
              {archivo
                ? <div className="con-archivo"><IconFile size={15} /><span>{archivo.name}</span><button type="button" className="btn small btn-ghost" onClick={() => { setArchivo(null); if (inputArchivo.current) inputArchivo.current.value = ""; }}>Quitar</button></div>
                : <button type="button" className="con-soltar" onClick={() => inputArchivo.current?.click()}><strong>Adjunta el recibo</strong><span>PDF o foto, hasta 10 MB · queda guardado con el registro{editando && recibo.soportes.length ? ` (ya tiene ${recibo.soportes.length})` : ""}</span></button>}
            </div>
            <div className="field full"><label htmlFor="rf-nota">Nota</label><textarea id="rf-nota" rows={2} maxLength={1000} value={v.nota} onChange={c("nota")} placeholder="Lo que haga falta recordar de este recibo" /></div>
          </div>
        )}
        {error && <div className="modal-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </Modal>
  );
}

const Dato = ({ t, children, mono = false }) => <div className="detail-item"><div className="dlabel">{t}</div><div className={`dvalue${mono ? " mono" : ""}`}>{children ?? <span className="muted">—</span>}</div></div>;

export function DetalleReciboModal({ id, acceso, onClose, onCambio, onEditar }) {
  const { confirmar } = useConfirmar();
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resumen");
  const [ocupado, setOcupado] = useState(false);
  const [pagando, setPagando] = useState(null); // { valor, fecha }
  const inputArchivo = useRef(null);
  useEffect(() => { conRecibo(id).then(setR).catch((e) => setError(e.message)); }, [id]);
  const puede = !!acceso?.puedeRegistrar;

  async function hacer(fn) {
    setOcupado(true); setError("");
    try { const x = await fn(); if (x?.id) setR(x); onCambio(); return x; } catch (e) { setError(e.message); return null; } finally { setOcupado(false); }
  }
  async function eliminar() {
    if (!(await confirmar({ titulo: "Eliminar el recibo", mensaje: `Se elimina el recibo de ${SERVICIOS[r.servicio].nombre.toLowerCase()} de «${r.sede}» (${r.periodo}).`, detalle: `Se van con él sus ${r.cargos.length} cargo(s) y ${r.soportes.length} soporte(s). Queda registrado en Auditoría y no se puede deshacer.`, boton: "Sí, eliminar", peligro: true }))) return;
    setOcupado(true);
    try { await conBorrarRecibo(r.id); onCambio("Recibo eliminado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  async function quitarSoporte(s) {
    if (!(await confirmar({ titulo: "Quitar el soporte", mensaje: `Se quita «${s.nombre}» de este recibo.`, detalle: "El archivo se borra; el recibo se conserva.", boton: "Sí, quitar", peligro: true }))) return;
    hacer(() => conBorrarSoporte(s.id));
  }
  async function volverPendiente() {
    if (!(await confirmar({ titulo: "Quitar el pago", mensaje: "El recibo vuelve a quedar por pagar.", detalle: `Se borra el valor pagado (${fmtMoneda(r.valorPagado ?? 0, r.moneda)}) y su fecha.`, boton: "Sí, quitar el pago", peligro: true }))) return;
    hacer(() => conPagoRecibo(r.id, { estadoPago: "pendiente" }));
  }

  if (!r) return <Modal titulo="Recibo" onClose={onClose}>{error ? <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div> : <div className="skeleton-bar" style={{ height: 180, borderRadius: 12, gridColumn: "1 / -1" }} />}</Modal>;
  const u = r.unidad === "m3" ? "m³" : r.unidad;
  const conLectura = r.servicio !== "aseo";

  return (
    <Modal titulo="Recibo" sub={`${SERVICIOS[r.servicio].nombre} · ${r.mesTexto}`} ancho={900} onClose={onClose}
      pie={<>
        {acceso?.puedeAdministrar && <button type="button" className="btn btn-danger-outline" onClick={eliminar} disabled={ocupado}>Eliminar</button>}
        <div className="spacer" />
        {puede && <button type="button" className="btn" onClick={() => onEditar(r)} disabled={ocupado}>Editar</button>}
        <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      <div className="con-rec-form">
        <HeroRecibo etiqueta={`${r.empresa || SERVICIOS[r.servicio].nombre}${r.numeroFactura ? ` · factura ${r.numeroFactura}` : ""}`} servicio={r.servicio} sede={r.sede} periodo={r.periodo} dias={r.dias} consumo={conLectura ? r.consumo : null} unidad={r.unidad}
          total={r.totalPagar} moneda={r.moneda} pie={r.estadoPago === "pagado" ? `pagado ${fechaCorta(r.fechaPago)}` : r.fechaPagoOportuno ? `pago oportuno ${fechaCorta(r.fechaPagoOportuno)}` : "total a pagar"} />

        <div className="con-rec-pago">
          <div><strong>¿Ya se pagó?</strong> <PildoraPago recibo={r} />{r.estadoPago === "pagado" && <small>{fmtMoneda(r.valorPagado ?? 0, r.moneda)} el {fechaCorta(r.fechaPago)}{r.valorPagado != null && Math.abs(r.valorPagado - r.totalPagar) > 0.5 ? ` · ${r.valorPagado > r.totalPagar ? "pagó de más" : "faltan"} ${fmtMoneda(Math.abs(r.valorPagado - r.totalPagar), r.moneda)}` : ""}</small>}{r.vencido && <small>Venció el {fechaCorta(r.fechaPagoOportuno)}{r.fechaSuspension ? ` · suspensión ${fechaCorta(r.fechaSuspension)}` : ""}</small>}</div>
          {puede && !pagando && (r.estadoPago === "pagado"
            ? <button type="button" className="btn small" onClick={volverPendiente} disabled={ocupado}>Quitar el pago</button>
            : <button type="button" className="btn small btn-primary" onClick={() => setPagando({ valor: String(r.totalPagar), fecha: hoyCO() })} disabled={ocupado}><IconCheck size={12} /> Marcar como pagado</button>)}
          {pagando && (
            <div className="con-rec-pagar">
              <div className="field"><label htmlFor="rd-vp">Valor pagado</label><MoneyInput id="rd-vp" prefix={r.moneda} decimales={2} value={pagando.valor} onChange={(x) => setPagando({ ...pagando, valor: x })} /></div>
              <div className="field"><label htmlFor="rd-fp">Fecha de pago</label><input id="rd-fp" type="date" value={pagando.fecha} max={hoyCO()} onChange={(e) => setPagando({ ...pagando, fecha: e.target.value })} /></div>
              <button type="button" className="btn small btn-primary" disabled={ocupado || !pagando.fecha} onClick={async () => { if (await hacer(() => conPagoRecibo(r.id, { estadoPago: "pagado", valorPagado: dinero(pagando.valor), fechaPago: pagando.fecha }))) setPagando(null); }}>Guardar pago</button>
              <button type="button" className="btn small" onClick={() => setPagando(null)}>Cancelar</button>
            </div>
          )}
        </div>

        <div className="con-pasos" role="tablist" aria-label="Secciones del recibo">
          {[["resumen", "Resumen y cargos"], ["soporte", `Soporte${r.soportes.length ? ` (${r.soportes.length})` : ""}`], ["datos", "Todos los datos"]].map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`con-paso${tab === k ? " activo" : ""}`} onClick={() => crossfade(() => setTab(k))}>{t}</button>
          ))}
        </div>

        {tab === "resumen" && (
          <>
            <div className="con-calculo">
              {conLectura && <div><span>Consumo</span><strong>{fmtConsumo(r.consumo, r.unidad)}</strong><small className={claseVar(r.varConsumo)}>{fmtVar(r.varConsumo)} frente al anterior</small></div>}
              {conLectura && <div><span>Por día</span><strong>{r.consumoDia != null ? `${fmtNum(r.consumoDia, 1)} ${u}` : "—"}</strong><small className={claseVar(r.varConsumoDia)}>{fmtVar(r.varConsumoDia)}</small></div>}
              {conLectura && <div><span>Valor unitario</span><strong>{r.valorUnitario != null ? `${r.moneda} ${fmtNum(r.valorUnitario, 2)}` : "—"}</strong><small className={claseVar(r.varUnitario)}>{fmtVar(r.varUnitario)}</small></div>}
              <div><span>Total cargos{r.valorAseo ? " (sin aseo)" : ""}</span><strong>{fmtMoneda(r.costoServicio, r.moneda)}</strong><small className={claseVar(r.varTotal)}>{fmtVar(r.varTotal)}</small></div>
              <div><span>Costo por día</span><strong>{r.costoDia != null ? fmtMoneda(r.costoDia, r.moneda) : "—"}</strong></div>
              {conLectura && <div><span>Costo efectivo por {u}</span><strong>{r.costoUnidad != null ? fmtMoneda(r.costoUnidad, r.moneda) : "—"}</strong></div>}
            </div>
            {!r.anteriorId && <p className="card-sub" style={{ margin: "8px 0 0" }}>Es el primer recibo de este servicio en la sede: todavía no hay con qué comparar.</p>}
            <h4 className="con-rec-sub">Cargos del recibo</h4>
            {r.cargos.length === 0
              ? <EstadoVacio compacto titulo="Sin detalle de cargos">Solo se registró el total ({fmtMoneda(r.totalCargos, r.moneda)}). {puede ? "Edita el recibo para detallarlos." : ""}</EstadoVacio>
              : (
                <div className="con-cargos-lista">
                  {r.cargos.map((x) => <div key={x.id}><span className="con-cargo-grupo">{GRUPOS_CARGO[x.grupo]}</span><span className="con-cargo-concepto">{x.concepto}</span><strong>{fmtMoneda(x.valor, r.moneda)}</strong></div>)}
                  <div className="total"><span /><span className="con-cargo-concepto">Total cargos del período</span><strong>{fmtMoneda(r.totalCargos, r.moneda)}</strong></div>
                  {r.saldoAnterior !== 0 && <div><span /><span className="con-cargo-concepto">Saldo anterior</span><strong>{fmtMoneda(r.saldoAnterior, r.moneda)}</strong></div>}
                  <div className="total"><span /><span className="con-cargo-concepto">Total a pagar</span><strong>{fmtMoneda(r.totalPagar, r.moneda)}</strong></div>
                </div>
              )}
          </>
        )}

        {tab === "soporte" && (
          <>
            <input ref={inputArchivo} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) hacer(() => conAgregarSoporte(r.id, a)); }} />
            {r.soportes.length === 0 && <EstadoVacio compacto titulo="Sin soporte" icono={<IconFile size={20} />} accion={puede ? <button type="button" className="btn btn-primary" onClick={() => inputArchivo.current?.click()} disabled={ocupado}>Adjuntar el recibo</button> : null}>Adjunta el PDF o la foto del recibo para tenerlo a la mano.</EstadoVacio>}
            {r.soportes.map((s) => (
              <div key={s.id} className="con-archivo">
                <IconFile size={15} />
                <a href={urlSoporteConsumo(s.id)} target="_blank" rel="noreferrer">{s.nombre}</a>
                <small>{fmtNum(s.tamano / 1024, 0)} KB · {s.creadoPorNombre || "—"} · {fechaCorta(String(s.createdAt).slice(0, 10))}</small>
                {puede && <button type="button" className="btn small btn-ghost" onClick={() => quitarSoporte(s)} disabled={ocupado}>Quitar</button>}
              </div>
            ))}
            {r.soportes.length > 0 && puede && <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => inputArchivo.current?.click()} disabled={ocupado}><IconPlus size={12} /> Adjuntar otro</button>}
          </>
        )}

        {tab === "datos" && (
          <div className="detail-grid con-rec-datos">
            <Dato t="Sede">{r.sede}</Dato><Dato t="Servicio"><EtiquetaServicio servicio={r.servicio} /></Dato>
            <Dato t="Empresa">{r.empresa}</Dato><Dato t="Número de cuenta" mono>{r.numeroCuenta}</Dato>
            <Dato t="Titular">{r.titular}</Dato><Dato t="Número de factura" mono>{r.numeroFactura}</Dato>
            <Dato t="Período facturado">{r.periodo}</Dato><Dato t="Días facturados" mono>{r.dias}</Dato>
            <Dato t="Mes de reporte">{r.mesTexto}</Dato><Dato t="Tipo de lectura"><PildoraLectura tipo={r.tipoLectura} /></Dato>
            {conLectura && <><Dato t="Medidor" mono>{r.medidor}</Dato><Dato t="Factor" mono>{fmtNum(r.factor, 4)}</Dato>
              <Dato t="Lectura anterior" mono>{r.lecturaAnterior != null ? fmtNum(r.lecturaAnterior, 4) : null}</Dato><Dato t="Lectura actual" mono>{r.lecturaActual != null ? fmtNum(r.lecturaActual, 4) : null}</Dato>
              <Dato t="Consumo" mono>{fmtConsumo(r.consumo, r.unidad)}</Dato><Dato t="Valor unitario" mono>{r.valorUnitario != null ? `${r.moneda} ${fmtNum(r.valorUnitario, 4)}` : null}</Dato>
              <Dato t="Vigencia de la tarifa">{r.vigenciaTarifa}</Dato></>}
            <Dato t="Total cargos del período" mono>{fmtMoneda(r.totalCargos, r.moneda)}</Dato><Dato t="Saldo anterior" mono>{fmtMoneda(r.saldoAnterior, r.moneda)}</Dato>
            <Dato t="Total a pagar" mono>{fmtMoneda(r.totalPagar, r.moneda)}</Dato><Dato t="Fecha de expedición">{r.fechaExpedicion ? fechaCorta(r.fechaExpedicion) : null}</Dato>
            <Dato t="Pago oportuno">{r.fechaPagoOportuno ? fechaCorta(r.fechaPagoOportuno) : null}</Dato><Dato t="Fecha de suspensión">{r.fechaSuspension ? fechaCorta(r.fechaSuspension) : null}</Dato>
            <Dato t="Origen">{r.origen === "nova" ? "Leído por Nova" : "Registrado a mano"}</Dato><Dato t="Creado">{creadoPor(r).replace("Creado por ", "")}</Dato>
            {r.nota && <div className="detail-item full"><div className="dlabel">Nota</div><div className="dvalue">{r.nota}</div></div>}
          </div>
        )}
        {error && <div className="modal-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </Modal>
  );
}
