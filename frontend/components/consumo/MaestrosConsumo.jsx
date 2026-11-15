"use client";

import { useEffect, useMemo, useState } from "react";
import { conCrearMaestro, conEditarMaestro, conBorrarMaestro } from "@/lib/consumoApi";
import { coincide } from "@/lib/buscar";
import { useConfirmar } from "@/components/Confirmar";
import BotonExcel from "@/components/BotonExcel";
import { IconSearch, IconPlus, IconEdit, IconTrash, IconBuilding } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, PuntoServicio, EtiquetaServicio, useCatalogosConsumo, Aviso, Modal, Interruptor } from "@/components/consumo/comun";

// Maestros de Consumo con el mismo diseño que los de Compras, Bienestar y Tesorería: menú a la izquierda, buscador,
// «Crear nuevo», tabla con En uso / Activo / acciones y paginación. Las sedes y sus cuentas tienen su propia página.
const PAGE_SIZES = [25, 50, 100];
const listaServicios = (e) => String(e.servicios || "").split(",").filter((s) => SERVICIOS[s]);

function EmpresaModal({ empresa, onClose, onSaved }) {
  const [v, set] = useState(() => (empresa ? { nombre: empresa.nombre, nit: empresa.nit || "", servicios: listaServicios(empresa), activo: empresa.activo } : { nombre: "", nit: "", servicios: [], activo: true }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const alternar = (s) => set({ ...v, servicios: v.servicios.includes(s) ? v.servicios.filter((x) => x !== s) : [...v.servicios, s] });
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError("");
    try {
      if (empresa) await conEditarMaestro("empresa", empresa.id, v); else await conCrearMaestro("empresa", v);
      onSaved(empresa ? "Cambios guardados." : "Empresa creada.");
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }
  return (
    <Modal titulo={empresa ? "Editar empresa de servicio" : "Nueva empresa de servicio"} sub="La empresa que emite el recibo (Enel, Acueducto, Vanti…)." ancho={560} onClose={onClose} onSubmit={guardar}
      pie={<><div className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={guardando || !v.nombre.trim()}>{guardando ? <span className="spinner" /> : null} Guardar</button></>}>
      <div className="field full"><label htmlFor="ce-nombre">Nombre</label><input id="ce-nombre" value={v.nombre} maxLength={120} autoFocus onChange={(e) => set({ ...v, nombre: e.target.value })} /></div>
      <div className="field full"><label htmlFor="ce-nit">NIT (opcional)</label><input id="ce-nit" value={v.nit} maxLength={30} onChange={(e) => set({ ...v, nit: e.target.value })} /></div>
      <div className="field full">
        <label id="ce-servicios-l">Servicios que factura</label>
        <div className="con-opciones" role="group" aria-labelledby="ce-servicios-l">
          {ORDEN_SERVICIOS.map((s) => (
            <button key={s} type="button" aria-pressed={v.servicios.includes(s)} className={`con-opcion${v.servicios.includes(s) ? " activa" : ""}`} onClick={() => alternar(s)}><PuntoServicio servicio={s} />{SERVICIOS[s].corto}</button>
          ))}
        </div>
      </div>
      {empresa && <div className="field full"><Interruptor id="ce-activo" texto="Empresa activa" ayuda="Inactiva deja de ofrecerse al crear cuentas; las que ya la usan la conservan." checked={v.activo} onChange={(x) => set({ ...v, activo: x })} /></div>}
      {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
    </Modal>
  );
}

export default function MaestrosConsumo({ acceso }) {
  const { cat, error: errorCat, recargar } = useCatalogosConsumo();
  const { confirmar } = useConfirmar();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [editor, setEditor] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const puede = !!acceso?.puedeAdministrar;
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const rows = useMemo(() => (cat?.empresas || []).filter((e) => coincide(search, e.nombre, e.nit, ...listaServicios(e).map((s) => SERVICIOS[s].nombre))), [cat, search]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function toggleActivo(f) {
    setOcupadoId(f.id); setError("");
    try { await conEditarMaestro("empresa", f.id, { activo: !f.activo }); await recargar(); } catch (e) { setError(e.message); } finally { setOcupadoId(null); }
  }
  async function borrar(f) {
    if (!(await confirmar({ titulo: "Eliminar la empresa", mensaje: `Se elimina «${f.nombre}» de las empresas de servicio.`, detalle: "Ninguna cuenta la usa. No se puede deshacer.", boton: "Sí, eliminar", peligro: true }))) return;
    setOcupadoId(f.id); setError("");
    try { await conBorrarMaestro("empresa", f.id); setAviso("Empresa eliminada."); await recargar(); } catch (e) { setError(e.message); } finally { setOcupadoId(null); }
  }

  return (
    <div className="maestros-shell">
      <aside className="maestros-nav">
        <div className="maestros-nav-group">
          <div className="maestros-nav-head">Maestros de Consumo</div>
          <nav aria-label="Maestros de Consumo">
            <button type="button" className="maestros-nav-item active"><span className="ic"><IconBuilding size={16} /></span>Empresas de servicio</button>
          </nav>
        </div>
        <p className="maestros-nav-nota">
          {puede ? "Una empresa en uso no se borra: se desactiva. Las sedes, sus cuentas y sus medidores se administran en Consumo › Sedes y cuentas." : "Solo quien puede administrar Consumo edita los maestros."}
        </p>
      </aside>

      <section className="maestros-main">
        <div className="maestros-toolbar">
          <div className="maestros-search-wrap">
            <input type="search" placeholder="Buscar por nombre, NIT o servicio" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
            <span className="ic"><IconSearch size={14} /></span>
          </div>
          <div className="spacer" />
          {puede && <button type="button" className="btn btn-primary" onClick={() => setEditor({ empresa: null })} disabled={!cat}><IconPlus size={13} /> Crear nueva</button>}
        </div>
        {(error || errorCat) && <div className="modal-error" style={{ marginBottom: 10 }}>{error || errorCat}</div>}

        <table className="maestros-table">
          <thead>
            <tr><th>Empresa</th><th>NIT</th><th>Servicios</th><th className="col-uso">En uso</th><th className="col-activo">Activa</th><th className="col-acciones"></th></tr>
          </thead>
          <tbody>
            {!cat && Array.from({ length: 4 }).map((_, i) => <tr key={`esq-${i}`} aria-hidden="true"><td colSpan={6}><div className="skeleton-bar" style={{ height: 22, borderRadius: 8 }} /></td></tr>)}
            {cat && pageRows.length === 0 && <tr><td colSpan={6}><div className="empty">No hay empresas que coincidan.</div></td></tr>}
            {pageRows.map((f) => (
              <tr key={f.id}>
                <td className="truncate"><span className="desc-tooltip-wrap"><span className="desc-text">{f.nombre}</span><span className="desc-tooltip-bubble">{f.nombre}{f.creadoPorNombre ? ` · creada por ${f.creadoPorNombre}` : ""}</span></span></td>
                <td style={{ whiteSpace: "nowrap" }}>{f.nit || <span className="muted">—</span>}</td>
                <td><span className="con-servicios-fila">{listaServicios(f).length ? listaServicios(f).map((s) => <EtiquetaServicio key={s} servicio={s} corto />) : <span className="muted">—</span>}</span></td>
                <td>{f.cuentas ? <span className="pill accent" title={`${f.cuentas} cuenta(s) la usan: no se puede eliminar, solo desactivar.`}>{f.cuentas.toLocaleString("es-CO")} cuenta(s)</span> : <span className="pill good" title="Sin uso: se puede eliminar">Libre</span>}</td>
                <td>
                  <label className="toggle-switch" title={f.activo ? "Inactivar" : "Activar"}>
                    <input type="checkbox" checked={f.activo} onChange={() => toggleActivo(f)} disabled={!puede || ocupadoId === f.id} aria-label={`${f.activo ? "Inactivar" : "Activar"} ${f.nombre}`} />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                  </label>
                </td>
                <td className="acciones">
                  {puede && (
                    <>
                      <button type="button" className="icon-action-btn edit" onClick={() => setEditor({ empresa: f })} title="Editar" aria-label={`Editar ${f.nombre}`}><IconEdit size={13} /></button>
                      <button type="button" className="icon-action-btn delete" onClick={() => borrar(f)} title={f.cuentas ? "En uso: desactívala en lugar de eliminarla" : "Eliminar"} aria-label={`Eliminar ${f.nombre}`} disabled={!!f.cuentas || ocupadoId === f.id}><IconTrash size={13} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="con-maestros-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="con-maestros-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <BotonExcel nombre="consumo-empresas-de-servicio" hoja="Empresas" filas={rows} deshabilitado={!rows.length} columnas={[
            { t: "Empresa", v: (f) => f.nombre }, { t: "NIT", v: (f) => f.nit }, { t: "Servicios", v: (f) => listaServicios(f).map((s) => SERVICIOS[s].nombre).join(", ") },
            { t: "Cuentas que la usan", v: (f) => f.cuentas || 0 }, { t: "Activa", v: (f) => (f.activo ? "Sí" : "No") }, { t: "Creada por", v: (f) => f.creadoPorNombre },
          ]} />
          <span className="count-note">{rows.length} registro(s)</span>
        </div>
      </section>

      {editor && <EmpresaModal empresa={editor.empresa} onClose={() => setEditor(null)} onSaved={(m) => { setEditor(null); setAviso(m); recargar(); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
