"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import RecordModal from "@/components/RecordModal";
import RatingModal from "@/components/RatingModal";
import ValoracionModal from "@/components/ValoracionModal";
import ValoracionPuntaje from "@/components/ValoracionPuntaje";
import { TimelineButton } from "@/components/RecordTimelineModal";
import { fmtCOP } from "@/lib/format";
import { getDiasInfo } from "@/lib/diasInfo";
import { patchRecordApi, deleteRecordApi, searchFiltersWithAiApi } from "@/lib/api";
import { canCreateRecord, canEditRecord, canDeleteRecord, canToggleRadicado, getEditableFields, canViewAgentesCompras } from "@/lib/roles";
import { IconPlus, IconEdit, IconTrash, IconCheck, IconAlert, IconSpark, IconSearch, IconStar } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";

const PAGE_SIZES = [25, 50, 100, 250];

const COLUMNS = [
  { key: "localSeq", label: "#" },
  { key: "fechaSolicitud", label: "F. solicitud" },
  { key: "fechaEntrega", label: "F. entrega" },
  { key: "dias", label: "Días" },
  { key: "area", label: "Área" },
  { key: "responsable", label: "Responsable" },
  { key: "estado", label: "Estado de compra" },
  { key: "categoria", label: "Categoría" },
  { key: "descripcion", label: "Descripción" },
  { key: "medioPago", label: "Medio de pago" },
  { key: "licitacion", label: "Licitación" },
  { key: "estadoLegalizacion", label: "Estado legaliz." },
  { key: "nit", label: "Nit" },
  { key: "proveedor", label: "Proveedor" },
  { key: "fe", label: "FE" },
  { key: "valorConIva", label: "Valor + IVA" },
  { key: "valorSinIva", label: "Valor sin IVA" },
  { key: "valorCot", label: "Valor Cot." },
  { key: "observaciones", label: "Observaciones" },
  { key: "valoracion", label: "Valoración Nova" },
];

function estadoPillClass(estado) {
  if (estado === "Ejecutado") return "good";
  if (estado === "Proceso") return "warning";
  if (estado === "Anulado") return "critical";
  return "muted";
}

function legalizacionPillClass(v) {
  if (v === "Legalizado") return "good";
  if (v === "Pendiente") return "warning";
  if (v === "Rechazado") return "critical";
  return "muted";
}

