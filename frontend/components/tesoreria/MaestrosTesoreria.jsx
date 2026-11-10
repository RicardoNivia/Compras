"use client";

import { useEffect, useMemo, useState } from "react";
import { tesCrearMaestro, tesEditarMaestro, tesBorrarMaestro } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { Portal } from "@/components/notificaciones/ui";
import { IconSearch, IconPlus, IconEdit, IconTrash, IconMoney, IconLayers, IconList, IconUsers } from "@/components/icons";
import { useCatalogos, Aviso } from "@/components/tesoreria/comun";
import MoneyInput from "@/components/MoneyInput";

// Maestros de Tesorería con el mismo diseño que los de Compras y Bienestar (components/MaestrosView.jsx): menú a la
// izquierda, buscador, «Crear nuevo», tabla con En uso / Activo / acciones y paginación.
const PAGE_SIZES = [25, 50, 100];
const TIPOS = [
  { k: "cuenta", lista: "cuentas", label: "Cuentas", col: "Cuenta", Icon: IconMoney },
  { k: "item", lista: "items", label: "Ítems", col: "Ítem", Icon: IconLayers },
  { k: "concepto", lista: "conceptos", label: "Conceptos", col: "Concepto", Icon: IconList },
  { k: "pagador", lista: "pagadores", label: "Quién paga", col: "Pagador", Icon: IconUsers },
];
const TIPO_CUENTA = { ahorros: "Ahorros", inversion: "Inversión", tarjeta: "Tarjeta de crédito", efectivo: "Efectivo", otro: "Otro" };
const FORMATO = { avvillas: "Tipo AV Villas", credicorp: "Tipo Credicorp", generico: "Genérico (fecha, descripción, valor)" };
const sin = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <label className="toggle-switch" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

