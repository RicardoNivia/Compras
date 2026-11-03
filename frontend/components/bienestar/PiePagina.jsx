"use client";

import { useEffect, useState } from "react";

export const PAGE_SIZES = [25, 50, 100];

// Paginación en el navegador, con el mismo formato de la tabla de Registros. clave: al cambiar (filtro, búsqueda) vuelve a
// la primera página.
export function usePagina(filas, clave = "") {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [clave, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  return { pageSize, setPageSize, setPage, totalPages, currentPage, pagina: filas.slice((currentPage - 1) * pageSize, currentPage * pageSize) };
}

export default function PiePagina({ id, p, total, etiqueta }) {
  return (
    <div className="table-footer">
      <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <label htmlFor={id} style={{ marginBottom: 0 }}>Tamaño</label>
        <select id={id} value={p.pageSize} onChange={(e) => p.setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="page-btns">
        <button type="button" className="btn small" disabled={p.currentPage <= 1} onClick={() => p.setPage(p.currentPage - 1)}>Anterior</button>
        <button type="button" className="btn small" disabled={p.currentPage >= p.totalPages} onClick={() => p.setPage(p.currentPage + 1)}>Siguiente</button>
      </div>
      <span className="count-note">Página {p.currentPage} de {p.totalPages}</span>
      <div className="spacer" />
      <span className="count-note">{total} {etiqueta}</span>
    </div>
  );
}