function uniqueSorted(records, field) {
  const set = new Set();
  for (const r of records) {
    if (r[field]) set.add(r[field]);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function sortValue(r, key) {
  if (key === "dias") return getDiasInfo(r).dias ?? -Infinity;
  if (key === "valoracion") return r.valoracion?.puntajeCompra ?? -1;
  const v = r[key];
  if (v === null || v === undefined) return "";
  return v;
}

export default function RegistrosView({ records, setRecords, onFilteredChange, currentUser, maestros, proveedores = [], alertasProveedores = {}, presupuestos = [], actividades = [], nuevaCompraActividad = null }) {
  const role = currentUser?.role;
  const permissions = currentUser?.permissions;
  const allowCreate = permissions?.createRecord ?? canCreateRecord(role);
  const allowEdit = permissions?.editRecord ?? canEditRecord(role);
  const allowDelete = permissions?.deleteRecord ?? canDeleteRecord(role);
  const allowToggle = permissions?.toggleRadicado ?? canToggleRadicado(role);
  const editableFields = getEditableFields(role);
  const hasRowActions = allowToggle || allowEdit || allowDelete;

  // Llega como "/registros?q=%23123" desde el botón "Ir" de Alertas y
  // notificaciones (ver AlertasView.jsx) — precarga la búsqueda manual con el
  // número de registro (#123) para llegar directo a esa fila, reutilizando el
  // mismo buscador de texto libre en vez de un mecanismo de filtro aparte.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearch(q);
      router.replace(pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [licitacion, setLicitacion] = useState("");
  const [estadoLegalizacion, setEstadoLegalizacion] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [onlyIncumplimiento, setOnlyIncumplimiento] = useState(false);
  // Radicado ("si" | "no") y valoración de Nova ("con" | "sin") + puntaje máximo (de la compra / del proveedor).
  const [radicadoFiltro, setRadicadoFiltro] = useState("");
  const [valoracionFiltro, setValoracionFiltro] = useState("");
  const [puntajeCompraMax, setPuntajeCompraMax] = useState("");
  const [puntajeProveedorMax, setPuntajeProveedorMax] = useState("");

  // Modo de búsqueda: "manual" (filtros de siempre) o "ia" (lenguaje natural,
  // traducido a esos mismos filtros — un solo motor de filtrado para ambos).
  const [searchMode, setSearchMode] = useState("manual");
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(null); // resumen de lo último que aplicó la IA

  const [sortKey, setSortKey] = useState("fechaSolicitud");
  const [sortDir, setSortDir] = useState("desc");

  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [modalRecord, setModalRecord] = useState(undefined); // undefined = closed, null = new
  // "Solicitar compra para esta actividad" (Bienestar) llega con ?nuevaCompraActividad=<id>: abre el formulario nuevo
  // con esa actividad ya elegida.
  const [prefillCompra, setPrefillCompra] = useState(null);
  useEffect(() => {
    if (nuevaCompraActividad && allowCreate) {
      setPrefillCompra({ actividadId: nuevaCompraActividad });
      setModalRecord(null);
    }
  }, [nuevaCompraActividad, allowCreate]);
  const [ratingRecord, setRatingRecord] = useState(null);
  // Valoración de Nova: { record, auto } — auto=true se abre al radicar y genera la valoración de una vez.
  const [valoracionModal, setValoracionModal] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmRadicado, setConfirmRadicado] = useState(null); // registro pendiente de confirmar

  const areaOptions = useMemo(() => uniqueSorted(records, "area"), [records]);
  const estadoOptions = useMemo(() => uniqueSorted(records, "estado"), [records]);
  const medioOptions = useMemo(() => uniqueSorted(records, "medioPago"), [records]);
  const licitacionOptions = useMemo(() => uniqueSorted(records, "licitacion"), [records]);
  const estadoLegalizacionOptions = useMemo(() => uniqueSorted(records, "estadoLegalizacion"), [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q) {
        const hay = [
          r.localSeq ? `#${r.localSeq}` : "",
          r.fechaSolicitud,
          r.fechaEntrega,
          r.area,
          r.responsable,
          r.estado,
          r.categoria,
          r.descripcion,
          r.medioPago,
          r.licitacion,
          r.estadoLegalizacion,
          r.nit,
          r.proveedor,
          r.fe,
          r.valorConIva,
          r.valorSinIva,
          r.valorCot,
          r.observaciones,
        ]
          .filter((v) => v !== null && v !== undefined && v !== "")
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (area && r.area !== area) return false;
      if (estado && r.estado !== estado) return false;
      if (medioPago && r.medioPago !== medioPago) return false;
      if (licitacion && String(r.licitacion || "") !== licitacion) return false;
      if (estadoLegalizacion && r.estadoLegalizacion !== estadoLegalizacion) return false;
      if (dateFrom && (!r.fechaSolicitud || r.fechaSolicitud < dateFrom)) return false;
      if (dateTo && (!r.fechaSolicitud || r.fechaSolicitud > dateTo)) return false;
      if (valorMin !== "" && !(r.valorConIva >= Number(valorMin))) return false;
      if (valorMax !== "" && !(r.valorConIva <= Number(valorMax))) return false;
      if (onlyIncumplimiento && !((getDiasInfo(r).dias ?? 0) > 8)) return false;
      if (radicadoFiltro === "si" && !r.radicado) return false;
      if (radicadoFiltro === "no" && r.radicado) return false;
      if (valoracionFiltro === "con" && !r.valoracion) return false;
      if (valoracionFiltro === "sin" && r.valoracion) return false;
      if (puntajeCompraMax !== "" && !(r.valoracion && r.valoracion.puntajeCompra <= Number(puntajeCompraMax))) return false;
      if (puntajeProveedorMax !== "" && !(r.valoracion && r.valoracion.puntajeProveedor != null && r.valoracion.puntajeProveedor <= Number(puntajeProveedorMax))) return false;
      return true;
    });
  }, [records, search, area, estado, medioPago, licitacion, estadoLegalizacion, dateFrom, dateTo, valorMin, valorMax, onlyIncumplimiento, radicadoFiltro, valoracionFiltro, puntajeCompraMax, puntajeProveedorMax]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    onFilteredChange?.(sorted);
  }, [sorted, onFilteredChange]);

  useEffect(() => {
    setPage(1);
  }, [search, area, estado, medioPago, licitacion, dateFrom, dateTo, valorMin, valorMax, onlyIncumplimiento, radicadoFiltro, valoracionFiltro, puntajeCompraMax, puntajeProveedorMax, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setArea("");
    setEstado("");
    setMedioPago("");
    setLicitacion("");
    setEstadoLegalizacion("");
    setDateFrom("");
    setDateTo("");
    setValorMin("");
    setValorMax("");
    setOnlyIncumplimiento(false);
    setRadicadoFiltro("");
    setValoracionFiltro("");
    setPuntajeCompraMax("");
    setPuntajeProveedorMax("");
    setAiApplied(null);
    setAiError("");
    // Vuelve la tabla al orden con el que se abre la página.
    setSortKey("fechaSolicitud");
    setSortDir("desc");
  }

  // Traduce aiQuery a los mismos filtros de arriba (vía Anthropic, del lado
  // del servidor) y los aplica — el filtrado en sí sigue
  // siendo el mismo useMemo de siempre, no hay un motor de filtrado aparte.
  async function handleAiSearch() {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const { filters } = await searchFiltersWithAiApi(q, {
        areas: areaOptions,
        estados: estadoOptions,
        medios: medioOptions,
        licitaciones: licitacionOptions,
        estadosLegalizacion: estadoLegalizacionOptions,
      });
      setSearch(filters.search || "");
      setArea(filters.area || "");
      setEstado(filters.estado || "");
      setMedioPago(filters.medioPago || "");
      setLicitacion(filters.licitacion || "");
      setEstadoLegalizacion(filters.estadoLegalizacion || "");
      setDateFrom(filters.dateFrom || "");
      setDateTo(filters.dateTo || "");
      setValorMin(filters.valorMin != null ? String(filters.valorMin) : "");
      setValorMax(filters.valorMax != null ? String(filters.valorMax) : "");
      setOnlyIncumplimiento(!!filters.onlyIncumplimiento);
      setRadicadoFiltro(filters.radicado === "si" || filters.radicado === "no" ? filters.radicado : "");
      setValoracionFiltro(filters.valoracion === "con" || filters.valoracion === "sin" ? filters.valoracion : "");
      setPuntajeCompraMax(filters.puntajeCompraMax != null ? String(filters.puntajeCompraMax) : "");
      setPuntajeProveedorMax(filters.puntajeProveedorMax != null ? String(filters.puntajeProveedorMax) : "");
      setAiApplied(filters);
    } catch (err) {
      setAiError(err.message || "No se pudo interpretar la búsqueda.");
      setAiApplied(null);
    } finally {
      setAiLoading(false);
    }
  }

  // El radicado es de un solo sentido: una vez marcado no se puede desmarcar
  // (ni en la UI ni en el backend), así que solo se pide confirmar al marcar.
  function requestRadicado(r) {
    if (!allowToggle || togglingId || r.radicado) return;
    setConfirmRadicado(r);
  }

  async function confirmMarkRadicado() {
    const r = confirmRadicado;
    if (!r) return;
    setConfirmRadicado(null);
    setTogglingId(r.id);
    setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: true } : x)));
    let radicado = false;
    try {
      await patchRecordApi(r.id, { radicado: true });
      radicado = true;
    } catch {
      setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: false } : x)));
    } finally {
      setTogglingId(null);
    }
    // Al radicar se abre la valoración de Nova de la compra y del proveedor (se guarda sola).
    if (radicado) setValoracionModal({ record: { ...r, radicado: true }, auto: true });
  }

  function handleValoracion(recordId, v) {
    setRecords((prev) => prev.map((x) => (x.id === recordId ? { ...x, valoracion: { puntajeCompra: v.puntajeCompra, puntajeProveedor: v.puntajeProveedor } } : x)));
  }

  async function handleDelete(id) {
    if (!allowDelete) return;
    setDeletingId(id);
    try {
      await deleteRecordApi(id);
      setRecords((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function handleSaved(saved, isEdit) {
    setRecords((prev) => {
      if (isEdit) return prev.map((x) => (x.id === saved.id ? saved : x));
      return [...prev, saved];
    });
    setModalRecord(undefined);
  }

  function handleDeletedFromModal(id) {
    setRecords((prev) => prev.filter((x) => x.id !== id));
    setModalRecord(undefined);
  }

  function handleRated(recordId, calificacion) {
    setRecords((prev) => prev.map((x) => (x.id === recordId ? { ...x, calificacion: { estrellas: calificacion.estrellas } } : x)));
    setRatingRecord(null);
  }


  // Botones de la barra de filtros: en modo manual van al mismo nivel que los campos (sin salto de línea);
  // en modo Nova, en su propia fila.
  const accionesFiltro = (
    <>
      <button
        type="button"
        className={`btn${onlyIncumplimiento ? " btn-danger-solid" : ""}`}
        onClick={() => setOnlyIncumplimiento((v) => !v)}
        aria-pressed={onlyIncumplimiento}
        title="Solicitudes en proceso o entregadas con más de 8 días hábiles"
      >
        <IconAlert size={13} /> Incumplimiento (&gt;8 días)
      </button>
      <button type="button" className="btn" onClick={clearFilters}>Limpiar filtros</button>
      {allowCreate && (
        <button type="button" className="btn btn-primary filter-add" onClick={() => setModalRecord(null)}>
          <IconPlus size={13} /> Agregar registro
        </button>
      )}
    </>
  );
  return (
    <div>
      <div className="toolbar" id="registros-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="dash-tabs" role="tablist" aria-label="Modo de búsqueda" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" aria-selected={searchMode === "manual"} className="dash-tab" onClick={() => setSearchMode("manual")}>
            Filtros manuales
          </button>
          <button type="button" role="tab" aria-selected={searchMode === "ia"} className="dash-tab" onClick={() => setSearchMode("ia")}>
            <IconSpark size={13} /> Buscar con Nova
          </button>
        </div>

        {searchMode === "ia" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field search-field" style={{ flex: 1 }}>
                <label htmlFor="reg-ai-query">Describe qué buscas</label>
                <input
                  id="reg-ai-query" type="text"
                  placeholder="Ej. compras de infraestructura de más de 5 millones en julio…"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                  disabled={aiLoading}
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAiSearch} disabled={aiLoading || !aiQuery.trim()} style={{ alignSelf: "flex-end" }}>
                {aiLoading ? <span className="spinner" /> : <IconSearch size={13} />} {aiLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {aiError && <div className="modal-error"><IconAlert size={13} /> {aiError}</div>}
            {aiApplied && !aiError && (
              <div className="ai-applied-chips">
                <span className="chip">Entendí:</span>
                {aiApplied.area && <span className="chip">Área: {aiApplied.area}</span>}
                {aiApplied.estado && <span className="chip">Estado: {aiApplied.estado}</span>}
                {aiApplied.medioPago && <span className="chip">Medio de pago: {aiApplied.medioPago}</span>}
                {aiApplied.licitacion && <span className="chip">Licitación: {aiApplied.licitacion}</span>}
                {aiApplied.estadoLegalizacion && <span className="chip">Legalización: {aiApplied.estadoLegalizacion}</span>}
                {aiApplied.dateFrom && <span className="chip">Desde: {aiApplied.dateFrom}</span>}
                {aiApplied.dateTo && <span className="chip">Hasta: {aiApplied.dateTo}</span>}
                {aiApplied.valorMin != null && <span className="chip">Valor mín: {fmtCOP(aiApplied.valorMin)}</span>}
                {aiApplied.valorMax != null && <span className="chip">Valor máx: {fmtCOP(aiApplied.valorMax)}</span>}
                {aiApplied.search && <span className="chip">Texto: {aiApplied.search}</span>}
                {aiApplied.onlyIncumplimiento && <span className="chip">Solo incumplidas</span>}
                {aiApplied.radicado === "si" && <span className="chip">Radicadas</span>}
                {aiApplied.radicado === "no" && <span className="chip">Sin radicar</span>}
                {aiApplied.valoracion === "con" && <span className="chip">Con valoración de Nova</span>}
                {aiApplied.valoracion === "sin" && <span className="chip">Sin valoración de Nova</span>}
                {aiApplied.puntajeCompraMax != null && <span className="chip">Compra ≤ {aiApplied.puntajeCompraMax}★</span>}
                {aiApplied.puntajeProveedorMax != null && <span className="chip">Proveedor ≤ {aiApplied.puntajeProveedorMax}★</span>}
                <span className="count-note">{sorted.length} resultado(s)</span>
              </div>
            )}
          </div>
        ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div className="field search-field">
            <label htmlFor="reg-search">Buscar</label>
            <input
              id="reg-search" type="search" placeholder="Buscar en cualquier campo del registro…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reg-area">Área</label>
            <select id="reg-area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {areaOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-estado">Estado de compra</label>
            <select id="reg-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {estadoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-medio">Medio de pago</label>
            <select id="reg-medio" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
              <option value="">Todos</option>
              {medioOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-licitacion">Licitación</label>
            <select id="reg-licitacion" value={licitacion} onChange={(e) => setLicitacion(e.target.value)}>
              <option value="">Todas</option>
              {licitacionOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-estado-legal">Estado legalización</label>
            <select id="reg-estado-legal" value={estadoLegalizacion} onChange={(e) => setEstadoLegalizacion(e.target.value)}>
              <option value="">Todos</option>
              {estadoLegalizacionOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-radicado">Radicado</label>
            <select id="reg-radicado" value={radicadoFiltro} onChange={(e) => setRadicadoFiltro(e.target.value)}>
              <option value="">Todos</option>
              <option value="si">Radicados</option>
              <option value="no">Sin radicar</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-valoracion">Valoración Nova</label>
            <select id="reg-valoracion" value={valoracionFiltro} onChange={(e) => setValoracionFiltro(e.target.value)}>
              <option value="">Todas</option>
              <option value="con">Valoradas</option>
              <option value="sin">Sin valorar</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-puntaje-compra">Compra (máx. ★)</label>
            <select id="reg-puntaje-compra" value={puntajeCompraMax} onChange={(e) => setPuntajeCompraMax(e.target.value)}>
              <option value="">Cualquiera</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} o menos</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-puntaje-prov">Proveedor (máx. ★)</label>
            <select id="reg-puntaje-prov" value={puntajeProveedorMax} onChange={(e) => setPuntajeProveedorMax(e.target.value)}>
              <option value="">Cualquiera</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} o menos</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-from">Desde</label>
            <input id="reg-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reg-to">Hasta</label>
            <input id="reg-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reg-valor-min">Valor desde</label>
            <MoneyInput id="reg-valor-min" placeholder="Ej. 5.000.000" value={valorMin} onChange={setValorMin} />
          </div>
          <div className="field">
            <label htmlFor="reg-valor-max">Valor hasta</label>
            <MoneyInput id="reg-valor-max" placeholder="Ej. 20.000.000" value={valorMax} onChange={setValorMax} />
          </div>
          <div className="filter-actions">{accionesFiltro}</div>
        </div>
        )}
        {/* Con Nova los filtros son chips, así que los botones van en su propia fila. */}
        {searchMode === "ia" && <div className="filter-actions filter-actions-row">{accionesFiltro}</div>}
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="records">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={sortKey === c.key ? "sorted" : ""}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    <span className="arrow">
                      {sortKey !== c.key ? "↕" : sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  </th>
                ))}
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1}>
                    <div className="empty">No hay registros que coincidan con los filtros.</div>
                  </td>
                </tr>
              )}
              {pageRows.map((r) => {
                const diasInfo = getDiasInfo(r);
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.localSeq ? `#${r.localSeq}` : "—"}</td>
                    <td>{r.fechaSolicitud || "—"}</td>
                    <td>{r.fechaEntrega || "—"}</td>
                    <td><span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span></td>
                    <td>{r.area || "—"}</td>
                    <td>{r.responsable || "—"}</td>
                    <td><span className={`pill ${estadoPillClass(r.estado)}`}>{r.estado || "—"}</span></td>
                    <td className="truncate">{r.categoria || "—"}</td>
                    <td>
                      {r.descripcion ? (
                        <span className="desc-tooltip-wrap">
                          <span className="desc-text">{r.descripcion}</span>
                          <span className="desc-tooltip-bubble">{r.descripcion}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td>{r.medioPago || "—"}</td>
                    <td className="truncate">{r.licitacion || "—"}</td>
                    <td><span className={`pill ${legalizacionPillClass(r.estadoLegalizacion)}`}>{r.estadoLegalizacion || "—"}</span></td>
                    <td className="mono">{r.nit || "—"}</td>
                    <td>
                      <div className="prov-celda">
                        {r.proveedor ? (
                          <span className="desc-tooltip-wrap prov-celda-nombre">
                            <span className="desc-text">{r.proveedor}</span>
                            <span className="desc-tooltip-bubble">{r.proveedor}</span>
                          </span>
                        ) : "—"}
                        {r.proveedorNit && alertasProveedores[r.proveedorNit] && (() => {
                          const al = alertasProveedores[r.proveedorNit];
                          return (
                            <span className="desc-tooltip-wrap prov-alert-wrap">
                              <span
                                className={`prov-alert-icon prov-alert-${al.nivel}`}
                                role="img"
                                tabIndex={0}
                                aria-label={`Alerta del proveedor: ${al.titulo}. ${al.detalle || ""}`}
                              >⚠</span>
                              <span className="desc-tooltip-bubble prov-alert-bubble" role="tooltip">
                                <strong>{al.titulo}</strong>
                                {al.detalle ? <span>{al.detalle}</span> : null}
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="mono cell-fe">{r.fe || "—"}</td>
                    <td className="num">{fmtCOP(r.valorConIva)}</td>
                    <td className="num">{fmtCOP(r.valorSinIva)}</td>
                    <td className="num">{fmtCOP(r.valorCot)}</td>
                    <td>
                      {r.observaciones ? (
                        <span className="desc-tooltip-wrap">
                          <span className="desc-text">{r.observaciones}</span>
                          <span className="desc-tooltip-bubble">{r.observaciones}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="cell-valoracion">
                      {!r.radicado ? <span className="muted" title="Se valora al radicar la compra">—</span> : r.valoracion ? (
                        <button
                          type="button" className="valoracion-celda"
                          onClick={() => setValoracionModal({ record: r, auto: false })}
                          title="Ver por qué Nova calificó así la compra y al proveedor"
                        >
                          <ValoracionPuntaje puntaje={r.valoracion.puntajeCompra} titulo="Compra" />
                          {r.valoracion.puntajeProveedor != null && <ValoracionPuntaje puntaje={r.valoracion.puntajeProveedor} titulo="Proveedor" />}
                        </button>
                      ) : (allowToggle || allowEdit) ? (
                        <button type="button" className="btn small" onClick={() => setValoracionModal({ record: r, auto: false })} title="Valorar esta compra con Nova">
                          <IconSpark size={12} /> Valorar
                        </button>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="actions-cell">
                      {confirmDeleteId === r.id ? (
                        <div className="confirm-del">
                          <span>¿Eliminar?</span>
                          <button
                            type="button" className="btn btn-danger-solid small"
                            onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                          >
                            {deletingId === r.id ? <span className="spinner" /> : "Sí"}
                          </button>
                          <button type="button" className="btn small" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === r.id}>No</button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          <TimelineButton recordId={r.id} localSeq={r.localSeq} />
                          <button
                            type="button"
                            className={`icon-action-btn check${r.radicado ? " checked" : ""}`}
                            onClick={() => requestRadicado(r)}
                            aria-pressed={r.radicado}
                            title={
                              r.radicado
                                ? "Radicado (no se puede deshacer)"
                                : r.estadoLegalizacion !== "Legalizado"
                                  ? "Solo se puede radicar un registro con estado de legalización \"Legalizado\""
                                  : "Marcar como radicado"
                            }
                            disabled={!allowToggle || togglingId === r.id || r.radicado || r.estadoLegalizacion !== "Legalizado"}
                          >
                            {togglingId === r.id ? <span className="spinner" /> : <IconCheck size={13} />}
                          </button>
                          {allowEdit && (
                            <button type="button" className="icon-action-btn edit" onClick={() => setModalRecord(r)} title="Editar">
                              <IconEdit size={13} />
                            </button>
                          )}
                          {allowEdit && (
                            <button
                              type="button"
                              className={`icon-action-btn rate${r.calificacion ? " checked" : ""}`}
                              onClick={() => setRatingRecord(r)}
                              title={
                                !r.proveedorNit
                                  ? "Este registro no tiene un proveedor del catálogo asociado"
                                  : r.calificacion
                                    ? `Calificado con ${r.calificacion.estrellas} estrella(s) — click para editar`
                                    : "Calificar proveedor"
                              }
                              disabled={!r.proveedorNit}
                            >
                              <IconStar size={13} filled={!!r.calificacion} />
                            </button>
                          )}
                          {allowDelete && (
                            <button type="button" className="icon-action-btn delete" onClick={() => setConfirmDeleteId(r.id)} title="Eliminar">
                              <IconTrash size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="reg-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="reg-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{sorted.length} registro(s) (filtrado de {records.length})</span>
        </div>
      </div>

      {modalRecord !== undefined && (
        <RecordModal
          puedeRevisar={permissions?.viewAgentesCompras ?? canViewAgentesCompras(role)}
          record={modalRecord}
          records={records}
          onClose={() => { setModalRecord(undefined); setPrefillCompra(null); }}
          onSaved={(...a) => { setPrefillCompra(null); handleSaved(...a); }}
          prefill={modalRecord ? null : prefillCompra}
          onDeleted={handleDeletedFromModal}
          allowDelete={allowDelete}
          editableFields={modalRecord ? editableFields : null}
          maestros={maestros}
          proveedores={proveedores}
          presupuestos={presupuestos}
          actividades={actividades}
        />
      )}

      {valoracionModal && (
        <ValoracionModal
          record={valoracionModal.record}
          auto={valoracionModal.auto}
          canGenerate={allowToggle || allowEdit}
          onClose={() => setValoracionModal(null)}
          onSaved={handleValoracion}
        />
      )}

      {ratingRecord && (
        <RatingModal
          record={ratingRecord}
          onClose={() => setRatingRecord(null)}
          onSaved={handleRated}
        />
      )}

      {confirmRadicado && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRadicado(null); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Marcar como radicado</h3>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setConfirmRadicado(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <p style={{ margin: 0 }}>
                ¿Confirmas que el registro {confirmRadicado.localSeq ? `#${confirmRadicado.localSeq}` : ""}
                {confirmRadicado.descripcion ? ` — ${confirmRadicado.descripcion}` : ""} ya fue radicado?
              </p>
              <p className="count-note" style={{ margin: 0 }}>
                Esta acción no se puede deshacer: una vez marcado, nadie podrá desmarcarlo.
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={confirmMarkRadicado}>
                Sí, marcar como radicado
              </button>
              <button type="button" className="btn" onClick={() => setConfirmRadicado(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