function EditorModal({ tipo, fila, cat, onClose, onSaved }) {
  const def = TIPOS.find((t) => t.k === tipo);
  const [v, set] = useState(() => fila ? { ...fila } : { nombre: "", tipo: "ahorros", moneda: "COP", activo: true });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError("");
    const datos = { nombre: v.nombre, activo: v.activo };
    if (tipo === "cuenta") Object.assign(datos, { tipo: v.tipo, moneda: v.moneda, formatoExtracto: v.formatoExtracto || null, saldoInicial: v.saldoInicial || 0, saldoInicialFecha: v.saldoInicialFecha || null });
    if (tipo === "concepto") datos.itemId = Number(v.itemId) || null;
    try {
      if (fila) await tesEditarMaestro(tipo, fila.id, datos); else await tesCrearMaestro(tipo, datos);
      onSaved(fila ? "Cambios guardados." : `${def.col} creado.`);
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }
  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <form className="modal" role="dialog" aria-modal="true" onSubmit={guardar} style={{ maxWidth: 560 }}>
          <div className="modal-head"><h3>{fila ? `Editar ${def.col.toLowerCase()}` : `Nuevo: ${def.col.toLowerCase()}`}</h3><button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
          <div className="modal-body">
            <div className="field full"><label htmlFor="tmm-nombre">{def.col}</label><input id="tmm-nombre" value={v.nombre} maxLength={120} autoFocus onChange={(e) => set({ ...v, nombre: e.target.value })} /></div>
            {tipo === "cuenta" && (
              <>
                <div className="field"><label htmlFor="tmm-tipo">Tipo</label><select id="tmm-tipo" value={v.tipo} onChange={(e) => set({ ...v, tipo: e.target.value })}>{Object.entries(TIPO_CUENTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div className="field"><label htmlFor="tmm-moneda">Moneda (código ISO 4217)</label><input id="tmm-moneda" value={v.moneda} maxLength={3} onChange={(e) => set({ ...v, moneda: e.target.value.toUpperCase() })} placeholder="COP" /></div>
                <div className="field full"><label htmlFor="tmm-formato">Formato del extracto</label><select id="tmm-formato" value={v.formatoExtracto || ""} onChange={(e) => set({ ...v, formatoExtracto: e.target.value })}><option value="">Detectar solo</option>{Object.entries(FORMATO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div className="field"><label htmlFor="tmm-saldo">Saldo inicial ({v.moneda || "COP"})</label><MoneyInput id="tmm-saldo" value={v.saldoInicial ?? ""} onChange={(x) => set({ ...v, saldoInicial: x })} prefix={v.moneda || "COP"} decimales={v.moneda && v.moneda !== "COP" ? 2 : 0} permitirNegativo /></div>
                <div className="field"><label htmlFor="tmm-saldo-f">Fecha del saldo inicial</label><input id="tmm-saldo-f" type="date" value={v.saldoInicialFecha || ""} onChange={(e) => set({ ...v, saldoInicialFecha: e.target.value })} /></div>
              </>
            )}
            {tipo === "concepto" && (
              <div className="field full"><label htmlFor="tmm-item">Ítem por defecto</label><select id="tmm-item" value={v.itemId || ""} onChange={(e) => set({ ...v, itemId: e.target.value })}><option value="">Sin ítem</option>{cat.items.filter((i) => i.activo || i.id === v.itemId).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
            )}
            {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
          </div>
          <div className="modal-foot"><div className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando || !v.nombre.trim()}>{guardando ? <span className="spinner" /> : null} Guardar</button></div>
        </form>
      </div>
    </Portal>
  );
}

export default function MaestrosTesoreria({ acceso }) {
  const { cat, error: errorCat, recargar } = useCatalogos();
  const [tab, setTab] = useState("cuenta");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [editor, setEditor] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const puede = !!acceso?.puedeFirmar;
  useEffect(() => { setPage(1); setConfirmDeleteId(null); }, [tab, search, pageSize]);

  const def = TIPOS.find((t) => t.k === tab);
  const rows = useMemo(() => (cat?.[def.lista] || []).filter((x) => !search || sin(x.nombre).includes(sin(search))), [cat, def, search]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const usos = cat?.usos?.[tab] || {};
  const itemNombre = (id) => cat?.items.find((i) => i.id === id)?.nombre;
  const extras = tab === "cuenta" ? 4 : tab === "concepto" ? 1 : 0;

  async function toggleActivo(f) {
    setOcupadoId(f.id); setError("");
    try { await tesEditarMaestro(tab, f.id, { activo: !f.activo }); await recargar(); } catch (e) { setError(e.message); } finally { setOcupadoId(null); }
  }
  async function borrar(f) {
    setOcupadoId(f.id); setError("");
    try { await tesBorrarMaestro(tab, f.id); setAviso("Eliminado."); setConfirmDeleteId(null); await recargar(); } catch (e) { setError(e.message); } finally { setOcupadoId(null); }
  }

  return (
    <div className="maestros-shell">
      <aside className="maestros-nav">
        <div className="maestros-nav-group">
          <div className="maestros-nav-head">Maestros de Tesorería</div>
          <nav aria-label="Maestros de Tesorería">
            {TIPOS.map((t) => (
              <button key={t.k} type="button" className={`maestros-nav-item${tab === t.k ? " active" : ""}`} onClick={() => crossfade(() => setTab(t.k))}>
                <span className="ic"><t.Icon size={16} /></span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <p className="maestros-nav-nota">
          {puede ? "Un valor en uso no se borra: se desactiva y deja de ofrecerse, pero los movimientos que lo usan lo conservan. Las cuentas llevan su moneda con el código ISO 4217." : "Solo quien tiene acceso de firma en Tesorería edita los maestros."}
        </p>
      </aside>

      <section className="maestros-main">
        <div className="maestros-toolbar">
          <div className="maestros-search-wrap">
            <input type="search" placeholder="Buscar por nombre" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
            <span className="ic"><IconSearch size={14} /></span>
          </div>
          <div className="spacer" />
          {puede && <button type="button" className="btn btn-primary" onClick={() => setEditor({ fila: null })} disabled={!cat}><IconPlus size={13} /> Crear nuevo</button>}
        </div>
        {(error || errorCat) && <div className="modal-error" style={{ marginBottom: 10 }}>{error || errorCat}</div>}

        <table className="maestros-table">
          <thead>
            <tr>
              <th>{def.col}</th>
              {tab === "cuenta" && <><th>Tipo</th><th>Moneda</th><th>Extracto</th><th style={{ textAlign: "right" }}>Saldo inicial</th></>}
              {tab === "concepto" && <th>Ítem por defecto</th>}
              <th className="col-uso">En uso</th>
              <th className="col-activo">Activo</th>
              <th className="col-acciones"></th>
            </tr>
          </thead>
          <tbody>
            {!cat && Array.from({ length: 6 }).map((_, i) => <tr key={`esq-${i}`} aria-hidden="true"><td colSpan={4 + extras}><div className="skeleton-bar" style={{ height: 22, borderRadius: 8 }} /></td></tr>)}
            {cat && pageRows.length === 0 && (
              <tr><td colSpan={4 + extras}><div className="empty">{cat ? `No hay ${def.label.toLowerCase()} que coincidan.` : "Cargando…"}</div></td></tr>
            )}
            {pageRows.map((f) => {
              const n = usos[f.id] || 0;
              const confirming = confirmDeleteId === f.id;
              return (
                <tr key={f.id}>
                  <td className="truncate"><span className="desc-tooltip-wrap"><span className="desc-text">{f.nombre}</span><span className="desc-tooltip-bubble">{f.nombre}{f.creadoPorNombre ? ` · creado por ${f.creadoPorNombre}` : ""}</span></span></td>
                  {tab === "cuenta" && <><td>{TIPO_CUENTA[f.tipo] || f.tipo}</td><td>{f.moneda}</td><td>{FORMATO[f.formatoExtracto] || <span className="muted">Detectar</span>}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoneda(f.saldoInicial, f.moneda)}</td></>}
                  {tab === "concepto" && <td className="truncate">{itemNombre(f.itemId) || <span className="muted">—</span>}</td>}
                  <td>{n ? <span className="pill accent" title={`${n} movimiento(s) lo usan: no se puede eliminar, solo desactivar.`}>{n.toLocaleString("es-CO")} mov.</span> : <span className="pill good" title="Sin uso: se puede eliminar">Libre</span>}</td>
                  <td><ToggleSwitch checked={f.activo} onChange={() => toggleActivo(f)} disabled={!puede || ocupadoId === f.id} title={f.activo ? "Inactivar" : "Activar"} /></td>
                  <td className="acciones">
                    {puede && (confirming ? (
                      <div className="confirm-del">
                        <span>¿Eliminar?</span>
                        <button type="button" className="btn btn-danger-solid small" onClick={() => borrar(f)} disabled={ocupadoId === f.id}>{ocupadoId === f.id ? <span className="spinner" /> : "Sí"}</button>
                        <button type="button" className="btn small" onClick={() => setConfirmDeleteId(null)} disabled={ocupadoId === f.id}>No</button>
                      </div>
                    ) : (
                      <>
                        <button type="button" className="icon-action-btn edit" onClick={() => setEditor({ fila: f })} title="Editar"><IconEdit size={13} /></button>
                        <button type="button" className="icon-action-btn delete" onClick={() => setConfirmDeleteId(f.id)} title={n ? "En uso: desactívalo en lugar de eliminarlo" : "Eliminar"} disabled={!!n}><IconTrash size={13} /></button>
                      </>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="tes-maestros-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="tes-maestros-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{rows.length} registro(s)</span>
        </div>
      </section>

      {editor && cat && <EditorModal tipo={tab} fila={editor.fila} cat={cat} onClose={() => setEditor(null)} onSaved={(m) => { setEditor(null); setAviso(m); recargar(); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
