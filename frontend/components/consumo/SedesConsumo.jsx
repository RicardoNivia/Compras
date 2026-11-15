"use client";

import { useEffect, useMemo, useState } from "react";
import { conCrearMaestro, conEditarMaestro, conBorrarMaestro } from "@/lib/consumoApi";
import { coincide } from "@/lib/buscar";
import { crossfade } from "@/lib/crossfade";
import { useConfirmar } from "@/components/Confirmar";
import EstadoVacio from "@/components/EstadoVacio";
import BotonExcel from "@/components/BotonExcel";
import { IconSearch, IconPlus, IconEdit, IconTrash, IconBuilding } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, PERIODICIDADES, PuntoServicio, EtiquetaServicio, useCatalogosConsumo, Aviso, Modal, Interruptor, creadoPor } from "@/components/consumo/comun";

// Sedes y cuentas de servicio: la lista de sedes agrupada por edificio a la izquierda y, a la derecha, la ficha de la sede
// con una tarjeta por servicio (energía, acueducto, gas y aseo). La cuenta y el medidor son lo que le dice a Nova de qué
// sede es un recibo, por eso el número de cuenta no se puede repetir dentro del mismo servicio.

function SedeModal({ sede, edificios, onClose, onSaved }) {
  const [v, set] = useState(() => (sede ? { nombre: sede.nombre, edificio: sede.edificio || "", direccion: sede.direccion || "", ciudad: sede.ciudad || "", activo: sede.activo } : { nombre: "", edificio: "", direccion: "", ciudad: "", activo: true }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError("");
    try {
      const r = sede ? await conEditarMaestro("sede", sede.id, v) : await conCrearMaestro("sede", v);
      onSaved(sede ? "Cambios guardados." : "Sede creada.", r.id);
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }
  return (
    <Modal titulo={sede ? "Editar sede" : "Nueva sede"} sub="El nombre es como la vas a ver en recibos, reportes y filtros." onClose={onClose} onSubmit={guardar}
      pie={<><div className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando || !v.nombre.trim()}>{guardando ? <span className="spinner" /> : null} Guardar</button></>}>
      <div className="field full"><label htmlFor="cs-nombre">Nombre de la sede</label><input id="cs-nombre" value={v.nombre} maxLength={120} autoFocus placeholder="CL 81 # 11-08 · OF 1001" onChange={(e) => set({ ...v, nombre: e.target.value })} /></div>
      <div className="field"><label htmlFor="cs-edificio">Edificio (para agrupar)</label><input id="cs-edificio" list="cs-edificios" value={v.edificio} maxLength={160} placeholder="CL 81 # 11-08" onChange={(e) => set({ ...v, edificio: e.target.value })} /><datalist id="cs-edificios">{edificios.map((x) => <option key={x} value={x} />)}</datalist></div>
      <div className="field"><label htmlFor="cs-ciudad">Ciudad</label><input id="cs-ciudad" value={v.ciudad} maxLength={160} placeholder="Bogotá, D.C." onChange={(e) => set({ ...v, ciudad: e.target.value })} /></div>
      <div className="field full"><label htmlFor="cs-direccion">Dirección</label><input id="cs-direccion" value={v.direccion} maxLength={160} onChange={(e) => set({ ...v, direccion: e.target.value })} /></div>
      <div className="field full"><Interruptor id="cs-activo" texto="Sede activa" ayuda="Una sede inactiva conserva su historial, pero deja de ofrecerse al subir recibos." checked={v.activo} onChange={(x) => set({ ...v, activo: x })} /></div>
      {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
    </Modal>
  );
}

const MEDIDOR_VACIO = { numero: "", factor: "1", desde: "", hasta: "" };

function CuentaModal({ sede, cuenta, servicioInicial, empresas, onClose, onSaved }) {
  const [v, set] = useState(() => (cuenta
    ? { servicio: cuenta.servicio, empresaId: cuenta.empresaId || "", numeroCuenta: cuenta.numeroCuenta || "", titular: cuenta.titular || "", claseUso: cuenta.claseUso || "", estrato: cuenta.estrato || "", periodicidad: cuenta.periodicidad, direccionRecibo: cuenta.direccionRecibo || "", activo: cuenta.activo }
    : { servicio: servicioInicial || "energia", empresaId: "", numeroCuenta: "", titular: "", claseUso: "", estrato: "", periodicidad: servicioInicial === "acueducto" ? "bimestral" : "mensual", direccionRecibo: "", activo: true }));
  const [medidores, setMedidores] = useState(() => (cuenta?.medidores?.length ? cuenta.medidores.map((m) => ({ id: m.id, numero: m.numero, factor: String(m.factor).replace(".", ","), desde: m.desde || "", hasta: m.hasta || "" })) : []));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const conMedidor = v.servicio !== "aseo";
  // Primero las empresas que facturan ese servicio; las demás quedan disponibles por si falta marcarlo en Maestros.
  const opciones = useMemo(() => {
    const activas = empresas.filter((e) => e.activo || e.id === Number(v.empresaId));
    const delServicio = activas.filter((e) => String(e.servicios || "").split(",").includes(v.servicio));
    return { delServicio, otras: activas.filter((e) => !delServicio.includes(e)) };
  }, [empresas, v.servicio, v.empresaId]);
  const cambiarMedidor = (i, campo, valor) => setMedidores((l) => l.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError("");
    const datos = { ...v, sedeId: sede.id, empresaId: Number(v.empresaId) || null, noAplica: false, medidores: conMedidor ? medidores.filter((m) => m.numero.trim()) : [] };
    try {
      if (cuenta) await conEditarMaestro("cuenta", cuenta.id, datos); else await conCrearMaestro("cuenta", datos);
      onSaved(cuenta ? "Cuenta actualizada." : "Cuenta agregada a la sede.");
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }

  return (
    <Modal titulo={cuenta ? "Editar cuenta de servicio" : "Agregar cuenta de servicio"} sub={sede.nombre} ancho={720} onClose={onClose} onSubmit={guardar}
      pie={<><span className="card-sub" style={{ margin: 0 }}>Con el número de cuenta y el medidor, Nova reconoce la sede de cada recibo.</span><div className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando || !v.numeroCuenta.trim()}>{guardando ? <span className="spinner" /> : null} Guardar</button></>}>
      <div className="field full">
        <label id="cc-servicio-l">Servicio</label>
        <div className="con-opciones" role="radiogroup" aria-labelledby="cc-servicio-l">
          {ORDEN_SERVICIOS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={v.servicio === s} className={`con-opcion${v.servicio === s ? " activa" : ""}`} disabled={!!cuenta?.recibos && cuenta.servicio !== s} onClick={() => set({ ...v, servicio: s, empresaId: "" })}>
              <PuntoServicio servicio={s} />{SERVICIOS[s].corto}
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label htmlFor="cc-empresa">Empresa que factura</label>
        <select id="cc-empresa" value={v.empresaId} onChange={(e) => set({ ...v, empresaId: e.target.value })}>
          <option value="">Sin definir</option>
          {opciones.delServicio.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          {opciones.otras.length > 0 && <optgroup label="Otras empresas">{opciones.otras.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</optgroup>}
        </select>
      </div>
      <div className="field"><label htmlFor="cc-numero">Número de cuenta o cuenta contrato</label><input id="cc-numero" value={v.numeroCuenta} maxLength={40} autoFocus={!cuenta} placeholder="Como sale en el recibo" onChange={(e) => set({ ...v, numeroCuenta: e.target.value })} /></div>
      <div className="field"><label htmlFor="cc-titular">Titular del recibo</label><input id="cc-titular" value={v.titular} maxLength={200} onChange={(e) => set({ ...v, titular: e.target.value })} /></div>
      <div className="field"><label htmlFor="cc-periodicidad">Cada cuánto llega</label><select id="cc-periodicidad" value={v.periodicidad} onChange={(e) => set({ ...v, periodicidad: e.target.value })}>{Object.entries(PERIODICIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="field"><label htmlFor="cc-clase">Clase de uso</label><input id="cc-clase" list="cc-clases" value={v.claseUso} maxLength={200} placeholder="Comercial" onChange={(e) => set({ ...v, claseUso: e.target.value })} /><datalist id="cc-clases"><option value="Comercial" /><option value="Residencial" /><option value="Industrial" /><option value="Oficial" /></datalist></div>
      <div className="field"><label htmlFor="cc-estrato">Estrato</label><input id="cc-estrato" value={v.estrato} maxLength={10} onChange={(e) => set({ ...v, estrato: e.target.value })} /></div>
      <div className="field full"><label htmlFor="cc-direccion">Dirección tal como la escribe el recibo</label><input id="cc-direccion" value={v.direccionRecibo} maxLength={200} placeholder="CL 81 NO 11 08 OFICINA 1001" onChange={(e) => set({ ...v, direccionRecibo: e.target.value })} /></div>

      {conMedidor && (
        <div className="field full">
          <label>Medidores</label>
          <div className="con-medidores">
            {medidores.length === 0 && <p className="card-sub" style={{ margin: 0 }}>Sin medidor todavía. Se puede agregar ahora o dejar que quede al subir el primer recibo.</p>}
            {medidores.map((m, i) => (
              <div key={m.id || `n${i}`} className="con-medidor">
                <div className="field"><label htmlFor={`cc-m-num-${i}`}>Número</label><input id={`cc-m-num-${i}`} value={m.numero} maxLength={40} onChange={(e) => cambiarMedidor(i, "numero", e.target.value)} /></div>
                <div className="field"><label htmlFor={`cc-m-fac-${i}`}>Factor</label><input id={`cc-m-fac-${i}`} value={m.factor} inputMode="decimal" onChange={(e) => cambiarMedidor(i, "factor", e.target.value)} /></div>
                <div className="field"><label htmlFor={`cc-m-des-${i}`}>Desde</label><input id={`cc-m-des-${i}`} type="date" value={m.desde} onChange={(e) => cambiarMedidor(i, "desde", e.target.value)} /></div>
                <div className="field"><label htmlFor={`cc-m-has-${i}`}>Hasta</label><input id={`cc-m-has-${i}`} type="date" value={m.hasta} onChange={(e) => cambiarMedidor(i, "hasta", e.target.value)} /></div>
                <button type="button" className="icon-action-btn delete" title="Quitar este medidor" aria-label={`Quitar el medidor ${m.numero || i + 1}`} onClick={() => setMedidores((l) => l.filter((_, j) => j !== i))}><IconTrash size={13} /></button>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => setMedidores((l) => [...l, { ...MEDIDOR_VACIO }])}><IconPlus size={12} /> Agregar medidor</button>
          </div>
        </div>
      )}
      {cuenta && <div className="field full"><Interruptor id="cc-activo" texto="Cuenta activa" ayuda="Desactívala cuando la cuenta se cierre o cambie: su historial se conserva." checked={v.activo} onChange={(x) => set({ ...v, activo: x })} /></div>}
      {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
    </Modal>
  );
}

// Tarjeta de una cuenta de la sede.
function TarjetaCuenta({ cuenta, empresa, puede, onEditar, onBorrar }) {
  const vigentes = cuenta.medidores.filter((m) => !m.hasta);
  return (
    <div className={`con-cuenta${cuenta.activo ? "" : " inactiva"}`}>
      <div className="con-cuenta-head"><EtiquetaServicio servicio={cuenta.servicio} corto /><span className="card-sub" style={{ margin: 0 }}>{PERIODICIDADES[cuenta.periodicidad] || cuenta.periodicidad}</span></div>
      <div className="con-cuenta-empresa">{empresa?.nombre || "Empresa sin definir"}</div>
      <div className="con-cuenta-numero">{cuenta.numeroCuenta}</div>
      <div className="con-cuenta-detalle">
        {cuenta.titular && <span>Titular: {cuenta.titular}</span>}
        {(cuenta.claseUso || cuenta.estrato) && <span>{[cuenta.claseUso, cuenta.estrato ? `estrato ${cuenta.estrato}` : null].filter(Boolean).join(" · ")}</span>}
        {cuenta.servicio !== "aseo" && <span>{cuenta.medidores.length === 0 ? "Sin medidor registrado" : `Medidor ${(vigentes.length ? vigentes : cuenta.medidores).map((m) => `${m.numero}${m.factor !== 1 ? ` (factor ${String(m.factor).replace(".", ",")})` : ""}`).join(", ")}${cuenta.medidores.length > vigentes.length && vigentes.length ? ` · ${cuenta.medidores.length - vigentes.length} anterior(es)` : ""}`}</span>}
      </div>
      <div className="con-cuenta-pie">
        <span className="pill-fila">
          {!cuenta.activo && <span className="pill muted">Inactiva</span>}
          {cuenta.recibos ? <span className="pill accent">{cuenta.recibos.toLocaleString("es-CO")} recibo(s)</span> : <span className="pill muted">Sin recibos</span>}
        </span>
        {puede && (
          <span className="acciones">
            <button type="button" className="icon-action-btn edit" onClick={onEditar} title="Editar la cuenta" aria-label={`Editar la cuenta ${cuenta.numeroCuenta}`}><IconEdit size={13} /></button>
            <button type="button" className="icon-action-btn delete" onClick={onBorrar} disabled={!!cuenta.recibos} title={cuenta.recibos ? "Tiene recibos: desactívala en lugar de eliminarla" : "Eliminar la cuenta"} aria-label={`Eliminar la cuenta ${cuenta.numeroCuenta}`}><IconTrash size={13} /></button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function SedesConsumo({ acceso }) {
  const { cat, error: errorCat, recargar } = useCatalogosConsumo();
  const { confirmar } = useConfirmar();
  const [busqueda, setBusqueda] = useState("");
  const [sedeId, setSedeId] = useState(null);
  const [editorSede, setEditorSede] = useState(null); // { sede | null }
  const [editorCuenta, setEditorCuenta] = useState(null); // { cuenta | null, servicio }
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const puede = !!acceso?.puedeAdministrar;

  const sedes = cat?.sedes || [];
  const visibles = useMemo(() => sedes.filter((s) => coincide(busqueda, s.nombre, s.edificio, s.direccion, s.ciudad, ...s.cuentas.map((c) => c.numeroCuenta))), [sedes, busqueda]);
  const grupos = useMemo(() => {
    const m = new Map();
    for (const s of visibles) { const k = s.edificio || "Sin edificio"; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return [...m.entries()];
  }, [visibles]);
  const edificios = useMemo(() => [...new Set(sedes.map((s) => s.edificio).filter(Boolean))], [sedes]);
  const sede = sedes.find((s) => s.id === sedeId) || visibles[0] || null;
  useEffect(() => { if (sede && sede.id !== sedeId) setSedeId(sede.id); }, [sede, sedeId]);
  const empresaDe = (id) => cat?.empresas.find((e) => e.id === id);

  const filasExcel = useMemo(() => sedes.flatMap((s) => (s.cuentas.length ? s.cuentas : [null]).map((c) => ({ s, c }))), [sedes]);

  async function ejecutar(fn, mensaje) {
    setOcupado(true); setError("");
    try { await fn(); await recargar(); setAviso(mensaje); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }

  async function borrarSede() {
    if (!(await confirmar({ titulo: "Eliminar la sede", mensaje: `Se elimina «${sede.nombre}» con sus ${sede.cuentas.length} cuenta(s) de servicio.`, detalle: "No tiene recibos, así que no se pierde historial. No se puede deshacer.", boton: "Sí, eliminar", peligro: true }))) return;
    await ejecutar(() => conBorrarMaestro("sede", sede.id), "Sede eliminada.");
    setSedeId(null);
  }
  async function borrarCuenta(c) {
    if (!(await confirmar({ titulo: "Eliminar la cuenta", mensaje: `Se elimina la cuenta ${c.numeroCuenta} de ${SERVICIOS[c.servicio].nombre.toLowerCase()} de «${sede.nombre}».`, detalle: "No tiene recibos. Nova dejará de reconocer esta sede por ese número de cuenta.", boton: "Sí, eliminar", peligro: true }))) return;
    await ejecutar(() => conBorrarMaestro("cuenta", c.id), "Cuenta eliminada.");
  }
  async function marcarNoAplica(servicio) {
    if (!(await confirmar({ titulo: `Esta sede no tiene ${SERVICIOS[servicio].nombre.toLowerCase()}`, mensaje: `«${sede.nombre}» quedará marcada sin ese servicio.`, detalle: "Así no aparece como recibo faltante. Se puede quitar la marca cuando quieras.", boton: "Sí, marcar" }))) return;
    await ejecutar(() => conCrearMaestro("cuenta", { sedeId: sede.id, servicio, noAplica: true }), "Marcado: la sede no tiene ese servicio.");
  }
  async function quitarNoAplica(c) {
    if (!(await confirmar({ titulo: "Quitar «no aplica»", mensaje: `«${sede.nombre}» volverá a esperar una cuenta de ${SERVICIOS[c.servicio].nombre.toLowerCase()}.`, boton: "Sí, quitar", peligro: true }))) return;
    await ejecutar(() => conBorrarMaestro("cuenta", c.id), "Marca quitada.");
  }

  return (
    <div className="con-sedes">
      <aside className="con-lista" aria-label="Sedes">
        <div className="maestros-search-wrap">
          <input type="search" placeholder="Buscar sede, dirección o cuenta" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar sede" />
          <span className="ic"><IconSearch size={14} /></span>
        </div>
        {!cat && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-bar" style={{ height: 34, borderRadius: 10, marginTop: 8 }} aria-hidden="true" />)}
        {cat && grupos.length === 0 && <EstadoVacio compacto titulo="Sin sedes">{busqueda ? "Ninguna sede coincide con la búsqueda." : "Crea la primera sede para empezar."}</EstadoVacio>}
        {grupos.map(([edificio, lista]) => (
          <div key={edificio} className="con-lista-grupo">
            <div className="con-lista-titulo">{edificio}</div>
            {lista.map((s) => (
              <button key={s.id} type="button" className={`con-lista-item${sede?.id === s.id ? " activa" : ""}${s.activo ? "" : " inactiva"}`} aria-current={sede?.id === s.id ? "true" : undefined} onClick={() => crossfade(() => setSedeId(s.id))}>
                <span className="con-lista-nombre">{s.nombre.startsWith(`${edificio} · `) ? s.nombre.slice(edificio.length + 3) : s.nombre}</span>
                <span className="con-lista-puntos">
                  {["energia", "acueducto", "gas"].map((sv) => {
                    const tiene = s.cuentas.some((c) => c.servicio === sv && !c.noAplica && c.activo);
                    return <PuntoServicio key={sv} servicio={sv} apagado={!tiene} titulo={`${SERVICIOS[sv].corto}: ${tiene ? "con cuenta" : "sin cuenta"}`} />;
                  })}
                </span>
              </button>
            ))}
          </div>
        ))}
        <p className="con-lista-nota">Cuadros: energía, acueducto y gas. En gris, la sede no tiene cuenta de ese servicio.</p>
      </aside>

      <section className="con-ficha">
        <div className="con-ficha-barra">
          <BotonExcel nombre="consumo-sedes-y-cuentas" hoja="Sedes y cuentas" filas={filasExcel} deshabilitado={!sedes.length} columnas={[
            { t: "Sede", v: (f) => f.s.nombre }, { t: "Edificio", v: (f) => f.s.edificio }, { t: "Ciudad", v: (f) => f.s.ciudad }, { t: "Dirección", v: (f) => f.s.direccion }, { t: "Sede activa", v: (f) => (f.s.activo ? "Sí" : "No") },
            { t: "Servicio", v: (f) => (f.c ? SERVICIOS[f.c.servicio]?.nombre : "") }, { t: "Empresa", v: (f) => (f.c ? empresaDe(f.c.empresaId)?.nombre : "") },
            { t: "Número de cuenta", v: (f) => (f.c ? (f.c.noAplica ? "No aplica" : f.c.numeroCuenta) : "") }, { t: "Titular", v: (f) => f.c?.titular }, { t: "Clase de uso", v: (f) => f.c?.claseUso }, { t: "Estrato", v: (f) => f.c?.estrato },
            { t: "Periodicidad", v: (f) => (f.c && !f.c.noAplica ? PERIODICIDADES[f.c.periodicidad] : "") }, { t: "Medidores", v: (f) => f.c?.medidores.map((m) => m.numero).join(", ") }, { t: "Recibos", v: (f) => f.c?.recibos ?? 0 }, { t: "Creado por", v: (f) => (f.c || f.s).creadoPorNombre },
          ]} />
          <div className="spacer" />
          {puede && <button type="button" className="btn btn-primary" onClick={() => setEditorSede({ sede: null })} disabled={!cat}><IconPlus size={13} /> Nueva sede</button>}
        </div>
        {(error || errorCat) && <div className="modal-error" style={{ marginBottom: 12 }}>{error || errorCat}</div>}

        {cat && !sede && <EstadoVacio titulo="Elige una sede" icono={<IconBuilding size={22} />}>Aquí verás sus cuentas de energía, acueducto, gas y aseo.</EstadoVacio>}
        {sede && (
          <>
            <div className="con-hero">
              <div style={{ minWidth: 0 }}>
                <div className="con-hero-sobre">{[...new Set([sede.edificio, sede.ciudad].filter(Boolean))].join(" · ") || "Sede"}</div>
                <h2>{sede.nombre}</h2>
                <div className="con-hero-chips">
                  <span>{sede.activo ? "Activa" : "Inactiva"}</span>
                  <span>{sede.cuentas.filter((c) => !c.noAplica).length} cuenta(s) de servicio</span>
                  <span>{sede.recibos.toLocaleString("es-CO")} recibo(s)</span>
                  {sede.direccion && <span>{sede.direccion}</span>}
                </div>
              </div>
              {puede && (
                <div className="con-hero-acc">
                  <button type="button" className="btn con-btn-claro" onClick={() => setEditorSede({ sede })}>Editar sede</button>
                  <button type="button" className="btn con-btn-claro" onClick={borrarSede} disabled={ocupado || !!sede.recibos} title={sede.recibos ? "Tiene recibos: desactívala en lugar de eliminarla" : "Eliminar la sede"}>Eliminar</button>
                </div>
              )}
            </div>

            <div className="con-cuentas">
              {ORDEN_SERVICIOS.map((sv) => {
                const cuentas = sede.cuentas.filter((c) => c.servicio === sv);
                const noAplica = cuentas.find((c) => c.noAplica);
                if (noAplica) {
                  return (
                    <div key={sv} className="con-cuenta vacia">
                      <div className="con-cuenta-head"><EtiquetaServicio servicio={sv} corto /><span className="pill muted">No aplica</span></div>
                      <div className="con-cuenta-detalle"><span>Esta sede no tiene {SERVICIOS[sv].nombre.toLowerCase()}: no se reporta como recibo faltante.</span></div>
                      {puede && <div className="con-cuenta-pie"><button type="button" className="btn small" onClick={() => quitarNoAplica(noAplica)} disabled={ocupado}>Quitar «no aplica»</button></div>}
                    </div>
                  );
                }
                if (!cuentas.length) {
                  return (
                    <div key={sv} className="con-cuenta vacia">
                      <div className="con-cuenta-head"><EtiquetaServicio servicio={sv} corto /><span className="pill muted">Sin cuenta</span></div>
                      <div className="con-cuenta-detalle"><span>{sv === "aseo" ? "En Bogotá suele venir dentro del recibo de energía: se guarda como cargo aparte." : "Se crea al confirmar la sede del primer recibo que subas, o agrégala ahora."}</span></div>
                      {puede && (
                        <div className="con-cuenta-pie">
                          <button type="button" className="btn small" onClick={() => setEditorCuenta({ cuenta: null, servicio: sv })}><IconPlus size={12} /> Agregar cuenta</button>
                          <button type="button" className="btn small btn-ghost" onClick={() => marcarNoAplica(sv)} disabled={ocupado}>No aplica</button>
                        </div>
                      )}
                    </div>
                  );
                }
                return cuentas.map((c) => <TarjetaCuenta key={c.id} cuenta={c} empresa={empresaDe(c.empresaId)} puede={puede} onEditar={() => setEditorCuenta({ cuenta: c, servicio: sv })} onBorrar={() => borrarCuenta(c)} />);
              })}
            </div>
            {puede && sede.cuentas.some((c) => !c.noAplica) && (
              <p className="card-sub" style={{ marginTop: 12 }}>¿La sede tiene otra cuenta del mismo servicio (por ejemplo, tras un cambio de medidor con cuenta nueva)? <button type="button" className="con-enlace" onClick={() => setEditorCuenta({ cuenta: null, servicio: "energia" })}>Agregar otra cuenta</button></p>
            )}
            <p className="card-sub" style={{ marginTop: 6 }}>{creadoPor(sede)}</p>
          </>
        )}
      </section>

      {editorSede && <SedeModal sede={editorSede.sede} edificios={edificios} onClose={() => setEditorSede(null)} onSaved={(m, id) => { setEditorSede(null); setAviso(m); recargar().then(() => id && setSedeId(id)); }} />}
      {editorCuenta && sede && cat && <CuentaModal sede={sede} cuenta={editorCuenta.cuenta} servicioInicial={editorCuenta.servicio} empresas={cat.empresas} onClose={() => setEditorCuenta(null)} onSaved={(m) => { setEditorCuenta(null); setAviso(m); recargar(); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
