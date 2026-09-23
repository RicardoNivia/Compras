"use client";

import { useEffect, useMemo, useState } from "react";
import MaestroModal from "@/components/MaestroModal";
import { TIPOS_MAESTRO, TIPO_LABELS } from "@/lib/maestrosTipos";
import { updateMaestroApi, deleteMaestroApi } from "@/lib/api";
import { IconPlus, IconEdit, IconTrash, IconSearch, IconBuilding, IconUsers, IconFlag, IconMoney, IconFile } from "@/components/icons";

const EN_USO_TITLE = "No se puede editar ni eliminar: este valor ya está en uso en uno o más registros. Puedes inactivarlo para que deje de ofrecerse en el formulario.";

const TIPO_ICONS = {
  area: IconBuilding,
  responsable: IconUsers,
  estado: IconFlag,
  medioPago: IconMoney,
  estadoLegalizacion: IconFile,
};

const COLUMN_LABELS = {
  area: "Nombre del área",
  responsable: "Nombre del responsable",
  estado: "Nombre del estado",
  medioPago: "Nombre del medio de pago",
  estadoLegalizacion: "Nombre del estado de legalización",
};

const PAGE_SIZE = 8;

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <label className="toggle-switch" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

export default function MaestrosView({ initialMaestros }) {
  const [maestros, setMaestros] = useState(initialMaestros || []);
  const [tab, setTab] = useState(TIPOS_MAESTRO[0]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = crear, objeto = editar
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return maestros
      .filter((m) => m.tipo === tab)
      .filter((m) => !q || m.valor.toLowerCase().includes(q))
      .sort((a, b) => a.valor.localeCompare(b.valor, "es"));
  }, [maestros, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

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

  return (
    <div className="maestros-shell">
      <aside className="maestros-nav">
        <div className="maestros-nav-head">Configuraciones del formulario<br />del libro de obra</div>
        <nav>
          {TIPOS_MAESTRO.map((t) => {
            const Icon = TIPO_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                className={`maestros-nav-item${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                <span className="ic"><Icon size={16} /></span>
                {TIPO_LABELS[t]}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="maestros-main">
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
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <IconPlus size={13} /> Crear nuevo
          </button>
        </div>

        {error && <div className="modal-error" style={{ marginBottom: 10 }}>{error}</div>}

        <table className="maestros-table">
          <thead>
            <tr>
              <th>{COLUMN_LABELS[tab]}</th>
              <th className="col-activo">Activo</th>
              <th className="col-acciones"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty">No hay opciones de {TIPO_LABELS[tab].toLowerCase()} que coincidan.</div>
                </td>
              </tr>
            )}
            {pageRows.map((m) => {
              const locked = m.enUso;
              const confirming = confirmDeleteId === m.id;
              return (
                <tr key={m.id}>
                  <td>{m.valor}</td>
                  <td>
                    <ToggleSwitch
                      checked={m.activo}
                      onChange={() => toggleActivo(m)}
                      disabled={togglingId === m.id}
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
                        <button
                          type="button"
                          className="icon-action-btn edit"
                          onClick={() => openEdit(m)}
                          title={locked ? EN_USO_TITLE : "Editar"}
                          disabled={locked}
                        >
                          <IconEdit size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn delete"
                          onClick={() => setConfirmDeleteId(m.id)}
                          title={locked ? EN_USO_TITLE : "Eliminar"}
                          disabled={locked}
                        >
                          <IconTrash size={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="maestros-pagination">
            <button
              type="button" className="maestros-page-btn"
              disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              ‹
            </button>
            <span className="maestros-page-num">{currentPage}</span>
            <button
              type="button" className="maestros-page-btn"
              disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              ›
            </button>
          </div>
        )}
      </section>

      {modalOpen && (
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
