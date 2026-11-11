"use client";

import { useCallback, useEffect, useState } from "react";
import { tesRecurrentes, tesCrearRecurrente, tesEditarRecurrente, tesBorrarRecurrente, tesDetectarRecurrentes, tesGenerarProyectados } from "@/lib/tesoreriaApi";
import { crossfade } from "@/lib/crossfade";
import { Portal, Paginacion } from "@/components/notificaciones/ui";
import MoneyInput from "@/components/MoneyInput";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import { IconClock, IconSearch, IconPlus, IconEdit, IconTrash, IconCheck, IconCalendar } from "@/components/icons";
import { Celda, fechaCorta, useCatalogos, Aviso, hoyCO, tipoTexto } from "@/components/tesoreria/comun";
import { FilasEsqueleto } from "@/components/tesoreria/Esqueletos";

// Pagos recurrentes: cada uno genera solo el proyectado de los próximos meses; el soporte o el extracto lo vuelven
// ejecutado (con el valor real si es variable). «Detectar recurrentes» propone los que ya se repiten (sin IA).
const PAGE_SIZES = [25, 50, 100];
const FRECUENCIAS = [["mensual", "Cada mes"], ["bimestral", "Cada 2 meses"], ["trimestral", "Cada 3 meses"], ["semestral", "Cada 6 meses"], ["anual", "Cada año"]];
const FILTROS = [["activos", "Activos"], ["inactivos", "Apagados"], ["", "Todos"]];

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <label className="toggle-switch" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

