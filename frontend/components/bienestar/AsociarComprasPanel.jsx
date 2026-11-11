"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtCOP } from "@/lib/format";
import { fetchComprasDisponiblesApi, asociarCompraApi } from "@/lib/api";
import PiePagina, { usePagina, PAGE_SIZES_MODAL } from "@/components/bienestar/PiePagina";
import { IconSearch, IconCheck } from "@/components/icons";

const DIAS_CERCA = 30;
const dias = (a, b) => Math.abs((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Asociar compras a una actividad, en un panel lateral: se buscan, se MARCAN varias a la vez y abajo se ve, antes de
// confirmar, cuánto suman y cómo queda el presupuesto. Reemplaza la lista con un botón "Asociar" por fila.
// Filtros rápidos: las de fecha cercana a la actividad (±30 días) y las del área Bienestar, que son las más probables.
export default function AsociarComprasPanel({ act, onClose, onAsociadas }) {
  const [q, setQ] = useState("");
  const [compras, setCompras] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [elegidas, setElegidas] = useState(() => new Map()); // id -> compra
  const [guardando, setGuardando] = useState(false);
  const timer = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setError("");
      fetchComprasDisponiblesApi(q)
        .then((r) => setCompras(r.compras || []))
        .catch((e) => { setCompras([]); setError(e.message && !/^Error \d/.test(e.message) ? e.message : "No se pudo buscar: el servidor no respondió. Intenta de nuevo en un momento."); });
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  useEffect(() => {
    campo.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !guardando) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, guardando]);

  const esCerca = (c) => !!(act.fecha && c.fechaSolicitud && dias(act.fecha, c.fechaSolicitud) <= DIAS_CERCA);
  const esBienestar = (c) => sinTildes(c.area).includes("bienestar");
  const lista = compras || [];
  const cuenta = { todas: lista.length, cerca: lista.filter(esCerca).length, bienestar: lista.filter(esBienestar).length };
  const visibles = useMemo(
    () => lista.filter((c) => (filtro === "cerca" ? esCerca(c) : filtro === "bienestar" ? esBienestar(c) : true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compras, filtro],
  );
  const pag = usePagina(visibles, `${q}|${filtro}`, PAGE_SIZES_MODAL[0]);

  const alternar = (c) => setElegidas((m) => { const n = new Map(m); if (n.has(c.id)) n.delete(c.id); else n.set(c.id, c); return n; });
  const sumaElegidas = [...elegidas.values()].reduce((s, c) => s + (c.valorConIva || 0), 0);
  const totalNuevo = act.gastado + sumaElegidas;
  const presupuesto = act.presupuesto;
  const queda = presupuesto != null ? presupuesto - totalNuevo : null;
  const pctAntes = presupuesto ? Math.min(100, (act.gastado / presupuesto) * 100) : 0;
  const pctNuevo = presupuesto ? Math.min(100 - pctAntes, (sumaElegidas / presupuesto) * 100) : 0;

  async function confirmar() {
    setGuardando(true);
    setError("");
    let hechas = 0;
    try {
      for (const c of elegidas.values()) { await asociarCompraApi(act.id, c.id); hechas++; }
      onAsociadas(hechas);
    } catch (e) {
      setError(`${hechas ? `Se asociaron ${hechas}, pero una falló: ` : ""}${e.message || "No se pudo asociar la compra."}`);
      if (hechas) onAsociadas(hechas, true);
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="ac-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
        <aside className="ac-panel" role="dialog" aria-modal="true" aria-labelledby="ac-titulo">
          <header className="ac-cabeza">
            <div>
              <h2 id="ac-titulo">Asociar compras</h2>
              <p>Marca las compras que son de <b>{act.nombre}</b>. Solo aparecen las que aún no tienen actividad.</p>
            </div>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={guardando} aria-label="Cerrar">✕</button>
          </header>

          <div className="ac-buscar">
            <IconSearch size={15} />
            <input ref={campo} type="search" aria-label="Buscar compras sin actividad" placeholder="Busca por número, descripción, proveedor o área" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ac-filtros" role="group" aria-label="Filtros rápidos">
            {[["todas", "Todas"], ["cerca", "Cerca de la fecha"], ["bienestar", "Área Bienestar"]].map(([k, l]) => (
              <button key={k} type="button" className={`ac-filtro${filtro === k ? " activo" : ""}`} aria-pressed={filtro === k} onClick={() => setFiltro(k)} disabled={k === "cerca" && !act.fecha} title={k === "cerca" ? (act.fecha ? `Solicitadas hasta ${DIAS_CERCA} días antes o después de la actividad` : "La actividad aún no tiene fecha") : undefined}>
                {l} <span>{cuenta[k]}</span>
              </button>
            ))}
          </div>

          <div className="ac-lista">
            {error && <div className="modal-error" role="alert">{error}</div>}
            {compras === null && <div className="empty"><span className="spinner" /> Buscando compras…</div>}
            {compras !== null && !error && visibles.length === 0 && (
              <div className="empty">{q.trim() || filtro !== "todas" ? "Ninguna compra sin actividad coincide. Prueba con otra palabra o quita el filtro." : "No hay compras sin actividad."}</div>
            )}
            {pag.pagina.map((c) => {
              const marcada = elegidas.has(c.id);
              return (
                <button key={c.id} type="button" role="checkbox" aria-checked={marcada} className={`ac-compra${marcada ? " marcada" : ""}`} onClick={() => alternar(c)} disabled={guardando}>
                  <span className="ac-check" aria-hidden="true">{marcada && <IconCheck size={12} />}</span>
                  <span className="ac-compra-txt">
                    <span className="desc-tooltip-wrap"><span className="desc-text">{c.descripcion || "Sin descripción"}</span><span className="desc-tooltip-bubble">{c.descripcion}</span></span>
                    <small>
                      <span className="mono">#{c.localSeq ?? "—"}</span> · {[c.fechaSolicitud, c.area, c.proveedor].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {esCerca(c) && <span className="ac-etiqueta">Fecha cercana</span>}
                  <strong>{fmtCOP(c.valorConIva || 0)}</strong>
                </button>
              );
            })}
          </div>
          {visibles.length > 0 && <PiePagina id="ac-size" tamanos={PAGE_SIZES_MODAL} p={pag} total={visibles.length} etiqueta="compra(s) sin actividad" />}

          <footer className="ac-pie">
            <div className="ac-pie-cifras">
              <div><span>Seleccionadas</span><strong>{elegidas.size}</strong></div>
              <div><span>Suman</span><strong>{fmtCOP(sumaElegidas)}</strong></div>
              {queda != null && <div className={queda < 0 ? "negativo" : ""}><span>{queda < 0 ? "Se pasaría en" : "Quedaría"}</span><strong>{fmtCOP(Math.abs(queda))}</strong></div>}
            </div>
            {presupuesto ? (
              <div className="ac-barra" role="img" aria-label={`Con estas compras se usaría ${Math.round((totalNuevo / presupuesto) * 100)} % del presupuesto`}>
                <i style={{ width: `${pctAntes}%` }} />
                <i className={`nuevo${queda < 0 ? " pasado" : ""}`} style={{ width: `${pctNuevo}%` }} />
              </div>
            ) : <span className="count-note">La actividad no tiene presupuesto asignado.</span>}
            <div className="ac-pie-botones">
              {elegidas.size > 0 && <button type="button" className="btn" onClick={() => setElegidas(new Map())} disabled={guardando}>Quitar selección</button>}
              <button type="button" className="btn btn-primary" onClick={confirmar} disabled={guardando || elegidas.size === 0}>
                {guardando && <span className="spinner" />} {elegidas.size ? `Asociar ${elegidas.size} compra${elegidas.size > 1 ? "s" : ""}` : "Marca al menos una"}
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </>
  );
}
