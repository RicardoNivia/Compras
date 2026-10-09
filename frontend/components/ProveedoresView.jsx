"use client";

import { useEffect, useMemo, useState } from "react";
import ProveedorModal from "@/components/ProveedorModal";
import { updateProveedorApi, deleteProveedorApi } from "@/lib/api";
import { IconPlus, IconEdit, IconTrash, IconSearch } from "@/components/icons";

const EN_USO_TITLE = "No se puede editar ni eliminar: este proveedor ya está en uso en uno o más registros. Puedes inactivarlo para que deje de ofrecerse en el autocompletar.";

const PAGE_SIZE = 8;

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <label className="toggle-switch" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

export default function ProveedoresView({ initialProveedores }) {
  const [proveedores, setProveedores] = useState(initialProveedores || []);
  // Resincroniza si el servidor manda datos nuevos tras una navegación
  // cliente (ver el mismo comentario en MaestrosView.jsx).
  useEffect(() => {
    setProveedores(initialProveedores || []);
  }, [initialProveedores]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = crear, objeto = editar
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [togglingDocId, setTogglingDocId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [search]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return proveedores
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || (qDigits && p.nit.includes(qDigits)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [proveedores, search]);

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

  function openEdit(p) {
    setEditing(p);
    setModalOpen(true);
  }

  function handleSaved(saved) {
    setProveedores((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    setModalOpen(false);
  }

  async function toggleActivo(p) {
    if (togglingId) return;
    setError("");
    setTogglingId(p.id);
    const next = !p.activo;
    setProveedores((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: next } : x)));
    try {
      await updateProveedorApi(p.id, { activo: next });
    } catch (err) {
      setProveedores((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: p.activo } : x)));
      setError(err.message || "No se pudo actualizar el estado.");
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleDocumentacion(p) {
    if (togglingDocId) return;
    setError("");
    setTogglingDocId(p.id);
    const next = !p.documentacionAlDia;
    setProveedores((prev) => prev.map((x) => (x.id === p.id ? { ...x, documentacionAlDia: next } : x)));
    try {
      await updateProveedorApi(p.id, { documentacionAlDia: next });
    } catch (err) {
      setProveedores((prev) => prev.map((x) => (x.id === p.id ? { ...x, documentacionAlDia: p.documentacionAlDia } : x)));
      setError(err.message || "No se pudo actualizar la documentación.");
    } finally {
      setTogglingDocId(null);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    setError("");
    try {
      await deleteProveedorApi(id);
      setProveedores((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message || "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="maestros-main" style={{ width: "100%" }}>
      <div className="maestros-toolbar">
        <div className="maestros-search-wrap">
          <input
            type="search" placeholder="Buscar por nombre o nit"
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
            <th>Nombre</th>
            <th>Nit</th>
            <th>Teléfono</th>
            <th>Correo</th>
            <th className="col-activo">Doc. al día</th>
            <th className="col-activo">Activo</th>
            <th className="col-acciones"></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={7}>
                <div className="empty">No hay proveedores que coincidan.</div>
              </td>
            </tr>
          )}
          {pageRows.map((p) => {
            const locked = p.enUso;
            const confirming = confirmDeleteId === p.id;
            return (
              <tr key={p.id}>
                <td title={p.descripcion}>{p.nombre}</td>
                <td>{p.nit}</td>
                <td>{p.telefono || "—"}</td>
                <td>{p.correo || "—"}</td>
                <td>
                  <ToggleSwitch
                    checked={p.documentacionAlDia}
                    onChange={() => toggleDocumentacion(p)}
                    disabled={togglingDocId === p.id}
                    title={p.documentacionAlDia ? "Documentación al día" : "Documentación pendiente"}
                  />
                </td>
                <td>
                  <ToggleSwitch
                    checked={p.activo}
                    onChange={() => toggleActivo(p)}
                    disabled={togglingId === p.id}
                    title={p.activo ? "Inactivar" : "Activar"}
                  />
                </td>
                <td className="acciones">
                  {confirming ? (
                    <div className="confirm-del">
                      <span>¿Eliminar?</span>
                      <button
                        type="button" className="btn btn-danger-solid small"
                        onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}
                      >
                        {deletingId === p.id ? <span className="spinner" /> : "Sí"}
                      </button>
                      <button type="button" className="btn small" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === p.id}>No</button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="icon-action-btn edit"
                        onClick={() => openEdit(p)}
                        title={locked ? EN_USO_TITLE : "Editar"}
                        disabled={locked}
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        onClick={() => setConfirmDeleteId(p.id)}
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

      <div className="maestros-pagination">
        {totalPages > 1 && (
          <>
            <button
              type="button" className="maestros-page-btn"
              disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              ‹
            </button>
            <span className="maestros-page-num">Página {currentPage} de {totalPages}</span>
            <button
              type="button" className="maestros-page-btn"
              disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              ›
            </button>
          </>
        )}
        <span className="count-note">{rows.length} registro(s)</span>
      </div>

      {modalOpen && (
        <ProveedorModal
          proveedor={editing}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
