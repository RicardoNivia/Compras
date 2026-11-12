"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  tesCrearMovimiento, tesEditarMovimiento, tesMovimiento, tesBorrarMovimiento, tesAsociarMovimiento, tesLeerSoporte,
  tesAgregarSoporte, tesBorrarSoporte, urlSoporte, tesPagos, tesAnalizarExtracto, tesAplicarExtracto, tesBuscarPropuestas,
} from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { IconSpark, IconTrash, IconSearch } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";
import { Modal, MESES, hoyCO, fechaCorta, fechaSinAnio, EstadoPago, TipoPago } from "@/components/tesoreria/comun";
import { ConciliacionContable, PistasDiferencia } from "@/components/tesoreria/ConciliacionContable";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const VACIO = { bancoId: "", tipo: "debito", fecha: "", valor: "", descripcion: "", concepto: "", tercero: "", observacion: "", referencia: "", tipoCarga: "", tipoSolicitud: "", preparador: "", formato: "" };

// ---------- Asociar a pagos (lo usan el formulario y el detalle) ----------
// lista: [{ pagoId, valor, pago }] con el valor que va a cada pago. Sugiere pagos del mismo mes (y el anterior) que aún
// esperan movimiento, ordenados por lo parecido del valor; también se puede buscar por texto.
export function AsociadorPagos({ movimiento, lista, onCambio }) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState([]);
  const [cargando, setCargando] = useState(false);
  const valorMov = num(movimiento.valor);
  const fecha = movimiento.fecha || hoyCO();
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const anio = Number(fecha.slice(0, 4));
        const mes = Number(fecha.slice(5, 7));
        const base = q.trim() ? { q: q.trim(), size: 50 } : { anio, mes, size: 100 };
        const [a, b] = await Promise.all([tesPagos({ ...base, asociacion: "sin" }), q.trim() ? Promise.resolve({ items: [] }) : tesPagos({ anio: mes === 1 ? anio - 1 : anio, mes: mes === 1 ? 12 : mes - 1, asociacion: "sin", size: 100 })]);
        const sentidoOk = (p) => (movimiento.tipo === "debito" ? p.tipo === "E" || (p.tipo === "T" && p.valor < 0) : p.tipo === "I" || p.tipo === "J" || (p.tipo === "T" && p.valor > 0));
        const todos = [...a.items, ...b.items].filter((p) => q.trim() || sentidoOk(p));
        todos.sort((x, y) => Math.abs(Math.abs(x.valor) - valorMov) - Math.abs(Math.abs(y.valor) - valorMov));
        if (vivo) setCands(todos.slice(0, 25));
      } catch { if (vivo) setCands([]); } finally { if (vivo) setCargando(false); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, fecha, movimiento.tipo, valorMov]);

  const repartido = lista.reduce((s, a) => s + num(a.valor), 0);
  const resto = valorMov - repartido;
  const agregar = (p) => {
    if (lista.some((a) => a.pagoId === p.id)) return;
    const falta = Math.max(0, valorMov - repartido);
    onCambio([...lista, { pagoId: p.id, valor: String(Math.min(falta || Math.abs(p.valor), Math.abs(p.valor) || falta)), pago: p }]);
  };
  const ya = new Set(lista.map((a) => a.pagoId));
  return (
    <div className="tes-seccion">
      {lista.map((a) => {
        const prog = Math.abs(a.pago?.valor || 0);
        const dif = prog - num(a.valor);
        return (
          <div key={a.pagoId} className="tes-asoc">
            <div>
              <strong>{a.pago?.concepto || `Pago #${a.pagoId}`}</strong>
              <small>{[a.pago?.item, a.pago ? `${MESES[a.pago.mes - 1]} ${a.pago.anio}` : null, a.pago ? `programado ${fmtMoneda(prog, "COP")}` : null].filter(Boolean).join(" · ")}</small>
              {a.pago && <span className={`pill ${Math.abs(dif) < 0.5 ? "good" : "warning"}`} style={{ alignSelf: "flex-start" }}>{Math.abs(dif) < 0.5 ? "Cuadra exacto" : dif > 0 ? `Faltan ${fmtMoneda(dif, "COP")} para completarlo` : `Sobran ${fmtMoneda(-dif, "COP")}`}</span>}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`asoc-${a.pagoId}`}>Va a este pago</label>
              <MoneyInput id={`asoc-${a.pagoId}`} value={a.valor} onChange={(v) => onCambio(lista.map((x) => (x.pagoId === a.pagoId ? { ...x, valor: v } : x)))} prefix="COP" decimales={2} />
            </div>
            <button type="button" className="btn small" onClick={() => onCambio(lista.filter((x) => x.pagoId !== a.pagoId))}>Quitar</button>
          </div>
        );
      })}
      <div className="tes-cuadre">
        <div><span>Movimiento</span><strong className="tes-num">{fmtMoneda(valorMov, "COP")}</strong></div>
        <div><span>Repartido en pagos</span><strong className="tes-num">{fmtMoneda(repartido, "COP")}</strong></div>
        <div><span>Sin asignar</span><strong className={`tes-num ${resto < -0.5 ? "tes-neg" : Math.abs(resto) < 0.5 ? "tes-pos" : ""}`}>{fmtMoneda(resto, "COP")}</strong></div>
      </div>
      {resto < -0.5 && <p className="modal-error" style={{ margin: 0 }}>Repartes más de lo que vale el movimiento.</p>}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="asoc-buscar">Buscar un pago que espera movimiento</label>
        <div className="maestros-search-wrap" style={{ maxWidth: "none" }}>
          <input id="asoc-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Concepto u observación… (vacío = sugeridos del mismo mes)" />
          <span className="ic"><IconSearch size={14} /></span>
        </div>
      </div>
      <span className="card-sub" style={{ margin: 0 }}>{q.trim() ? "Resultados de la búsqueda" : `Sugeridos: pagos de ${MESES[Number(fecha.slice(5, 7)) - 1].toLowerCase()} y el mes anterior sin movimiento, del valor más parecido al más distinto`}</span>
      <div className="tes-lista-cands">
        {cargando && !cands.length && <span className="muted">Buscando…</span>}
        {!cargando && !cands.length && <div className="empty compacta">No hay pagos que esperen movimiento con este criterio.</div>}
        {cands.map((p) => {
          const igual = Math.abs(Math.abs(p.valor) - valorMov) < 0.5;
          return (
            <div key={p.id} className="tes-cand">
              <div><strong>{p.concepto}</strong><small>{[p.item, `${MESES[p.mes - 1]} ${p.anio}`, p.medioPago && `medio ${p.medioPago}`].filter(Boolean).join(" · ")}</small></div>
              <EstadoPago estado={p.estado} />
              <span className="tes-num">{p.valorTexto}</span>
              {igual && <span className="pill good">Mismo valor</span>}
              <button type="button" className="btn small" onClick={() => agregar(p)} disabled={ya.has(p.id)}>{ya.has(p.id) ? "Agregado" : "+ Asociar"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Registrar / editar ----------
// conSoporte: «Registrar con soporte» — empieza pidiendo el comprobante; Nova lo lee, llena el formulario y, si ese pago ya
// está registrado (por ejemplo vino en el extracto), ofrece adjuntar el soporte a ese movimiento en vez de crear otro.
export function FormMovimientoModal({ cat, movimiento, conSoporte = false, onClose, onSaved }) {
  const editando = !!movimiento?.id;
  const [v, set] = useState(() => (movimiento ? { ...VACIO, ...Object.fromEntries(Object.entries(movimiento).map(([k, x]) => [k, x ?? ""])), valor: String(movimiento.valor ?? "") } : { ...VACIO, fecha: hoyCO(), bancoId: cat.bancos.filter((b) => b.activo)[0]?.id || "" }));
  const [asoc, setAsoc] = useState(() => (movimiento?.listaPagos || []).map((a) => ({ pagoId: a.pagoId, valor: String(a.valor), pago: { concepto: a.concepto, item: a.item, mes: a.mes, anio: a.anio, valor: a.valorPago } })));
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [coincidencias, setCoincidencias] = useState([]);
  const [nuevoDeTodasFormas, setNuevoDeTodasFormas] = useState(false);
  const [pagosPos, setPagosPos] = useState([]); // pagos a los que puede corresponder el comprobante
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [masCampos, setMasCampos] = useState(!!(movimiento?.tipoCarga || movimiento?.preparador || movimiento?.formato));
  const fileRef = useRef(null);
  const bancos = cat.bancos.filter((b) => b.activo || b.id === Number(v.bancoId));
  const campo = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ ...v, [k]: e.target.value }) });

  async function leerConNova(a = archivo) {
    if (!a) return;
    setLeyendo(true); setError(""); setAviso(""); setCoincidencias([]); setPagosPos([]); setNuevoDeTodasFormas(false);
    try {
      const r = await tesLeerSoporte(a);
      const l = r.leido;
      const sinT = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const bancoLeido = l.banco ? cat.bancos.find((b) => b.activo && (sinT(l.banco).includes(sinT(b.nombre)) || sinT(b.nombre).split(" ").some((w) => w.length > 3 && sinT(l.banco).includes(w)))) : null;
      setCoincidencias(r.coincidencias || []);
      setPagosPos(r.pagosPosibles || []);
      set((x) => ({ ...x, bancoId: bancoLeido?.id || x.bancoId, tipo: l.tipo || x.tipo, fecha: l.fecha || x.fecha, valor: l.valor ? String(l.valor) : x.valor, tercero: l.tercero || x.tercero, referencia: l.referencia || x.referencia, descripcion: x.descripcion || l.descripcion || "" }));
      setAviso(r.duplicado || "Nova llenó lo que pudo leer del comprobante: revísalo antes de guardar.");
    } catch (e) { setError(e.message); } finally { setLeyendo(false); }
  }

  // Adjunta el soporte al movimiento que ya existía y, si la persona confirmó el pago y ese movimiento no tenía pagos,
  // lo asocia también (el pago queda en E).
  async function adjuntarA(c) {
    setGuardando(true); setError("");
    try {
      await tesAgregarSoporte(c.id, archivo);
      let asociado = "";
      if (asoc.length && !c.pagos) { await tesAsociarMovimiento(c.id, asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor }))); asociado = ` y asociado a «${asoc[0].pago?.concepto}»: el pago quedó en E (pagado)`; }
      onSaved({ id: c.id }, `Soporte adjuntado al movimiento #${c.id}${asociado}. No se creó otro movimiento.`);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  // «Sí, es este pago»: queda en la asociación (sección 4) con el valor del comprobante; al guardar pasa a E.
  const elegirPago = (p) => {
    if (asoc.some((a) => a.pagoId === p.id)) { setAsoc(asoc.filter((a) => a.pagoId !== p.id)); return; }
    setAsoc([{ pagoId: p.id, valor: String(num(v.valor) || Math.abs(p.valor)), pago: { concepto: p.concepto, item: p.item, mes: p.mes, anio: p.anio, valor: p.valor } }]);
  };
  const elegirArchivo = (a) => { setArchivo(a); if (a) leerConNova(a); };

  async function guardar(otro = false) {
    setGuardando(true); setError("");
    try {
      const datos = { ...v, valor: v.valor, asociaciones: asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor })) };
      const m = editando ? await tesEditarMovimiento(movimiento.id, datos) : await tesCrearMovimiento(datos);
      if (archivo) await tesAgregarSoporte(m.id, archivo).catch((e) => setError(`Se guardó, pero el soporte no: ${e.message}`));
      const msg = m.avisoAsociacion ? `Guardado, pero no se pudo asociar: ${m.avisoAsociacion}` : asoc.length ? "Movimiento guardado y asociado: sus pagos quedaron en E." : "Movimiento guardado (sin asociar).";
      if (otro) {
        set({ ...VACIO, fecha: v.fecha, bancoId: v.bancoId, tipo: v.tipo });
        setAsoc([]); setArchivo(null); setAviso(msg);
        onSaved(m, null, true);
      } else onSaved(m, msg);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }

  const banco = cat.bancos.find((b) => b.id === Number(v.bancoId));
  const mostrarForm = !(conSoporte && !archivo) && !leyendo && !(coincidencias.length && !nuevoDeTodasFormas);
  const listo = v.bancoId && v.fecha && num(v.valor) > 0 && v.descripcion.trim();
  return (
    <Modal titulo={editando ? "Editar movimiento del banco" : conSoporte ? "Registrar con soporte" : "Registrar movimiento del banco"} sub={conSoporte && !archivo ? "Sube la foto o el PDF del comprobante de pago: Nova lo lee y te llena el formulario." : "Un solo formulario para todos los bancos. Lo marcado con * es obligatorio."} onClose={onClose} ancho={900}
      pie={!mostrarForm ? <button type="button" className="btn" onClick={onClose}>Cancelar</button> : <>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <div className="spacer" />
        {!editando && <button type="button" className="btn" disabled={!listo || guardando} onClick={() => guardar(true)}>Guardar y registrar otro</button>}
        <button type="button" className="btn btn-primary" disabled={!listo || guardando} onClick={() => guardar(false)}>{guardando ? <span className="spinner" /> : null} Guardar movimiento</button>
      </>}>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => (conSoporte ? elegirArchivo(e.target.files?.[0] || null) : setArchivo(e.target.files?.[0] || null))} />
      {conSoporte && !archivo && (
        <div className="tes-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
          <strong>Sube la foto o el PDF del comprobante</strong>
          <span>Transferencia, PSE, consignación o factura pagada. Nova lee la fecha, el valor, el tercero y la referencia; tú revisas antes de guardar.</span>
        </div>
      )}
      {leyendo && <div className="tes-ayuda"><div><span className="spinner" /> Nova está leyendo «{archivo?.name}»…</div></div>}
      {!leyendo && archivo && pagosPos.length > 0 && (
        <div className="tes-seccion">
          <div className="tes-seccion-t"><h4>¿A qué pago corresponde este comprobante?</h4><small>por valor, fecha y si sale o entra · confirma el que es</small></div>
          {pagosPos.map((p) => {
            const elegido = asoc.some((a) => a.pagoId === p.id);
            return (
              <div key={p.id} className={`tes-posible conf-${p.confianza}${elegido ? " elegido" : ""}`}>
                <div><strong>{p.concepto}</strong><small>{[p.item, `${MESES[p.mes - 1]} ${p.anio}`, `vence ${fechaCorta(p.fecha)}`, p.estado === "E" ? "E sin movimiento" : "P pendiente"].filter(Boolean).join(" · ")}</small><small className="tes-posible-motivo">{p.motivo}</small></div>
                <span className={`agente-conf ${p.confianza}`}>Confianza {p.confianza}</span>
                <span className="tes-num">{p.valorTexto}</span>
                <button type="button" className={`btn small${elegido ? "" : " btn-primary"}`} onClick={() => elegirPago(p)}>{elegido ? "✓ Es este · quitar" : "Sí, es este pago"}</button>
              </div>
            );
          })}
          {asoc.length > 0 && <span className="card-sub" style={{ margin: 0 }}>Al {coincidencias.length && !nuevoDeTodasFormas ? "adjuntar" : "guardar"}, «{asoc[0].pago?.concepto}» queda asociado y pasa a E (pagado). Si el valor no coincide verás la diferencia en el pago.</span>}
        </div>
      )}
      {!leyendo && archivo && !pagosPos.length && conSoporte && <div className="tes-ayuda"><div>No encontré un pago programado con un valor parecido cerca de esa fecha. Puedes buscarlo a mano en la sección 4 o guardarlo sin asociar.</div></div>}
      {!leyendo && coincidencias.length > 0 && !nuevoDeTodasFormas && (
        <div className="tes-seccion">
          <div className="tes-ayuda"><div><strong>Este pago ya parece registrado.</strong> Encontré {coincidencias.length === 1 ? "un movimiento" : `${coincidencias.length} movimientos`} con el mismo valor y fecha cercana (por ejemplo, del extracto). Adjunta el soporte a ese movimiento para no duplicarlo.</div></div>
          {coincidencias.map((c) => (
            <div key={c.id} className="tes-cand">
              <div><strong>{c.descripcion}</strong><small>{c.banco} · {fechaCorta(c.fecha)} · {c.tipo === "debito" ? "Débito" : "Crédito"}{c.concepto ? ` · «${c.concepto}»` : ""}{c.soportes ? ` · ya tiene ${c.soportes} soporte(s)` : ""}</small></div>
              <span className="tes-num">{c.valorTexto}</span>
              <button type="button" className="btn small btn-primary" disabled={guardando} onClick={() => adjuntarA(c)}>{asoc.length && !c.pagos ? "Adjuntar el soporte y asociar el pago" : "Adjuntar el soporte a este"}</button>
            </div>
          ))}
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setNuevoDeTodasFormas(true)}>No, es otro pago: registrarlo nuevo</button>
        </div>
      )}
      {aviso && mostrarForm && <div className="tes-ayuda"><div>{aviso}</div></div>}
      <div style={{ display: mostrarForm ? "contents" : "none" }}>
      <div className="tes-seccion">
        <div className="tes-seccion-t"><span className="n">1</span><h4>Lo que dice el banco</h4></div>
        <div className="tes-form">
          <div className="field"><label htmlFor="mv-banco">Banco *</label><select id="mv-banco" {...campo("bancoId")}><option value="">Elige…</option>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          <div className="field"><label>Tipo *</label><div className="tes-seg" role="group" aria-label="Tipo"><button type="button" className={v.tipo === "debito" ? "on" : ""} onClick={() => set({ ...v, tipo: "debito" })}>Débito · sale</button><button type="button" className={v.tipo === "credito" ? "on" : ""} onClick={() => set({ ...v, tipo: "credito" })}>Crédito · entra</button></div></div>
          <div className="field"><label htmlFor="mv-fecha">Fecha *</label><input id="mv-fecha" type="date" {...campo("fecha")} /></div>
          <div className="field"><label htmlFor="mv-valor">Valor * ({banco?.moneda || "COP"})</label><MoneyInput id="mv-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix={banco?.moneda || "COP"} decimales={2} /></div>
          <div className="field span-2"><label htmlFor="mv-desc">Descripción del banco *</label><input id="mv-desc" maxLength={300} {...campo("descripcion")} placeholder="Cópiala como sale en el extracto" /><span className="card-sub" style={{ margin: 0 }}>Igual que en el extracto: así no se duplica si luego lo subes.</span></div>
        </div>
      </div>
      <div className="tes-seccion">
        <div className="tes-seccion-t"><span className="n">2</span><h4>Cómo lo identificas tú</h4><small>opcional</small></div>
        <div className="tes-form">
          <div className="field"><label htmlFor="mv-concepto">Concepto</label><input id="mv-concepto" maxLength={200} {...campo("concepto")} placeholder="Texto libre, como en el Excel" /></div>
          <div className="field"><label htmlFor="mv-tercero">Tercero</label><input id="mv-tercero" maxLength={200} {...campo("tercero")} placeholder="A quién se pagó o quién consignó" /></div>
          <div className="field"><label htmlFor="mv-ref">Referencia</label><input id="mv-ref" maxLength={120} {...campo("referencia")} placeholder="CUS, aprobación, factura" /></div>
          <div className="field"><label htmlFor="mv-obs">Observación</label><input id="mv-obs" maxLength={1000} {...campo("observacion")} /></div>
        </div>
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setMasCampos((x) => !x)}>{masCampos ? "Ocultar" : "Ver"} más campos del banco (tipo de carga, solicitud, preparador, formato)</button>
        {masCampos && (
          <div className="tes-form">
            <div className="field"><label htmlFor="mv-tc">Tipo de carga</label><input id="mv-tc" maxLength={80} {...campo("tipoCarga")} /></div>
            <div className="field"><label htmlFor="mv-ts">Tipo de solicitud</label><input id="mv-ts" maxLength={80} {...campo("tipoSolicitud")} /></div>
            <div className="field"><label htmlFor="mv-prep">Preparador</label><input id="mv-prep" maxLength={120} {...campo("preparador")} /></div>
            <div className="field"><label htmlFor="mv-fmt">Formato</label><input id="mv-fmt" maxLength={120} {...campo("formato")} /></div>
          </div>
        )}
      </div>
      <div className="tes-seccion">
        <div className="tes-seccion-t"><span className="n">3</span><h4>Soporte</h4><small>opcional · foto o PDF del comprobante</small></div>
        <div className="tes-cand">
          <div><strong>{archivo ? archivo.name : "Ningún archivo elegido"}</strong><small>«Leer con Nova» llena fecha, valor, tercero y referencia por ti.</small></div>
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>{archivo ? "Cambiar archivo" : "Elegir archivo"}</button>
          <button type="button" className="btn small" onClick={() => leerConNova()} disabled={!archivo || leyendo}>{leyendo ? <span className="spinner" /> : <IconSpark size={12} />} Leer con Nova</button>
        </div>
      </div>
      <div className="tes-seccion">
        <div className="tes-seccion-t"><span className="n">4</span><h4>¿A qué pago corresponde?</h4><small>opcional · también lo puedes hacer después</small></div>
        <AsociadorPagos movimiento={v} lista={asoc} onCambio={setAsoc} />
      </div>
      </div>
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// ---------- Detalle ----------
export function DetalleMovimientoModal({ id, cat, puedeRegistrar, onClose, onCambio, onEditar }) {
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [asociando, setAsociando] = useState(false);
  const [asoc, setAsoc] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const fileRef = useRef(null);
  const cargar = () => tesMovimiento(id).then((x) => { setM(x); setAsoc(x.listaPagos.map((a) => ({ pagoId: a.pagoId, valor: String(a.valor), pago: { concepto: a.concepto, item: a.item, mes: a.mes, anio: a.anio, valor: a.valorPago } }))); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarAsoc() {
    setOcupado(true); setError("");
    try { await tesAsociarMovimiento(id, asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor }))); await cargar(); setAsociando(false); onCambio("Asociaciones guardadas."); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function subir(f) {
    if (!f) return;
    setOcupado(true); setError("");
    try { await tesAgregarSoporte(id, f); await cargar(); onCambio(); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function quitarSoporte(sid) {
    setOcupado(true);
    try { await tesBorrarSoporte(sid); await cargar(); onCambio(); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function eliminar() {
    setOcupado(true);
    try { await tesBorrarMovimiento(id); onCambio("Movimiento eliminado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  if (!m) return <Modal titulo="Movimiento" onClose={onClose}>{error ? <p className="modal-error">{error}</p> : <span className="spinner" />}</Modal>;
  return (
    <Modal titulo={m.descripcion} sub={`${m.banco} · ${fechaCorta(m.fecha)}${m.fechaAproximada ? " (fecha aproximada)" : ""} · ${m.tipoTexto}`} onClose={onClose} ancho={880}
      pie={puedeRegistrar && !asociando ? <>
        {borrar ? <><span>¿Eliminar este movimiento?</span><button type="button" className="btn btn-danger-solid small" onClick={eliminar} disabled={ocupado}>Sí, eliminar</button><button type="button" className="btn small" onClick={() => setBorrar(false)}>No</button></> : <button type="button" className="btn" onClick={() => setBorrar(true)}><IconTrash size={13} /> Eliminar</button>}
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => setAsociando(true)}>Asociar a pagos</button>
        <button type="button" className="btn btn-primary" onClick={() => onEditar(m)}>Editar</button>
      </> : asociando ? <>
        <button type="button" className="btn" onClick={() => { setAsociando(false); cargar(); }}>Cancelar</button>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={guardarAsoc} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Guardar asociaciones</button>
      </> : null}>
      <div className="tes-detalle">
        <div><span>Valor</span><strong className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{m.tipo === "debito" ? "−" : "+"}{m.valorTexto}</strong></div>
        <div><span>Concepto</span><strong>{m.concepto || "—"}</strong></div>
        <div><span>Tercero</span><strong>{m.tercero || "—"}</strong></div>
        <div><span>Referencia</span><strong>{m.referencia || "—"}</strong></div>
        {m.observacion && <div><span>Observación</span><strong>{m.observacion}</strong></div>}
        {(m.tipoCarga || m.tipoSolicitud || m.preparador || m.formato) && <div><span>Datos del banco</span><strong>{[m.tipoCarga, m.tipoSolicitud, m.preparador, m.formato].filter(Boolean).join(" · ")}</strong></div>}
        <div><span>Sin asignar</span><strong className="tes-num">{m.sinAsignarTexto}</strong></div>
        <div><span>Registró</span><strong>{m.creadoPorNombre || "—"} · {m.origen === "importacion" ? "plantilla de Excel" : m.origen === "extracto" ? "extracto" : "a mano"}</strong></div>
      </div>
      <h4 className="tes-sub">Pagos asociados</h4>
      {asociando ? <AsociadorPagos movimiento={m} lista={asoc} onCambio={setAsoc} /> : m.listaPagos.length ? (
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead><tr><th>Mes</th><th>Concepto</th><th>Ítem</th><th>Tipo</th><th>Estado</th><th style={{ textAlign: "right" }}>Programado</th><th style={{ textAlign: "right" }}>Va a este pago</th></tr></thead>
            <tbody>{m.listaPagos.map((a) => (
              <tr key={a.asociacionId} className="clickable" onClick={() => { window.location.href = `/tesoreria/pagos?id=${a.pagoId}`; }}>
                <td>{MESES[a.mes - 1]} {a.anio}</td><td>{a.concepto}</td><td>{a.item || "—"}</td><td><TipoPago tipo={a.tipo} /></td><td><EstadoPago estado={a.estado} /></td>
                <td style={{ textAlign: "right" }} className="tes-num">{a.valorPagoTexto}</td><td style={{ textAlign: "right" }} className="tes-num"><strong>{a.valorTexto}</strong>{a.origen === "agente" ? " ✨" : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty compacta">Todavía no está asociado a ningún pago.{puedeRegistrar ? " Usa «Asociar a pagos» o revisa las propuestas del agente." : ""}</div>}
      <h4 className="tes-sub">Soportes</h4>
      {m.listaSoportes.length ? m.listaSoportes.map((s) => (
        <div key={s.id} className="tes-cand">
          <div><a href={urlSoporte(s.id)} target="_blank" rel="noreferrer"><strong>{s.nombre}</strong></a><small>{Math.round(s.tamano / 1024)} KB · {s.creadoPorNombre || ""} · {fechaSinAnio(String(s.createdAt).slice(0, 10))}</small></div>
          {puedeRegistrar && <button type="button" className="btn small" onClick={() => quitarSoporte(s.id)} disabled={ocupado}>Quitar</button>}
        </div>
      )) : <p className="muted" style={{ margin: 0 }}>Sin soporte.</p>}
      {puedeRegistrar && <><input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => subir(e.target.files?.[0])} /><button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => fileRef.current?.click()} disabled={ocupado}>+ Subir foto o PDF</button></>}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// ---------- Subir extracto ----------
export function ExtractoModal({ cat, bancoId: bancoInicial, onClose, onListo }) {
  const [bancoId, setBancoId] = useState(bancoInicial || cat.bancos.filter((b) => b.activo)[0]?.id || "");
  const [archivo, setArchivo] = useState(null);
  const [a, setA] = useState(null); // análisis
  const [aprobados, setAprobados] = useState(new Set());
  const [guardarSaldos, setGuardarSaldos] = useState(true);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [ver, setVer] = useState("nuevos");
  const [hecho, setHecho] = useState(null);
  const [agente, setAgente] = useState(null);
  const fileRef = useRef(null);
  const COP = (v) => fmtMoneda(v, a?.moneda || "COP");
  async function analizar() {
    setOcupado(true); setError("");
    try {
      const r = await tesAnalizarExtracto(bancoId, archivo);
      setA(r); setAprobados(new Set(r.nuevos.map((m) => m.clave)));
      setVer(r.nuevos.length ? "nuevos" : r.soloEnSistema.length ? "sistema" : "confirmados");
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function aplicar() {
    setOcupado(true); setError("");
    try {
      const r = await tesAplicarExtracto(a.token, [...aprobados], guardarSaldos);
      setHecho({ ...r, mensaje: `Extracto de ${r.banco}: ${r.creados} movimiento(s) registrados${r.noAprobados ? `, ${r.noAprobados} no aprobados` : ""}${r.verificados ? `, ${r.verificados} verificados` : ""}${r.saldosGuardados ? " y saldos del banco guardados" : ""}.` });
      setOcupado(false);
    } catch (e) { setError(e.message); setOcupado(false); }
  }
  const alternar = (clave) => setAprobados((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  async function correrAgentes() {
    setAgente({ estado: "corriendo" });
    try {
      const [mov, pag] = await Promise.all([tesBuscarPropuestas({}), tesBuscarPropuestas({ agente: "pagos", alcance: "todos", anio: Number(a.hasta.slice(0, 4)), mes: Number(a.hasta.slice(5, 7)) })]);
      setAgente({ estado: "listo", propuestas: (mov.propuestas || 0) + (pag.propuestas || 0), alta: (mov.porConfianza?.alta || 0) + (pag.porConfianza?.alta || 0) });
    } catch (e) { setAgente({ estado: "error", error: e.message }); }
  }
  // Paso siguiente a aprobar: el flujo del mes (extracto → asociar con el agente → conciliar).
  if (hecho) {
    const anioEx = Number(a.hasta.slice(0, 4));
    const mesEx = Number(a.hasta.slice(5, 7));
    return (
      <Modal titulo="Extracto registrado" sub={hecho.mensaje} onClose={() => onListo(hecho.mensaje)} ancho={720}
        pie={<><div className="spacer" /><button type="button" className="btn" onClick={() => onListo(hecho.mensaje)}>Listo, lo hago después</button></>}>
        <div className="tes-flujo">
          <div className="tes-flujo-paso ok"><span>1</span><div><strong>Extracto subido</strong><small>{hecho.creados} nuevo(s) · {hecho.verificados} confirmado(s) por el banco{hecho.noAprobados ? ` · ${hecho.noAprobados} sin aprobar (quedan en Por resolver)` : ""}</small></div></div>
          <div className={`tes-flujo-paso${agente?.estado === "listo" ? " ok" : ""}`}><span>2</span>
            <div><strong>Asociar cada movimiento con su pago</strong>
              <small>{!agente ? "Los agentes buscan el pago de los movimientos nuevos y el movimiento de los pagos que ya debían estar pagados. Solo proponen: tú apruebas." : agente.estado === "corriendo" ? "Buscando…" : agente.estado === "error" ? agente.error : `${agente.propuestas} propuesta(s), ${agente.alta} de confianza alta.`}</small>
            </div>
            {!agente || agente.estado === "error" ? <button type="button" className="btn btn-primary small" onClick={correrAgentes}><IconSpark size={12} /> Buscar ahora</button>
              : agente.estado === "corriendo" ? <span className="spinner" />
                : <a className="btn small btn-primary" href="/tesoreria/agentes">Revisar propuestas</a>}
          </div>
          <div className="tes-flujo-paso"><span>3</span><div><strong>Conciliar {MESES[mesEx - 1].toLowerCase()}</strong><small>Ver si lo registrado da el saldo del banco y resolver lo que falte.</small></div>
            <a className="btn small" href={`/tesoreria/conciliacion?anio=${anioEx}&mes=${mesEx}&bancoId=${a.bancoId}`}>Ir a conciliar</a>
          </div>
          <div className="tes-flujo-paso"><span>4</span><div><strong>Subir los soportes</strong><small>Los comprobantes de los pagos del mes, varios a la vez.</small></div>
            <a className="btn small" href="/tesoreria/por-resolver">Ir a Por resolver</a>
          </div>
        </div>
      </Modal>
    );
  }
  // Cómo queda el saldo final con lo que está marcado.
  const netoMarcado = a ? a.nuevos.filter((m) => aprobados.has(m.clave)).reduce((x, m) => x + (m.tipo === "credito" ? m.valor : -m.valor), 0) : 0;
  const finalMarcado = a?.saldos.sistemaFinal != null ? a.saldos.sistemaFinal + netoMarcado : null;
  const difMarcado = finalMarcado != null && a?.saldoFinal != null ? Math.round((finalMarcado - a.saldoFinal) * 100) / 100 : null;
  const cuadra = (v) => v != null && Math.abs(v) < 1;

  return (
    <Modal titulo={a ? `Revisa el extracto de ${a.banco}` : "Subir extracto del banco"}
      sub={a ? `${a.archivo} · ${fechaCorta(a.desde)} a ${fechaCorta(a.hasta)} · ${a.lineas} línea(s). Nada se registra hasta que apruebes.` : "PDF, Excel (.xlsx, .xls) o CSV, del mes completo o parcial. Primero se analiza y te muestra las diferencias; tú apruebas qué se registra."}
      onClose={onClose} ancho={a ? 1080 : 620}
      pie={a ? <>
        <button type="button" className="btn" onClick={() => { setA(null); setError(""); }} disabled={ocupado}>← Otro archivo</button><div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={aplicar} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Aprobar: registrar {aprobados.size} movimiento(s){guardarSaldos && (a.saldoInicial != null || a.saldoFinal != null) ? " y guardar saldos" : ""}</button>
      </> : <>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={analizar} disabled={!bancoId || !archivo || ocupado}>{ocupado ? <span className="spinner" /> : null} Analizar extracto</button>
      </>}>
      {!a && <>
        <div className="field"><label htmlFor="ex-banco">Banco</label><select id="ex-banco" value={bancoId} onChange={(e) => setBancoId(e.target.value)}>{cat.bancos.filter((b) => b.activo).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
        <div className="tes-cand">
          <div><strong>{archivo ? archivo.name : "Ningún archivo elegido"}</strong><small>Se revisa el contenido (sin macros, JavaScript ni archivos incrustados). Analizar no registra nada.</small></div>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf,text/csv" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Elegir archivo</button>
        </div>
      </>}
      {a && <>
        {/* Saldos: lo del sistema contra lo del extracto. */}
        <div className="tes-ex-saldos">
          <div className={`tes-ex-saldo ${a.saldos.difInicial == null ? "" : cuadra(a.saldos.difInicial) ? "ok" : "mal"}`}>
            <span>Saldo inicial · {fechaCorta(a.desde)}</span>
            <strong className="tes-num">{a.saldoInicial == null ? "El archivo no lo trae" : COP(a.saldoInicial)}</strong>
            <small>{a.saldos.sistemaInicial == null ? "El sistema aún no tiene saldo para ese día" : cuadra(a.saldos.difInicial) ? `Cuadra con el sistema (${COP(a.saldos.sistemaInicial)})` : a.saldos.difInicial == null ? `Sistema: ${COP(a.saldos.sistemaInicial)}` : `Sistema: ${COP(a.saldos.sistemaInicial)} · diferencia ${COP(a.saldos.difInicial)} (viene de meses anteriores)`}</small>
          </div>
          <div className={`tes-ex-saldo ${difMarcado == null ? "" : cuadra(difMarcado) ? "ok" : "mal"}`}>
            <span>Saldo final · {fechaCorta(a.hasta)}</span>
            <strong className="tes-num">{a.saldoFinal == null ? "El archivo no lo trae" : COP(a.saldoFinal)}</strong>
            <small>{finalMarcado == null ? "El sistema aún no tiene saldo: se tomará el del extracto" : difMarcado == null ? `Sistema con lo marcado: ${COP(finalMarcado)}` : cuadra(difMarcado) ? `Con lo marcado, el sistema cuadra (${COP(finalMarcado)})` : `Con lo marcado el sistema queda en ${COP(finalMarcado)}: diferencia ${COP(difMarcado)}`}</small>
          </div>
          <div className="tes-ex-saldo">
            <span>Resumen</span>
            <strong className="tes-num">{a.nuevos.length} nuevas · {a.yaCargados + a.aMano.length} ya están</strong>
            <small>{a.soloEnSistema.length ? `${a.soloEnSistema.length} en el sistema que el banco no trae` : "Todo lo del sistema en esas fechas está en el extracto"}</small>
          </div>
        </div>
        {a.aviso && <div className="tes-ayuda tes-ayuda-alerta"><div>{a.aviso}</div></div>}
        {/* Conciliación bancaria contable: qué tengo que el banco no, qué trae el banco que no tengo y lo que queda sin explicar. */}
        {a.conciliacion?.saldoBanco != null && a.conciliacion?.saldoLibros != null && (
          <>
            <ConciliacionContable moneda={a.moneda} saldoBanco={a.conciliacion.saldoBanco} saldoLibros={a.conciliacion.saldoLibros} contable={a.conciliacion} sinExplicar={a.conciliacion.sinExplicar} alTexto={` al ${fechaCorta(a.hasta)}`} />
            <PistasDiferencia pistas={a.conciliacion.pistas} moneda={a.moneda} puede={false} />
          </>
        )}
        <div className="dash-tabs" role="tablist" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "nuevos"} onClick={() => setVer("nuevos")}>El banco trae y no tengo · {a.nuevos.length}</button>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "sistema"} onClick={() => setVer("sistema")}>Tengo y el banco no trae · {a.soloEnSistema.length}</button>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "confirmados"} onClick={() => setVer("confirmados")}>Confirmados · {a.yaCargados + a.aMano.length}</button>
        </div>
        {ver === "nuevos" && (a.nuevos.length ? (
          <div className="table-scroll tes-ex-lista">
            <table className="records tes-tabla">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Aprobar todas" checked={aprobados.size === a.nuevos.length} onChange={(e) => setAprobados(e.target.checked ? new Set(a.nuevos.map((m) => m.clave)) : new Set())} /></th><th>Fecha</th><th>Descripción del banco</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
              <tbody>
                {a.nuevos.map((m) => (
                  <tr key={m.clave} className={aprobados.has(m.clave) ? "" : "tes-ex-no"} onClick={() => alternar(m.clave)} style={{ cursor: "pointer" }}>
                    <td><input type="checkbox" checked={aprobados.has(m.clave)} onChange={() => alternar(m.clave)} onClick={(e) => e.stopPropagation()} aria-label={`Aprobar ${m.descripcion}`} /></td>
                    <td>{fechaSinAnio(m.fecha)}</td>
                    <td><span className="desc-tooltip-wrap"><span className="desc-text desc-text-ancha">{m.descripcion}</span><span className="desc-tooltip-bubble">{m.descripcion}</span></span></td>
                    <td style={{ textAlign: "right" }} className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COP(m.tipo === "debito" ? -m.valor : m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty compacta">El extracto no trae nada nuevo: todo ya estaba registrado.</div>)}
        {ver === "sistema" && (a.soloEnSistema.length ? (
          <>
            <div className="tes-ayuda tes-ayuda-alerta"><div>Estos movimientos están registrados en esas fechas pero <strong>el banco no los trae</strong>. Puede ser un error de registro, un duplicado o algo que aún no pasó por el banco. No se borran solos: ábrelos en Movimientos si hay que corregirlos.</div></div>
            <div className="table-scroll tes-ex-lista">
              <table className="records tes-tabla">
                <thead><tr><th>Fecha</th><th>Descripción</th><th>Origen</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
                <tbody>{a.soloEnSistema.map((m) => (
                  <tr key={m.id}><td>{fechaSinAnio(m.fecha)}</td><td><span className="desc-tooltip-wrap"><span className="desc-text desc-text-ancha">{m.descripcion}</span><span className="desc-tooltip-bubble">{m.descripcion}</span></span></td><td><span className="pill muted">{m.origen}</span></td><td style={{ textAlign: "right" }} className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COP(m.tipo === "debito" ? -m.valor : m.valor)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <div className="empty compacta">Todo lo registrado en esas fechas está en el extracto.</div>)}
        {ver === "confirmados" && <div className="empty compacta">{a.yaCargados} línea(s) ya estaban cargadas{a.deOtroArchivo ? ` (${a.deOtroArchivo} desde otro archivo del banco)` : ""}{a.aMano.length ? ` y ${a.aMano.length} coinciden con movimientos registrados a mano: quedarán verificados por el banco` : ""}.</div>}
        {(a.saldoInicial != null || a.saldoFinal != null) && (
          <label className="tes-check"><span>Guardar los saldos del extracto como saldo del banco (el mes siguiente arranca con el saldo final de este)</span><input type="checkbox" checked={guardarSaldos} onChange={(e) => setGuardarSaldos(e.target.checked)} /></label>
        )}
      </>}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// «Subir varios soportes»: se eligen varios comprobantes (PDF o fotos) y Nova lee cada uno; para cada recibo se propone
// el movimiento del banco que corresponde (mismo valor, ±3 días, mismo sentido). La persona revisa y adjunta los que
// quiera de una vez; los que no tienen movimiento se registran después con «Registrar con soporte».
export function SoportesLoteModal({ onClose, onListo }) {
  const [filas, setFilas] = useState([]); // { archivo, estado, leido, opciones, elegido, duplicado, error }
  const [leyendo, setLeyendo] = useState(false);
  const [adjuntando, setAdjuntando] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  async function elegir(lista) {
    const nuevos = [...lista].filter((f) => /pdf|image/.test(f.type) || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)).slice(0, 25);
    if (!nuevos.length) { setError("Elige comprobantes en PDF o fotos (JPG, PNG)."); return; }
    setError("");
    const base = filas.length;
    setFilas((x) => [...x, ...nuevos.map((archivo) => ({ archivo, estado: "pendiente" }))]);
    setLeyendo(true);
    for (let i = 0; i < nuevos.length; i++) {
      setFilas((x) => x.map((r, k) => (k === base + i ? { ...r, estado: "leyendo" } : r)));
      try {
        const r = await tesLeerSoporte(nuevos[i]);
        const opciones = (r.coincidencias || []).filter((c) => !c.soportes);
        setFilas((x) => x.map((f, k) => (k === base + i ? { ...f, estado: "leido", leido: r.leido, opciones, todas: r.coincidencias || [], elegido: !r.duplicado && opciones.length === 1 ? opciones[0].id : "", duplicado: r.duplicado } : f)));
      } catch (e) {
        setFilas((x) => x.map((f, k) => (k === base + i ? { ...f, estado: "error", error: e.message } : f)));
      }
    }
    setLeyendo(false);
  }
  const listos = filas.filter((f) => f.estado === "leido" && f.elegido && !f.duplicado);
  async function adjuntar() {
    setAdjuntando(true); setError("");
    let ok = 0;
    for (const f of listos) {
      try { await tesAgregarSoporte(Number(f.elegido), f.archivo); ok++; setFilas((x) => x.map((r) => (r === f ? { ...r, estado: "adjuntado" } : r))); }
      catch (e) { setFilas((x) => x.map((r) => (r === f ? { ...r, estado: "error", error: e.message } : r))); }
    }
    setAdjuntando(false);
    if (ok === listos.length) onListo(`${ok} soporte(s) adjuntados a su movimiento.`);
  }
  return (
    <Modal titulo="Subir varios soportes" sub="Elige los comprobantes (PDF o fotos, hasta 25). Nova lee cada uno y te propone su movimiento del banco; nada se adjunta hasta que confirmes." onClose={onClose} ancho={980}
      pie={<><button type="button" className="btn" onClick={onClose}>Cerrar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={adjuntar} disabled={!listos.length || leyendo || adjuntando}>{adjuntando ? <span className="spinner" /> : null} Adjuntar {listos.length} soporte(s)</button></>}>
      <div className="tes-lote-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files); }}>
        <strong>Arrastra aquí los comprobantes o haz clic para elegirlos</strong>
        <small>Recibos PSE, transferencias, pagos de facturas, consignaciones. Se revisa cada archivo antes de leerlo.</small>
        <input ref={fileRef} type="file" multiple accept=".pdf,image/*" hidden onChange={(e) => { elegir(e.target.files || []); e.target.value = ""; }} />
      </div>
      {filas.length > 0 && (
        <div className="tes-lote-lista">
          {filas.map((f, i) => (
            <div key={i} className={`tes-lote-fila ${f.estado}${f.duplicado ? " dup" : ""}`}>
              <div className="tes-lote-arch"><strong>{f.archivo.name}</strong>
                <small>{f.estado === "pendiente" ? "En cola…" : f.estado === "leyendo" ? "Nova está leyendo…" : f.estado === "error" ? f.error : f.estado === "adjuntado" ? "Adjuntado ✓" : f.leido ? [f.leido.fecha, f.leido.valor ? fmtMoneda(f.leido.valor, "COP") : null, f.leido.tercero].filter(Boolean).join(" · ") || "No se pudo leer el valor" : ""}</small>
              </div>
              <div className="tes-lote-mov">
                {f.estado === "leyendo" && <span className="spinner" />}
                {f.duplicado && <span className="pill muted">{f.duplicado}</span>}
                {f.estado === "leido" && !f.duplicado && (f.opciones.length ? (
                  <select value={f.elegido} onChange={(e) => setFilas((x) => x.map((r, k) => (k === i ? { ...r, elegido: e.target.value } : r)))} aria-label={`Movimiento para ${f.archivo.name}`}>
                    <option value="">No adjuntar</option>
                    {f.opciones.map((c) => <option key={c.id} value={c.id}>{c.fecha} · {c.banco} · {c.descripcion} · {c.valorTexto}</option>)}
                  </select>
                ) : <span className="pill warning">{f.todas?.length ? "Su movimiento ya tiene soporte" : "No hay movimiento con ese valor y fecha: regístralo con «Registrar con soporte»"}</span>)}
                {f.estado === "leido" && !f.duplicado && f.opciones.length === 1 && <span className="pill good">Coincide</span>}
                {f.estado === "leido" && !f.duplicado && f.opciones.length > 1 && <span className="pill accent">{f.opciones.length} posibles: elige</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
