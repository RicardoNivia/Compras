"use client";

import { useEffect, useMemo, useState } from "react";
import MaestroModal from "@/components/MaestroModal";
import ConfigCicloProveedores from "@/components/proveedores/ConfigCicloProveedores";
import ConfigSalarioMinimo from "@/components/ConfigSalarioMinimo";
import { TIPOS_MAESTRO, TIPO_LABELS, MODULO_POR_TIPO, TIPOS_USUARIO, TIPOS_FIJOS } from "@/lib/maestrosTipos";
import { updateMaestroApi, deleteMaestroApi } from "@/lib/api";
import { IconPlus, IconEdit, IconTrash, IconSearch, IconBuilding, IconUsers, IconFlag, IconMoney, IconFile, IconLayers, IconStar, IconClock } from "@/components/icons";
import { crossfade } from "@/lib/crossfade";

// Maestros de Compras y de Proveedores en una sola sección, agrupados por módulo.
// El Ciclo de proveedores (fecha de corte) vive aquí, dentro del grupo Proveedores.
// Un valor EN USO (en cualquiera de los dos módulos) no se puede renombrar ni
// eliminar; sí se puede inactivar para que deje de ofrecerse en los formularios.

const CICLO = "cicloProveedores";
const SALARIO = "salarioMinimo"; // salario mínimo por año, dentro del grupo Compras
const MODULOS = ["Compras", "Proveedores", "Bienestar"];

const TIPO_ICONS = {
  area: IconBuilding,
  responsable: IconUsers,
  estado: IconFlag,
  categoria: IconLayers,
  medioPago: IconMoney,
  estadoLegalizacion: IconFile,
  causaCalificacion: IconStar,
  areaProveedor: IconBuilding,
  tipoProveedor: IconFlag,
  clasificacionMonto: IconMoney,
  tipoServicio: IconLayers,
  motivoExcepcion: IconFile,
  responsableBienestar: IconUsers,
  areaParticipante: IconBuilding,
  motivoInasistencia: IconFile,
  unidadInventario: IconLayers,
  escalaCalificacion: IconStar,
};

const COLUMN_LABELS = {
  area: "Nombre del área",
  responsable: "Nombre del responsable",
  estado: "Nombre del estado",
  categoria: "Nombre de la categoría",
  medioPago: "Nombre del medio de pago",
  estadoLegalizacion: "Nombre del estado de legalización",
  causaCalificacion: "Causa de calificación",
  areaProveedor: "Área de proveedor",
  tipoProveedor: "Tipo de proveedor",
  clasificacionMonto: "Clasificación por monto",
  tipoServicio: "Tipo de servicio",
  motivoExcepcion: "Motivo de excepción",
  responsableBienestar: "Responsable de actividades",
  areaParticipante: "Área",
  motivoInasistencia: "Motivo de inasistencia",
  unidadInventario: "Unidad",
  escalaCalificacion: "Nombre de la calificación",
};

const PAGE_SIZES = [25, 50, 100];

function enUsoTitle(m) {
  const donde = m.usadoEn?.length ? m.usadoEn.join(" y ") : "registros existentes";
  return `No se puede editar ni eliminar: está en uso en ${donde}. Puedes inactivarlo para que deje de ofrecerse en los formularios.`;
}

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <label className="toggle-switch" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