function FormRecurrente({ cat, inicial, onClose, onSaved }) {
  const editando = !!inicial?.id;
  const [v, set] = useState(() => ({ tipo: "egreso", frecuencia: "mensual", diaDelMes: 5, desde: `${hoyCO().slice(0, 7)}-01`, valorVariable: false, activo: true, ...inicial, valor: inicial?.valor != null ? String(inicial.valor) : "" }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cuenta = cat.cuentas.find((c) => c.id === Number(v.cuentaId));
  const cambia = (k) => (e) => set({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError("");
    const datos = {
      nombre: v.nombre, tipo: v.tipo, valor: Number(v.valor), valorVariable: !!v.valorVariable, cuentaId: Number(v.cuentaId) || null,
      cuentaDestinoId: v.tipo === "traslado" ? Number(v.cuentaDestinoId) || null : null, conceptoId: Number(v.conceptoId) || null,
      itemId: Number(v.itemId) || null, pagadorId: Number(v.pagadorId) || null, tercero: v.tercero || null,
      frecuencia: v.frecuencia, diaDelMes: Number(v.diaDelMes), desde: v.desde, hasta: v.hasta || null, activo: !!v.activo,
    };
    try {
      const r = editando ? await tesEditarRecurrente(inicial.id, datos) : await tesCrearRecurrente(datos);
      onSaved(editando ? `Guardado. Se rehicieron ${r.generados} proyectado(s) futuros.` : `Pago recurrente creado: ${r.generados} proyectado(s) generados.`);
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }

  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <form className="modal" role="dialog" aria-modal="true" onSubmit={guardar} style={{ maxWidth: 720, width: "100%" }}>
          <div className="modal-head"><h3>{editando ? `Editar «${inicial.nombre}»` : "Nuevo pago recurrente"}</h3><button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
          <div className="modal-body tes-modal-body">
            <div className="tes-form">
              <div className="field span-2"><label htmlFor="rc-nombre">Nombre</label><input id="rc-nombre" value={v.nombre || ""} maxLength={160} autoFocus onChange={cambia("nombre")} placeholder="Ej. Arriendo oficina 501" /></div>
              <div className="field"><label htmlFor="rc-tipo">Tipo</label><select id="rc-tipo" value={v.tipo} onChange={cambia("tipo")}><option value="egreso">Egreso (sale)</option><option value="ingreso">Ingreso (entra)</option><option value="traslado">Traslado entre cuentas propias</option></select></div>
              <div className="field"><label htmlFor="rc-valor">Valor{v.valorVariable ? " estimado" : ""}</label><MoneyInput id="rc-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix={cuenta?.moneda || "COP"} decimales={cuenta && cuenta.moneda !== "COP" ? 2 : 0} /></div>
              <label className="tes-check span-2"><span>El valor cambia cada vez (servicios, tarjeta): el proyectado lleva este estimado y se corrige con el real</span><input type="checkbox" checked={!!v.valorVariable} onChange={cambia("valorVariable")} /></label>
              <div className="field"><label htmlFor="rc-cuenta">{v.tipo === "traslado" ? "Cuenta origen" : "Cuenta"}</label><select id="rc-cuenta" value={v.cuentaId || ""} onChange={cambia("cuentaId")}><option value="">Elige…</option>{cat.cuentas.filter((c) => c.activo || c.id === Number(v.cuentaId)).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}</select></div>
              {v.tipo === "traslado" ? (
                <div className="field"><label htmlFor="rc-destino">Cuenta destino</label><select id="rc-destino" value={v.cuentaDestinoId || ""} onChange={cambia("cuentaDestinoId")}><option value="">Elige…</option>{cat.cuentas.filter((c) => c.activo && c.id !== Number(v.cuentaId)).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}</select></div>
              ) : <div />}
              <div className="field span-2"><label htmlFor="rc-concepto">Concepto</label><select id="rc-concepto" value={v.conceptoId || ""} onChange={(e) => { const c = cat.conceptos.find((x) => x.id === Number(e.target.value)); set({ ...v, conceptoId: e.target.value, itemId: v.itemId || c?.itemId || "" }); }}><option value="">Elige…</option>{cat.conceptos.filter((c) => c.activo || c.id === Number(v.conceptoId)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
              <div className="field"><label htmlFor="rc-item">Ítem</label><select id="rc-item" value={v.itemId || ""} onChange={cambia("itemId")}><option value="">Sin ítem</option>{cat.items.filter((c) => c.activo || c.id === Number(v.itemId)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
              <div className="field"><label htmlFor="rc-paga">Paga</label><select id="rc-paga" value={v.pagadorId || ""} onChange={cambia("pagadorId")}><option value="">—</option>{cat.pagadores.filter((c) => c.activo || c.id === Number(v.pagadorId)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
              <div className="field"><label htmlFor="rc-frec">Frecuencia</label><select id="rc-frec" value={v.frecuencia} onChange={cambia("frecuencia")}>{FRECUENCIAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="rc-dia">Día del mes</label><input id="rc-dia" type="number" min={1} max={31} value={v.diaDelMes} onChange={cambia("diaDelMes")} /><small className="muted">En meses más cortos, el último día.</small></div>
              <div className="field"><label htmlFor="rc-desde">Desde</label><input id="rc-desde" type="date" value={v.desde || ""} onChange={cambia("desde")} /></div>
              <div className="field"><label htmlFor="rc-hasta">Hasta (opcional)</label><input id="rc-hasta" type="date" value={v.hasta || ""} onChange={cambia("hasta")} /></div>
              <div className="field span-2"><label htmlFor="rc-tercero">Tercero (opcional)</label><input id="rc-tercero" value={v.tercero || ""} maxLength={200} onChange={cambia("tercero")} /></div>
            </div>
            {editando && <p className="prov-note" style={{ margin: 0 }}>Al guardar se rehacen solo los proyectados futuros que aún no se han pagado ni conciliado; lo ya pagado no cambia.</p>}
            {error && <p className="modal-error">{error}</p>}
          </div>
          <div className="modal-foot"><div className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando || !v.nombre?.trim()}>{guardando ? <span className="spinner" /> : null} Guardar</button></div>
        </form>
      </div>
    </Portal>
  );
}

export default function RecurrentesTesoreria({ acceso }) {
  const { cat } = useCatalogos();
  const puede = !!acceso?.puedeRegistrar;
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState("activos");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [form, setForm] = useState(null);
  const [propuestas, setPropuestas] = useState(null);
  const [descartadas, setDescartadas] = useState(new Set());
  const [ocupado, setOcupado] = useState("");
  const [confirmarBorrar, setConfirmarBorrar] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => tesRecurrentes().then((r) => { setLista(r.recurrentes); setError(""); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [filtro, size]);

  async function hacer(clave, fn, msg) {
    setOcupado(clave); setError("");
    try { const r = await fn(); if (msg) setAviso(typeof msg === "function" ? msg(r) : msg); await cargar(); return r; } catch (e) { setError(e.message); return null; } finally { setOcupado(""); }
  }
  async function detectar() {
    setOcupado("detectar"); setError("");
    try { setPropuestas((await tesDetectarRecurrentes()).propuestas); setDescartadas(new Set()); } catch (e) { setError(e.message); } finally { setOcupado(""); }
  }

  const filas = (lista || []).filter((r) => (filtro === "activos" ? r.activo : filtro === "inactivos" ? !r.activo : true));
  const pagina = filas.slice((page - 1) * size, page * size);
  const activos = (lista || []).filter((r) => r.activo);
  const proximos30 = activos.filter((r) => r.proximo && Date.parse(r.proximo) - Date.parse(hoyCO()) <= 30 * 86400000).length;
  const visibles = (propuestas || []).filter((p) => !descartadas.has(p.clave));

  return (
    <div className="tes-vista">
      <CabezaAgente icono={<IconClock size={22} />} color="verde" titulo="Pagos recurrentes"
        descripcion="Arriendos, administración, servicios, nómina, tarjeta… Cada uno genera solo su proyectado de los próximos tres meses; cuando llega el soporte o el extracto, se vuelve ejecutado sin crear otro movimiento.">
        {puede && (
          <>
            <button type="button" className="btn ag-btn-grande" onClick={detectar} disabled={!!ocupado}>{ocupado === "detectar" ? <span className="spinner" /> : <IconSearch size={15} />} Detectar recurrentes</button>
            <button type="button" className="btn ag-btn-grande" onClick={() => hacer("generar", tesGenerarProyectados, (r) => (r.generados ? `${r.generados} proyectado(s) generados.` : "Ya estaban todos los proyectados al día."))} disabled={!!ocupado}>{ocupado === "generar" ? <span className="spinner" /> : <IconCalendar size={15} />} Generar proyectados</button>
            <button type="button" className="btn btn-primary ag-btn-grande" onClick={() => setForm({})} disabled={!cat}><IconPlus size={15} /> Nuevo recurrente</button>
          </>
        )}
      </CabezaAgente>

      <section className="tca-cifras tes-rec-cifras">
        <CifraAgente icono={<IconClock size={18} />} etiqueta="Recurrentes activos" valor={lista ? activos.length : "…"} nota={lista ? `${lista.length - activos.length} apagado(s)` : ""} tono="destaca" />
        <CifraAgente icono={<IconCalendar size={18} />} etiqueta="Vencen en 30 días" valor={lista ? proximos30 : "…"} nota="según su próximo proyectado" />
        <CifraAgente icono={<IconCheck size={18} />} etiqueta="Ya ejecutados" valor={lista ? activos.reduce((a, r) => a + r.ejecutados, 0) : "…"} nota="proyectados que se cerraron con soporte o extracto" />
      </section>

      {error && <p className="modal-error">{error}</p>}

      {propuestas && (
        <div className="ag-lista-card">
          <div className="ag-barra-filtros">
            <strong>Recurrentes detectados en lo ya pagado ({visibles.length})</strong>
            <button type="button" className="btn small" onClick={() => setPropuestas(null)}>Cerrar</button>
          </div>
          {visibles.length ? (
            <ul className="ag-propuestas">
              {visibles.map((p) => (
                <li key={p.clave} className={`ag-propuesta conf-${p.meses >= 5 ? "alta" : "media"} tes-rec-prop`}>
                  <div className="ag-prop-compra">
                    <span className="ag-etiqueta">{tipoTexto(p.tipo)} · {p.cuenta}</span>
                    <strong><Celda v={p.concepto} ancha /></strong>
                    <span className="ag-prop-meta"><b>{p.valorTexto}</b>{p.valorVariable ? " · valor variable" : ""}{p.item ? ` · ${p.item}` : ""}</span>
                  </div>
                  <div className="ag-prop-razon"><span>{p.razon}</span></div>
                  <div className="ag-prop-acciones">
                    {puede && <button type="button" className="btn btn-primary small" onClick={() => setForm({ nombre: p.concepto, tipo: p.tipo, valor: p.valor, valorVariable: p.valorVariable, cuentaId: p.cuentaId, conceptoId: p.conceptoId, itemId: p.itemId, pagadorId: p.pagadorId, tercero: p.tercero, diaDelMes: p.diaDelMes, _clave: p.clave })}><IconPlus size={13} /> Crear</button>}
                    <button type="button" className="btn small" onClick={() => setDescartadas((s) => new Set(s).add(p.clave))}>Descartar</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <VacioAgente icono={<IconCheck size={26} />} titulo="No encontré más pagos que se repitan">Todo lo que se repite en los últimos 6 meses ya tiene su recurrente, o no hay suficientes meses de datos.</VacioAgente>}
        </div>
      )}

      <div className="table-card">
        <div className="ag-barra-filtros">
          <div className="ag-segmentos" role="tablist" aria-label="Estado">
            {FILTROS.map(([k, t]) => <button key={k || "todos"} type="button" role="tab" aria-selected={filtro === k} className="dash-tab" onClick={() => crossfade(() => setFiltro(k))}>{t}</button>)}
          </div>
        </div>
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead><tr><th>Nombre</th><th>Tipo</th><th style={{ textAlign: "right" }}>Valor</th><th>Cuenta</th><th>Concepto</th><th>Frecuencia</th><th>Próximo</th><th>Generados</th><th>Activo</th>{puede && <th aria-label="Acciones" />}</tr></thead>
            <tbody>
              {!lista && <tr><td colSpan={puede ? 10 : 9} style={{ padding: 0 }}><FilasEsqueleto filas={5} columnas={8} /></td></tr>}
              {lista && !pagina.length && <tr><td colSpan={puede ? 10 : 9}><VacioAgente icono={<IconClock size={26} />} titulo={filtro === "activos" ? "Aún no hay pagos recurrentes" : "Nada en este filtro"}>{filtro === "activos" ? "Crea el primero o usa «Detectar recurrentes» para que el sistema te proponga los que ya se repiten." : null}</VacioAgente></td></tr>}
              {pagina.map((r) => (
                <tr key={r.id}>
                  <td><Celda v={r.nombre} ancha /></td>
                  <td>{tipoTexto(r.tipo)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className={r.tipo === "egreso" ? "tes-neg" : r.tipo === "ingreso" ? "tes-pos" : ""}><strong>{r.valorTexto}</strong>{r.valorVariable ? <span className="pill muted tes-rec-var" title="Valor estimado: se corrige con el real">variable</span> : null}</td>
                  <td><Celda v={r.cuentaDestino ? `${r.cuenta} → ${r.cuentaDestino}` : r.cuenta} /></td>
                  <td><Celda v={`${r.concepto}${r.item ? ` · ${r.item}` : ""}`} ancha /></td>
                  <td>{r.descripcion}</td>
                  <td>{r.activo ? (r.proximo ? fechaCorta(r.proximo) : <span className="muted">—</span>) : <span className="muted">Apagado</span>}</td>
                  <td title="Proyectados pendientes · ya ejecutados">{r.proyectados} · <span className="tes-pos">{r.ejecutados} ✓</span></td>
                  <td><ToggleSwitch checked={r.activo} disabled={!puede || ocupado === `act-${r.id}`} title={r.activo ? "Apagar (quita los proyectados futuros sin pagar)" : "Encender"} onChange={() => hacer(`act-${r.id}`, () => tesEditarRecurrente(r.id, { activo: !r.activo }), r.activo ? "Apagado: se quitaron sus proyectados futuros sin pagar." : "Encendido: se generaron sus proyectados.")} /></td>
                  {puede && (
                    <td className="acciones" style={{ whiteSpace: "nowrap" }}>
                      {confirmarBorrar === r.id ? (
                        <span className="confirm-del"><span>¿Eliminar?</span><button type="button" className="btn btn-danger-solid small" disabled={!!ocupado} onClick={() => hacer(`del-${r.id}`, () => tesBorrarRecurrente(r.id), (x) => `Eliminado; se quitaron ${x.quitados} proyectado(s) futuros. Lo ya pagado se conserva.`).then(() => setConfirmarBorrar(null))}>Sí</button><button type="button" className="btn small" onClick={() => setConfirmarBorrar(null)}>No</button></span>
                      ) : (
                        <>
                          <button type="button" className="icon-action-btn edit" title="Editar" onClick={() => setForm(r)}><IconEdit size={13} /></button>
                          <button type="button" className="icon-action-btn delete" title="Eliminar" onClick={() => setConfirmarBorrar(r.id)}><IconTrash size={13} /></button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion id="tes-rec-pagesize" page={page} size={size} total={filas.length} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="pago(s) recurrente(s)" />
      </div>

      {form && cat && (
        <FormRecurrente cat={cat} inicial={form} onClose={() => setForm(null)}
          onSaved={(m) => { if (form._clave) setDescartadas((s) => new Set(s).add(form._clave)); setForm(null); setAviso(m); cargar(); }} />
      )}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
