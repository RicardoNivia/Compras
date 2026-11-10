"use client";

import { useEffect, useMemo, useState } from "react";
import { Portal } from "@/components/notificaciones/ui";
import { tesCrearMovimiento, tesEditarMovimiento, tesLeerSoporte, tesGuardarConSoporte, tesMovimiento, tesAgregarSoporte, tesBorrarSoporte, tesBorrarMovimiento, urlSoporte } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { IconSpark, IconCheck, IconTrash } from "@/components/icons";
import { EstadoPill, tipoTexto, fechaCorta, hoyCO } from "@/components/tesoreria/comun";
import MoneyInput from "@/components/MoneyInput";

function Modal({ titulo, onClose, ancho = 720, children, pie }) {
  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: ancho, width: "100%" }}>
          <div className="modal-head">
            <h3>{titulo}</h3>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body tes-modal-body">{children}</div>
          {pie && <div className="modal-foot">{pie}</div>}
        </div>
      </div>
    </Portal>
  );
}

// Campos del movimiento (los usan el registro a mano, la edición y la revisión del soporte).
function CamposMovimiento({ v, set, cat, leidos = {} }) {
  const cuentas = cat.cuentas.filter((c) => c.activo || c.id === Number(v.cuentaId) || c.id === Number(v.cuentaDestinoId));
  const conceptos = cat.conceptos.filter((c) => c.activo || c.id === Number(v.conceptoId));
  const items = cat.items.filter((c) => c.activo || c.id === Number(v.itemId));
  const pagadores = cat.pagadores.filter((c) => c.activo || c.id === Number(v.pagadorId));
  const cuenta = cat.cuentas.find((c) => c.id === Number(v.cuentaId));
  const marca = (k) => (leidos[k] ? <span className="pill accent tes-leido">Del soporte</span> : null);
  const elegirConcepto = (id) => {
    const c = cat.conceptos.find((x) => x.id === Number(id));
    set({ ...v, conceptoId: id, itemId: v.itemId || c?.itemId || "" });
  };
  return (
    <div className="tes-form">
      <div className="field">
        <label htmlFor="tm-tipo">Tipo</label>
        <select id="tm-tipo" value={v.tipo} onChange={(e) => set({ ...v, tipo: e.target.value })}>
          <option value="egreso">Egreso (sale)</option><option value="ingreso">Ingreso (entra)</option><option value="traslado">Traslado entre cuentas propias</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="tm-estado">Estado</label>
        <select id="tm-estado" value={v.estado} onChange={(e) => set({ ...v, estado: e.target.value })}>
          <option value="ejecutado">Ejecutado</option><option value="proyectado">Proyectado</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="tm-fecha">Fecha {marca("fecha")}</label>
        <input id="tm-fecha" type="date" value={v.fecha || ""} onChange={(e) => set({ ...v, fecha: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="tm-valor">Valor{cuenta ? ` (${cuenta.moneda})` : ""} {marca("valor")}</label>
        <MoneyInput id="tm-valor" value={v.valor ?? ""} onChange={(x) => set({ ...v, valor: x })} prefix={cuenta?.moneda || "COP"} decimales={cuenta && cuenta.moneda !== "COP" ? 2 : 0} />
      </div>
      <div className="field">
        <label htmlFor="tm-cuenta">{v.tipo === "traslado" ? "Cuenta origen" : "Cuenta"} {marca("cuentaId")}</label>
        <select id="tm-cuenta" value={v.cuentaId || ""} onChange={(e) => set({ ...v, cuentaId: e.target.value })}>
          <option value="">Elige…</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}
        </select>
      </div>
      {v.tipo === "traslado" ? (
        <div className="field">
          <label htmlFor="tm-destino">Cuenta destino</label>
          <select id="tm-destino" value={v.cuentaDestinoId || ""} onChange={(e) => set({ ...v, cuentaDestinoId: e.target.value })}>
            <option value="">Elige…</option>
            {cuentas.filter((c) => c.id !== Number(v.cuentaId)).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}
          </select>
        </div>
      ) : <div />}
      <div className="field span-2">
        <label htmlFor="tm-concepto">Concepto</label>
        <select id="tm-concepto" value={v.conceptoId || ""} onChange={(e) => elegirConcepto(e.target.value)}>
          <option value="">Elige…</option>
          {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="tm-item">Ítem</label>
        <select id="tm-item" value={v.itemId || ""} onChange={(e) => set({ ...v, itemId: e.target.value })}>
          <option value="">Sin ítem</option>
          {items.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="tm-paga">Paga</label>
        <select id="tm-paga" value={v.pagadorId || ""} onChange={(e) => set({ ...v, pagadorId: e.target.value })}>
          <option value="">—</option>
          {pagadores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="tm-tercero">Tercero {marca("tercero")}</label>
        <input id="tm-tercero" value={v.tercero || ""} maxLength={200} onChange={(e) => set({ ...v, tercero: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="tm-ref">Referencia (CUS, aprobación, factura) {marca("referencia")}</label>
        <input id="tm-ref" value={v.referencia || ""} maxLength={120} onChange={(e) => set({ ...v, referencia: e.target.value })} />
      </div>
      <div className="field span-2">
        <label htmlFor="tm-obs">Observación</label>
        <textarea id="tm-obs" rows={2} value={v.observacion || ""} maxLength={1000} onChange={(e) => set({ ...v, observacion: e.target.value })} />
      </div>
    </div>
  );
}

const limpiarDatos = (v) => ({
  tipo: v.tipo, estado: v.estado, fecha: v.fecha, valor: Number(v.valor),
  cuentaId: Number(v.cuentaId) || null, cuentaDestinoId: v.tipo === "traslado" ? Number(v.cuentaDestinoId) || null : null,
  conceptoId: Number(v.conceptoId) || null, itemId: Number(v.itemId) || null, pagadorId: Number(v.pagadorId) || null,
  tercero: v.tercero || null, referencia: v.referencia || null, observacion: v.observacion || null,
});

export function FormMovimientoModal({ cat, movimiento, onClose, onSaved }) {
  const [v, set] = useState(() => movimiento ? { ...movimiento } : { tipo: "egreso", estado: "ejecutado", fecha: hoyCO() });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true); setError("");
    try {
      const r = movimiento ? await tesEditarMovimiento(movimiento.id, limpiarDatos(v)) : await tesCrearMovimiento(limpiarDatos(v));
      onSaved(r, movimiento ? "Movimiento actualizado." : "Movimiento registrado.");
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  return (
    <Modal titulo={movimiento ? `Editar movimiento #${movimiento.id}` : "Registrar movimiento"} onClose={onClose}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <span className="spinner" /> : null} Guardar</button></>}>
      {movimiento?.conciliado && <p className="prov-note">Está conciliado con el extracto: el valor, la cuenta y el tipo no se pueden cambiar sin quitar antes el enlace.</p>}
      <CamposMovimiento v={v} set={set} cat={cat} />
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// Registrar con soporte: subir → Nova lee → revisar lo propuesto → guardar.
export function SoporteModal({ cat, onClose, onSaved }) {
  const [archivo, setArchivo] = useState(null);
  const [paso, setPaso] = useState("subir");
  const [r, setR] = useState(null);
  const [v, set] = useState(null);
  const [usarProyectado, setUsarProyectado] = useState(true);
  const [usarLinea, setUsarLinea] = useState(true);
  const [error, setError] = useState("");

  async function leer(file) {
    if (!file) return;
    setArchivo(file); setPaso("leyendo"); setError("");
    try {
      const res = await tesLeerSoporte(file);
      setR(res);
      set({ ...res.propuesta, valor: res.propuesta.valor ?? "" });
      setPaso("revisar");
    } catch (e) { setError(e.message); setPaso("subir"); }
  }
  async function guardar() {
    setPaso("guardando"); setError("");
    try {
      const mov = await tesGuardarConSoporte({ archivo, datos: { ...limpiarDatos(v), leido: r.leido }, proyectadoId: usarProyectado ? r.proyectado?.id : null, lineaId: usarLinea ? r.linea?.id : null });
      onSaved(mov, `Listo: movimiento #${mov.id} guardado con su soporte${mov.conciliado ? " y conciliado" : ""}.`);
    } catch (e) { setError(e.message); setPaso("revisar"); }
  }
  const leidos = r ? { fecha: !!r.leido.fecha, valor: !!r.leido.valor, cuentaId: !!r.propuesta.cuentaId, tercero: !!r.leido.tercero, referencia: !!r.leido.referencia } : {};
  return (
    <Modal titulo="Registrar con soporte" onClose={onClose} ancho={860}
      pie={paso === "revisar" || paso === "guardando" ? <><button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={guardar} disabled={paso === "guardando" || !!r?.duplicado && !usarProyectado}>{paso === "guardando" ? <span className="spinner" /> : <IconCheck size={13} />} Guardar movimiento</button></> : null}>
      {paso === "subir" && (
        <label className="tes-drop">
          <strong>Arrastra aquí el comprobante o haz clic para elegirlo</strong>
          <span>PDF o foto · comprobante PSE, transferencia, factura pagada o consignación · hasta 10 MB</span>
          <span className="btn btn-primary small" style={{ marginTop: 6 }}>Elegir archivo</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => leer(e.target.files?.[0])} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
        </label>
      )}
      {paso === "leyendo" && <p className="tes-leyendo"><span className="spinner" /> <IconSpark size={14} /> Nova está leyendo «{archivo?.name}»: fecha, valor, cuenta, tercero y referencia…</p>}
      {(paso === "revisar" || paso === "guardando") && r && v && (
        <>
          {r.duplicado && <p className="modal-error">{r.duplicado}</p>}
          {r.avisos.map((a) => <p key={a} className="prov-note" style={{ margin: 0 }}>{a}</p>)}
          {r.proyectado && (
            <label className="tes-match">
              <span><strong>Proyectado encontrado.</strong> «{r.proyectado.concepto}» del {fechaCorta(r.proyectado.fecha)} por {r.proyectado.valorTexto}: pasa a ejecutado en vez de crear otro movimiento.</span>
              <input type="checkbox" checked={usarProyectado} onChange={(e) => setUsarProyectado(e.target.checked)} aria-label="Usar el proyectado" />
            </label>
          )}
          {r.linea && (
            <label className="tes-match">
              <span><strong>Línea del extracto.</strong> {fechaCorta(r.linea.fecha)} · «{r.linea.descripcion}» · {r.linea.valorTexto}: queda conciliado.</span>
              <input type="checkbox" checked={usarLinea} onChange={(e) => setUsarLinea(e.target.checked)} aria-label="Enlazar con la línea del extracto" />
            </label>
          )}
          <CamposMovimiento v={v} set={set} cat={cat} leidos={leidos} />
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Nova solo leyó el comprobante; concepto, ítem y quién paga los propone el sistema por los pagos anteriores. Revisa antes de guardar.</p>
        </>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

export function DetalleMovimientoModal({ id, cat, puedeRegistrar, onClose, onCambio, onEditar }) {
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cargar = useMemo(() => () => tesMovimiento(id).then(setM).catch((e) => setError(e.message)), [id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(fn, msg) {
    setOcupado(true); setError("");
    try { await fn(); await cargar(); onCambio?.(msg); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar el movimiento #${m.id}? Queda en auditoría.`)) return;
    setOcupado(true);
    try { await tesBorrarMovimiento(m.id); onCambio?.("Movimiento borrado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  return (
    <Modal titulo={m ? `Movimiento #${m.id}` : "Movimiento"} onClose={onClose} ancho={760}
      pie={m && puedeRegistrar ? <>
        <button type="button" className="btn btn-ghost btn-danger-text" onClick={borrar} disabled={ocupado || m.conciliado}><IconTrash size={13} /> Borrar</button>
        <div className="spacer" />
        <label className="btn small" style={{ position: "relative" }}>Agregar soporte<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(e) => e.target.files?.[0] && accion(() => tesAgregarSoporte(m.id, e.target.files[0]), "Soporte agregado.")} /></label>
        <button type="button" className="btn btn-primary" onClick={() => onEditar(m)} disabled={ocupado}>Editar</button>
      </> : null}>
      {!m && !error && <div className="tes-detalle" aria-hidden="true">{Array.from({ length: 8 }).map((_, i) => <div key={i}><div className="skeleton-bar" style={{ height: 9, width: 60, borderRadius: 5 }} /><div className="skeleton-bar" style={{ height: 14, width: "80%", borderRadius: 6, marginTop: 6 }} /></div>)}</div>}
      {m && (
        <>
          <div className="tes-detalle">
            <div><span>Tipo</span><strong>{tipoTexto(m.tipo)}</strong></div>
            <div><span>Estado</span><strong><EstadoPill mov={m} /></strong></div>
            <div><span>Fecha</span><strong>{fechaCorta(m.fecha)}{m.fechaAproximada ? " (solo el mes)" : ""}</strong></div>
            <div><span>Valor</span><strong>{m.valorTexto}</strong></div>
            <div><span>Cuenta</span><strong>{m.cuenta}{m.cuentaDestino ? ` → ${m.cuentaDestino}` : ""}</strong></div>
            <div><span>Concepto</span><strong>{m.concepto}</strong></div>
            <div><span>Ítem</span><strong>{m.item || "—"}</strong></div>
            <div><span>Paga</span><strong>{m.pagador || "—"}</strong></div>
            <div><span>Tercero</span><strong>{m.tercero || "—"}</strong></div>
            <div><span>Referencia</span><strong>{m.referencia || "—"}</strong></div>
            <div><span>Registrado</span><strong>{new Date(m.createdAt).toLocaleString("es-CO")} · {m.creadoPorNombre || "—"}</strong></div>
            <div><span>Origen</span><strong>{{ manual: "A mano", soporte: "Con soporte", extracto: "Desde el extracto", importacion: "Excel migrado" }[m.origen] || m.origen}</strong></div>
          </div>
          {m.observacion && <p className="prov-note">{m.observacion}</p>}
          <h4 className="tes-sub">Soportes</h4>
          {m.listaSoportes.length ? (
            <ul className="tes-lista">
              {m.listaSoportes.map((s) => (
                <li key={s.id}>
                  <span><a href={urlSoporte(s.id)} target="_blank" rel="noopener noreferrer"><strong>{s.nombre}</strong></a><small>{Math.round(s.tamano / 1024)} KB · {s.creadoPorNombre || "—"}</small></span>
                  {puedeRegistrar && <button type="button" className="btn small btn-ghost btn-danger-text" disabled={ocupado} onClick={() => window.confirm("¿Quitar este soporte?") && accion(() => tesBorrarSoporte(s.id), "Soporte quitado.")}>Quitar</button>}
                </li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>Sin soportes.</p>}
          <h4 className="tes-sub">Conciliación</h4>
          {m.lineasExtracto.length ? (
            <ul className="tes-lista">
              {m.lineasExtracto.map((l) => <li key={l.id}><span><strong>{fechaCorta(l.fecha)} · {l.descripcion}</strong><small>{l.cuenta} · {l.comoSeEnlazo}{l.enlazadoPorNombre ? ` · ${l.enlazadoPorNombre}` : ""}</small></span><strong>{fmtMoneda(l.valor, m.moneda)}</strong></li>)}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>Sin línea del extracto enlazada.</p>}
        </>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