// modulos: { Compras: bool, Proveedores: bool } — qué grupos puede administrar el usuario.
export default function MaestrosView({ initialMaestros, modulos = { Compras: true, Proveedores: false }, cicloConfig = null, initialSeccion = null }) {
  const [maestros, setMaestros] = useState(initialMaestros || []);
  // useState solo toma el valor inicial en el primer montaje: si el usuario
  // navega a esta página por el menú lateral (navegación cliente, sin recarga
  // completa), React reutiliza la instancia del componente y nunca vuelve a
  // leer initialMaestros, aunque el servidor ya tenga datos distintos (p.ej.
  // justo después de una migración de datos) — por eso se resincroniza acá.
  useEffect(() => {
    setMaestros(initialMaestros || []);
  }, [initialMaestros]);

  const grupos = useMemo(() => MODULOS.filter((mod) => modulos[mod]).map((mod) => ({
    modulo: mod,
    tipos: TIPOS_MAESTRO.filter((t) => MODULO_POR_TIPO[t] === mod),
    ciclo: mod === "Proveedores" && !!cicloConfig,
    salario: mod === "Compras",
  })), [modulos, cicloConfig]);
  const seccionesValidas = grupos.flatMap((g) => [...g.tipos, ...(g.salario ? [SALARIO] : []), ...(g.ciclo ? [CICLO] : [])]);

  const [tab, setTab] = useState(() => (initialSeccion && seccionesValidas.includes(initialSeccion) ? initialSeccion : seccionesValidas[0]));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = crear, objeto = editar
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
    setError("");
  }, [tab, search, pageSize]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return maestros
      .filter((m) => m.tipo === tab)
      .filter((m) => !q || m.valor.toLowerCase().includes(q))
      .sort((a, b) => (tab === "escalaCalificacion" ? a.aplicaEstrellas - b.aplicaEstrellas : a.valor.localeCompare(b.valor, "es")));
  }, [maestros, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditing(m);
    setModalOpen(true);
  }

  function handleSaved(saved) {
    setMaestros((prev) => {
      const exists = prev.some((m) => m.id === saved.id);
      return exists ? prev.map((m) => (m.id === saved.id ? saved : m)) : [...prev, saved];
    });
    setModalOpen(false);
  }

  async function toggleActivo(m) {
    if (togglingId) return;
    setError("");
    setTogglingId(m.id);
    const next = !m.activo;
    setMaestros((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: next } : x)));
    try {
      await updateMaestroApi(m.id, { activo: next });
    } catch (err) {
      setMaestros((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: m.activo } : x)));
      setError(err.message || "No se pudo actualizar el estado.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    setError("");
    try {
      await deleteMaestroApi(id);
      setMaestros((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err.message || "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const esCiclo = tab === CICLO;
  const conEstrellas = tab === "causaCalificacion" || tab === "escalaCalificacion";
  const colSpan = conEstrellas ? 5 : 4;
  const esFijo = TIPOS_FIJOS.includes(tab);

  return (
    <div className="maestros-shell">
      <aside className="maestros-nav">
        {grupos.map((g) => (
          <div key={g.modulo} className="maestros-nav-group">
            <div className="maestros-nav-head">Maestros de {g.modulo}</div>
            <nav aria-label={`Maestros de ${g.modulo}`}>
              {g.tipos.map((t) => {
                const Icon = TIPO_ICONS[t] || IconLayers;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`maestros-nav-item${tab === t ? " active" : ""}`}
                    onClick={() => crossfade(() => setTab(t))}
                  >
                    <span className="ic"><Icon size={16} /></span>
                    {TIPO_LABELS[t]}
                  </button>
                );
              })}
              {g.salario && (
                <button
                  type="button"
                  className={`maestros-nav-item${tab === SALARIO ? " active" : ""}`}
                  onClick={() => crossfade(() => setTab(SALARIO))}
                >
                  <span className="ic"><IconMoney size={16} /></span>
                  Salario mínimo
                </button>
              )}
              {g.ciclo && (
                <button
                  type="button"
                  className={`maestros-nav-item${esCiclo ? " active" : ""}`}
                  onClick={() => crossfade(() => setTab(CICLO))}
                >
                  <span className="ic"><IconClock size={16} /></span>
                  Ciclo de proveedores
                </button>
              )}
            </nav>
          </div>
        ))}
        {modulos.Bienestar && (
          <p className="maestros-nav-nota">
            Los estados de una actividad y las líneas Bienestar y Fundación son fijos: de ellos dependen reglas como no recibir compras al cerrar o las páginas de cada línea.
          </p>
        )}
      </aside>

      <section className="maestros-main">
        {esCiclo ? (
          <ConfigCicloProveedores initial={cicloConfig} />
        ) : tab === SALARIO ? (
          <ConfigSalarioMinimo />
        ) : (
          <>
            <div className="maestros-toolbar">
              <div className="maestros-search-wrap">
                <input
                  type="search" placeholder="Buscar por nombre"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar"
                />
                <span className="ic"><IconSearch size={14} /></span>
              </div>
              <div className="spacer" />
              {!esFijo && (
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <IconPlus size={13} /> Crear nuevo
                </button>
              )}
            </div>

            {esFijo && <p className="card-sub" style={{ margin: "0 0 10px" }}>La escala siempre va de 1 a 5 estrellas: aquí solo se cambia cómo se llama cada puntaje.</p>}
            {tab === "responsableBienestar" && <p className="card-sub" style={{ margin: "0 0 10px" }}>Solo estas personas se pueden elegir como responsables de una actividad de Bienestar o Fundación.</p>}
            {error && <div className="modal-error" style={{ marginBottom: 10 }}>{error}</div>}

            <table className="maestros-table">
              <thead>
                <tr>
                  <th>{COLUMN_LABELS[tab]}</th>
                  {conEstrellas && <th className="col-estrellas">{tab === "causaCalificacion" ? "Aplica a estrellas" : "Estrellas"}</th>}
                  <th className="col-uso">En uso</th>
                  <th className="col-activo">Activo</th>
                  <th className="col-acciones"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={colSpan}>
                      <div className="empty">No hay opciones de {(TIPO_LABELS[tab] || "").toLowerCase()} que coincidan.</div>
                    </td>
                  </tr>
                )}
                {pageRows.map((m) => {
                  const locked = m.enUso;
                  const confirming = confirmDeleteId === m.id;
                  return (
                    <tr key={m.id}>
                      <td className="truncate">
                        <span className="desc-tooltip-wrap">
                          <span className="desc-text">{m.valor}</span>
                          <span className="desc-tooltip-bubble">{m.valor}</span>
                        </span>
                      </td>
                      {conEstrellas && <td>{"★".repeat(m.aplicaEstrellas || 0)}</td>}
                      <td>{m.enUso ? <span className="pill accent" title={enUsoTitle(m)}>{m.usadoEn?.join(" · ") || "Sí"}</span> : <span className="pill good" title="Sin uso: se puede editar o eliminar">Libre</span>}</td>
                      <td>
                        <ToggleSwitch
                          checked={m.activo}
                          onChange={() => toggleActivo(m)}
                          disabled={togglingId === m.id || esFijo}
                          title={m.activo ? "Inactivar" : "Activar"}
                        />
                      </td>
                      <td className="acciones">
                        {confirming ? (
                          <div className="confirm-del">
                            <span>¿Eliminar?</span>
                            <button
                              type="button" className="btn btn-danger-solid small"
                              onClick={() => handleDelete(m.id)} disabled={deletingId === m.id}
                            >
                              {deletingId === m.id ? <span className="spinner" /> : "Sí"}
                            </button>
                            <button type="button" className="btn small" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === m.id}>No</button>
                          </div>
                        ) : (
                          <>
                            {!TIPOS_USUARIO.includes(tab) && (
                              <button
                                type="button"
                                className="icon-action-btn edit"
                                onClick={() => openEdit(m)}
                                title={locked ? enUsoTitle(m) : "Editar"}
                                disabled={locked}
                              >
                                <IconEdit size={13} />
                              </button>
                            )}
                            {!esFijo && (
                              <button
                                type="button"
                                className="icon-action-btn delete"
                                onClick={() => setConfirmDeleteId(m.id)}
                                title={locked ? enUsoTitle(m) : "Eliminar"}
                                disabled={locked}
                              >
                                <IconTrash size={13} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="table-footer">
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <label htmlFor="maestros-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
                <select id="maestros-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="page-btns">
                <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
              </div>
              <span className="count-note">Página {currentPage} de {totalPages}</span>
              <div className="spacer" />
              <span className="count-note">{rows.length} registro(s)</span>
            </div>
          </>
        )}
      </section>

      {modalOpen && !esCiclo && (
        <MaestroModal
          tipo={tab}
          maestro={editing}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
