"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtCOP } from "@/lib/format";
import { savePresupuestoApi, deletePresupuestoApi, setModoAnioApi, fetchPresupuestos } from "@/lib/api";
import { IconMoney, IconPlus, IconAlert, IconChevronDown, IconBuilding, IconLayers, IconCheck, IconSearch } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";
import { easeOutQuart, tween, useMorph, useProgress, useReveal, useUid } from "@/components/charts/chartKit";

const ALERTA_PCT = 80;
const CRITICO_PCT = 90;

function severity(pct) {
  if (pct === null) return "muted";
  if (pct >= CRITICO_PCT) return "critical";
  if (pct >= ALERTA_PCT) return "warning";
  return "good";
}

function severityColor(pct) {
  if (pct === null) return "var(--grid)";
  if (pct >= CRITICO_PCT) return "var(--critical)";
  if (pct >= ALERTA_PCT) return "var(--warning)";
  return "var(--good)";
}

function sumRecordsFor(records, year, area, categoria) {
  let total = 0;
  for (const r of records) {
    if (r.estado === "Anulado") continue;
    if ((r.area || "Sin área") !== area) continue;
    if (categoria !== undefined && (r.categoria || "Sin categoría") !== categoria) continue;
    if (!r.fechaSolicitud || !r.fechaSolicitud.startsWith(String(year))) continue;
    total += r.valorConIva || 0;
  }
  return total;
}

// Donut de progreso — a diferencia de un gauge de "cumplimiento" (más alto es
// mejor), aquí más consumo es peor: verde/ámbar/rojo según los mismos umbrales
// que el resto del tablero de presupuesto.
function BudgetDonut({ pct, size = 132, stroke = 14 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const color = severityColor(pct);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1300);
  const t = easeOutQuart(p);
  const [vis] = useMorph([clamped]);
  const offset = c - (vis / 100) * c * t;
  return (
    <svg ref={ref} viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="presupuesto-donut cx">
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.7 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${uid}g)`} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 45%, transparent))` }}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.2} fontWeight="800" fill="var(--ink)">
        {pct === null ? "—" : `${tween(Math.round(pct), t)}%`}
      </text>
      <text x="50%" y="68%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.075} fontWeight="700" fill="var(--muted)" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
        consumido
      </text>
    </svg>
  );
}

function AreaBudgetRow({ area, year, modo, categoriaOptions, existing, gastadoArea, gastadoPorCategoria, open, onToggle, onSaved, onDeleted }) {
  const [valorArea, setValorArea] = useState(modo === "area" ? String(existing?.valorArea ?? "") : "");
  const [filas, setFilas] = useState(
    modo === "categoria" && existing?.categorias?.length
      ? existing.categorias.map((c) => ({ categoria: c.categoria, valor: String(c.valor) }))
      : [{ categoria: "", valor: "" }]
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const totalCategorias = filas.reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const totalActual = modo === "area" ? (Number(valorArea) || 0) : totalCategorias;
  const totalConfigurado = existing?.total ?? 0;
  const pctConsumido = totalConfigurado ? (gastadoArea / totalConfigurado) * 100 : null;
  const disponible = totalConfigurado ? totalConfigurado - gastadoArea : null;
  const barPct = pctConsumido === null ? 0 : Math.min(100, pctConsumido);

  function updateFila(i, field, value) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  }
  function addFila() {
    setFilas((fs) => [...fs, { categoria: "", valor: "" }]);
  }
  function removeFila(i) {
    setFilas((fs) => (fs.length > 1 ? fs.filter((_, idx) => idx !== i) : fs));
  }

  async function handleGuardar() {
    setError("");
    if (modo === "area") {
      // Un campo vacío se guarda como 0 — no se obliga a escribir "0" a mano.
      const v = Number(valorArea || 0);
      if (!Number.isFinite(v) || v < 0) {
        setError("Ingresa un presupuesto válido (mayor o igual a 0).");
        return;
      }
    } else {
      const limpias = filas.map((f) => ({ categoria: f.categoria.trim(), valor: f.valor })).filter((f) => f.categoria);
      if (!limpias.length) {
        setError("Agrega al menos una categoría con su presupuesto.");
        return;
      }
      const nombres = new Set();
      for (const f of limpias) {
        const v = Number(f.valor);
        if (!Number.isFinite(v) || v < 0) {
          setError(`El presupuesto de "${f.categoria}" debe ser un número válido mayor o igual a 0.`);
          return;
        }
        if (nombres.has(f.categoria)) {
          setError(`La categoría "${f.categoria}" está repetida.`);
          return;
        }
        nombres.add(f.categoria);
      }
    }

    setSaving(true);
    try {
      const payload = modo === "area"
        ? { area, anio: year, valorArea: Number(valorArea || 0) }
        : { area, anio: year, categorias: filas.map((f) => ({ categoria: f.categoria.trim(), valor: Number(f.valor || 0) })).filter((f) => f.categoria) };
      const saved = await savePresupuestoApi(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el presupuesto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await deletePresupuestoApi(existing.id);
      setConfirmingDelete(false);
      onDeleted();
    } catch (err) {
      setError(err.message || "No se pudo quitar el presupuesto.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`presupuesto-row${open ? " open" : ""}${existing ? "" : " unconfigured"}`}>
      <button type="button" className="presupuesto-row-header" onClick={onToggle} aria-expanded={open}>
        <div className="presupuesto-row-name">
          <span className="presupuesto-row-dot" style={{ background: existing ? severityColor(pctConsumido) : "var(--grid)" }} />
          {area}
        </div>
        <div className="presupuesto-row-bar">
          <div className="track"><div className="fill" style={{ width: `${barPct}%`, background: severityColor(pctConsumido) }} /></div>
        </div>
        <div className="presupuesto-row-figs">
          {existing ? (
            <>
              <span className="n">{fmtCOP(gastadoArea)} <span className="of">de {fmtCOP(totalConfigurado)}</span></span>
              <span className={`pill ${severity(pctConsumido)}`}>
                {pctConsumido !== null && pctConsumido >= CRITICO_PCT && <IconAlert size={11} />}
                {pctConsumido !== null ? `${pctConsumido.toFixed(0)}%` : "—"}
              </span>
            </>
          ) : (
            <span className="pill muted">Sin configurar</span>
          )}
        </div>
        <IconChevronDown size={16} className="presupuesto-row-chevron" />
      </button>

      {open && (
        <div className="presupuesto-row-body">
          {existing && (
            <div className="presupuesto-row-stats">
              <div><span className="dlabel">Presupuesto {year}</span><span className="dvalue">{fmtCOP(totalConfigurado)}</span></div>
              <div><span className="dlabel">Gastado</span><span className="dvalue">{fmtCOP(gastadoArea)}</span></div>
              <div><span className="dlabel">Disponible</span><span className={`dvalue${disponible < 0 ? " text-critical" : ""}`}>{fmtCOP(disponible)}</span></div>
            </div>
          )}

          {modo === "area" ? (
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor={`presu-${area}`}>Presupuesto {year}</label>
              <MoneyInput
                id={`presu-${area}`}
                value={valorArea}
                onChange={setValorArea}
                placeholder="Ej. 50.000.000"
              />
            </div>
          ) : (
            <div className="presupuesto-categorias">
              {filas.map((f, i) => {
                const gastadoCat = f.categoria ? (gastadoPorCategoria.get(f.categoria) || 0) : 0;
                return (
                  <div className="presupuesto-cat-row" key={i}>
                    <select
                      value={f.categoria}
                      onChange={(e) => updateFila(i, "categoria", e.target.value)}
                      aria-label="Categoría"
                    >
                      <option value="">Selecciona categoría…</option>
                      {categoriaOptions
                        .filter((c) => c === f.categoria || !filas.some((other) => other.categoria === c))
                        .map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <MoneyInput
                      placeholder="Valor"
                      value={f.valor}
                      onChange={(v) => updateFila(i, "valor", v)}
                      ariaLabel="Presupuesto de la categoría"
                    />
                    <button type="button" className="btn-ghost icon-btn" onClick={() => removeFila(i)} aria-label="Quitar categoría" title="Quitar categoría">✕</button>
                    {f.categoria && gastadoCat > 0 && (
                      <span className="presupuesto-cat-gastado">gastado: {fmtCOP(gastadoCat)}</span>
                    )}
                  </div>
                );
              })}
              <button type="button" className="btn small" onClick={addFila}>
                <IconPlus size={12} /> Agregar categoría
              </button>
              <div className="presupuesto-total-cat">
                Total del área: <strong>{fmtCOP(totalCategorias)}</strong>
              </div>
            </div>
          )}

          {error && !confirmingDelete && <div className="modal-error">{error}</div>}

          <div className="presupuesto-card-foot">
            <button type="button" className="btn btn-primary small" onClick={handleGuardar} disabled={saving || deleting}>
              {saving && <span className="spinner" />}
              {saving ? "Guardando…" : existing ? "Guardar cambios" : "Configurar presupuesto"}
            </button>
            {existing && (
              <button
                type="button"
                className="btn btn-danger-outline small"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving || deleting}
              >
                {deleting && <span className="spinner" />}
                {deleting ? "Quitando…" : "Quitar presupuesto"}
              </button>
            )}
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmingDelete(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Quitar presupuesto de {area}</h3>
              {!deleting && (
                <button type="button" className="btn-ghost icon-btn" onClick={() => setConfirmingDelete(false)} aria-label="Cerrar">✕</button>
              )}
            </div>
            <div className="modal-body">
              <div className="presupuesto-confirm">
                <div className="presupuesto-confirm-text">
                  <IconAlert size={13} />
                  <span>
                    Se eliminará el presupuesto {modo === "area" ? "" : "y todas las categorías "}configurado para <strong>{area}</strong> en {year}.
                    Esta acción no se puede deshacer: los datos se perderán y tendrás que volver a configurarlos.
                  </span>
                </div>
              </div>
              {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancelar</button>
              <button type="button" className="btn btn-danger-solid" onClick={handleDelete} disabled={deleting}>
                {deleting && <span className="spinner" />}
                {deleting ? "Quitando…" : "Sí, quitar presupuesto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MODO_INFO = {
  area: {
    icon: IconBuilding,
    title: "Por área",
    desc: "Un único valor de presupuesto anual para cada área, sin desglose interno.",
  },
  categoria: {
    icon: IconLayers,
    title: "Por categoría",
    desc: "El presupuesto de cada área se reparte entre sus categorías; el total del área es la suma de todas.",
  },
};

function ModoOption({ tipo, selected, onSelect, disabled }) {
  const info = MODO_INFO[tipo];
  const Icon = info.icon;
  return (
    <button type="button" className={`presupuesto-modo-option${selected ? " selected" : ""}`} onClick={() => onSelect(tipo)} disabled={disabled}>
      <div className="presupuesto-modo-option-ic"><Icon size={20} /></div>
      <div className="presupuesto-modo-option-body">
        <div className="presupuesto-modo-option-title">{info.title}{selected && <IconCheck size={13} />}</div>
        <div className="presupuesto-modo-option-desc">{info.desc}</div>
      </div>
    </button>
  );
}

export default function PresupuestoView({ records, areas, categorias, initialPresupuestos }) {
  const [presupuestos, setPresupuestos] = useState(initialPresupuestos || []);
  const [openArea, setOpenArea] = useState(null);
  const [modoPickerOpen, setModoPickerOpen] = useState(false);

  // Siempre año actual + siguiente, más los años con datos de compras — nunca
  // más allá del año siguiente (aunque haya registros o presupuestos futuros).
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const maxYear = now + 1;
    const set = new Set([now, maxYear]);
    for (const r of records) {
      if (!r.fechaSolicitud) continue;
      const y = Number(r.fechaSolicitud.slice(0, 4));
      if (y <= maxYear) set.add(y);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [records]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(() => (yearOptions.includes(currentYear) ? currentYear : yearOptions[0] ?? currentYear));
  // Modo GENERAL del año seleccionado — aplica a todas las áreas por igual.
  // null = todavía no se ha elegido ningún modo para este año.
  const [modo, setModo] = useState(null);
  const [modoLoaded, setModoLoaded] = useState(false);
  const [modoError, setModoError] = useState("");
  const [modoConfirm, setModoConfirm] = useState(null); // { target, afectados, mensaje } cuando hace falta confirmar
  const [changingModo, setChangingModo] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  // El modo del año se consulta aparte (no se puede derivar solo de los
  // presupuestos ya cargados: un año puede tener modo elegido sin ninguna
  // área guardada todavía).
  useEffect(() => {
    let cancelado = false;
    setModoLoaded(false);
    setModoError("");
    setModoConfirm(null);
    setOpenArea(null);
    fetchPresupuestos(selectedYear)
      .then(({ presupuestos: delAnio, modo: modoAnio }) => {
        if (cancelado) return;
        setModo(modoAnio ?? null);
        setModoPickerOpen(!modoAnio);
        setPresupuestos((prev) => [...prev.filter((p) => p.anio !== selectedYear), ...delAnio]);
      })
      .catch((err) => {
        if (!cancelado) setModoError(err.message || "No se pudo cargar el presupuesto de este año.");
      })
      .finally(() => {
        if (!cancelado) setModoLoaded(true);
      });
    return () => { cancelado = true; };
  }, [selectedYear]);

  const categoriaOptions = useMemo(() => categorias.map((c) => c.valor).sort((a, b) => a.localeCompare(b, "es")), [categorias]);

  const presupuestosByArea = useMemo(() => {
    const map = new Map();
    for (const p of presupuestos) {
      if (p.anio === selectedYear) map.set(p.area, p);
    }
    return map;
  }, [presupuestos, selectedYear]);

  const gastadoPorArea = useMemo(() => {
    const map = new Map();
    for (const a of areas) map.set(a.valor, sumRecordsFor(records, selectedYear, a.valor));
    return map;
  }, [records, areas, selectedYear]);

  const gastadoPorAreaCategoria = useMemo(() => {
    const map = new Map();
    for (const a of areas) {
      const inner = new Map();
      for (const c of categoriaOptions) inner.set(c, sumRecordsFor(records, selectedYear, a.valor, c));
      map.set(a.valor, inner);
    }
    return map;
  }, [records, areas, categoriaOptions, selectedYear]);

  const resumen = useMemo(() => {
    let presupuestado = 0;
    let gastadoConPresupuesto = 0;
    for (const p of presupuestos) {
      if (p.anio !== selectedYear) continue;
      presupuestado += p.total;
      gastadoConPresupuesto += gastadoPorArea.get(p.area) || 0;
    }
    return {
      presupuestado,
      gastadoConPresupuesto,
      disponible: presupuestado - gastadoConPresupuesto,
      pct: presupuestado ? (gastadoConPresupuesto / presupuestado) * 100 : null,
      areasConfiguradas: presupuestos.filter((p) => p.anio === selectedYear).length,
    };
  }, [presupuestos, selectedYear, gastadoPorArea]);

  // Áreas ordenadas: configuradas primero (por % de consumo desc.), luego las
  // que todavía no tienen presupuesto — así lo que necesita atención queda arriba.
  const areasOrdenadas = useMemo(() => {
    return [...areas].sort((a, b) => {
      const pa = presupuestosByArea.get(a.valor);
      const pb = presupuestosByArea.get(b.valor);
      if (!!pa !== !!pb) return pa ? -1 : 1;
      if (pa && pb) {
        const pctA = pa.total ? (gastadoPorArea.get(a.valor) || 0) / pa.total : 0;
        const pctB = pb.total ? (gastadoPorArea.get(b.valor) || 0) / pb.total : 0;
        return pctB - pctA;
      }
      return a.valor.localeCompare(b.valor, "es");
    });
  }, [areas, presupuestosByArea, gastadoPorArea]);

  const [busqueda, setBusqueda] = useState("");
  const areasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return areasOrdenadas;
    return areasOrdenadas.filter((a) => a.valor.toLowerCase().includes(q));
  }, [areasOrdenadas, busqueda]);

  async function handleElegirModo(target, confirm = false) {
    setModoError("");
    setChangingModo(true);
    try {
      const result = await setModoAnioApi(selectedYear, target, confirm);
      setModo(result.modo);
      setModoConfirm(null);
      setModoPickerOpen(false);
      if (result.presupuestosBorrados) {
        setPresupuestos((prev) => prev.filter((p) => p.anio !== selectedYear));
        setResetToken((t) => t + 1);
      }
    } catch (err) {
      if (err.requiresConfirm) {
        setModoConfirm({ target, afectados: err.afectados, mensaje: err.message });
      } else {
        setModoError(err.message || "No se pudo cambiar el modo.");
      }
    } finally {
      setChangingModo(false);
    }
  }

  function handleSaved(saved) {
    setPresupuestos((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
  }

  function handleDeleted(area) {
    setPresupuestos((prev) => prev.filter((p) => !(p.area === area && p.anio === selectedYear)));
  }

  return (
    <div className="presupuesto-shell">
      {/* Selector de año, como chips en lugar de un select — hay pocos años. */}
      <div className="presupuesto-year-chips">
        {yearOptions.map((y) => (
          <button
            key={y} type="button"
            className={`presupuesto-year-chip${y === selectedYear ? " selected" : ""}`}
            onClick={() => setSelectedYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Hero: resumen general del año con donut de consumo */}
      <div className="presupuesto-hero">
        <BudgetDonut pct={resumen.pct} />
        <div className="presupuesto-hero-stats">
          <div className="presupuesto-hero-stat">
            <span className="dlabel">Presupuestado {selectedYear}</span>
            <span className="dvalue">{fmtCOP(resumen.presupuestado)}</span>
          </div>
          <div className="presupuesto-hero-stat">
            <span className="dlabel">Gastado</span>
            <span className="dvalue">{fmtCOP(resumen.gastadoConPresupuesto)}</span>
          </div>
          <div className="presupuesto-hero-stat">
            <span className="dlabel">Disponible</span>
            <span className={`dvalue${resumen.disponible < 0 ? " text-critical" : ""}`}>{fmtCOP(resumen.disponible)}</span>
          </div>
        </div>
        <div className="presupuesto-hero-side">
          {modo ? (
            <>
              <span className="pill accent">{MODO_INFO[modo].title}</span>
              <span className="presupuesto-hero-modo-desc">{MODO_INFO[modo].desc}</span>
            </>
          ) : (
            <span className="presupuesto-hero-note">Aún no se ha elegido el modo de presupuesto de {selectedYear}.</span>
          )}
          <span className="presupuesto-hero-note">{resumen.areasConfiguradas} de {areas.length} área(s) configurada(s)</span>
          {modoLoaded && (
            <button
              type="button"
              className={`btn ${modo ? "" : "btn-primary"} presupuesto-modo-btn`}
              onClick={() => setModoPickerOpen((v) => !v)}
              aria-expanded={modoPickerOpen}
            >
              <IconLayers size={13} /> {modo ? "Cambiar modo de presupuesto" : "Elegir modo de presupuesto"}
            </button>
          )}
        </div>
      </div>

      {/* Selector de modo — dos opciones ilustradas, general para todas las áreas del año */}
      {modoPickerOpen && (
        <div className="card presupuesto-modo-card">
          <h3>Modo de presupuesto para {selectedYear}</h3>
          <p className="card-sub">
            Aplica por igual a <strong>todas las áreas</strong> de este año: un solo valor por área, o repartido por categoría dentro de cada una.
          </p>
          <div className="presupuesto-modo-picker">
            <ModoOption tipo="area" selected={modo === "area"} onSelect={handleElegirModo} disabled={changingModo} />
            <ModoOption tipo="categoria" selected={modo === "categoria"} onSelect={handleElegirModo} disabled={changingModo} />
          </div>

          {modoConfirm && (
            <div className="presupuesto-confirm" style={{ marginTop: 10 }}>
              <div className="presupuesto-confirm-text">
                <IconAlert size={13} />
                <span>{modoConfirm.mensaje}</span>
              </div>
              <div className="presupuesto-confirm-actions">
                <button type="button" className="btn btn-danger-solid small" onClick={() => handleElegirModo(modoConfirm.target, true)} disabled={changingModo}>
                  {changingModo ? <span className="spinner" /> : "Sí, cambiar y borrar"}
                </button>
                <button type="button" className="btn small" onClick={() => setModoConfirm(null)} disabled={changingModo}>Cancelar</button>
              </div>
            </div>
          )}
          {modoError && <div className="modal-error" style={{ marginTop: 8 }}>{modoError}</div>}
        </div>
      )}

      {!modo && modoLoaded && !modoPickerOpen ? (
        <div className="empty">Elige arriba cómo se manejará el presupuesto de {selectedYear} para empezar a configurarlo por área.</div>
      ) : modo ? (
        areas.length === 0 ? (
          <div className="empty">No hay áreas activas configuradas en Maestros. Crea al menos un área antes de asignarle presupuesto.</div>
        ) : (
          <div className="card presupuesto-list">
            <div className="presupuesto-list-head">
              <div>
                <h3 style={{ marginBottom: 4 }}>Presupuesto por área</h3>
                <p className="card-sub">Haz clic en un área para configurar o editar su presupuesto {selectedYear}.</p>
              </div>
              <div className="maestros-search-wrap" style={{ maxWidth: 240 }}>
                <input
                  type="search"
                  placeholder="Buscar área…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  aria-label="Buscar área"
                />
                <span className="ic"><IconSearch size={14} /></span>
              </div>
            </div>
            {areasFiltradas.length === 0 && (
              <div className="empty">Ningún área coincide con &quot;{busqueda}&quot;.</div>
            )}
            {areasFiltradas.map((a) => (
              <AreaBudgetRow
                key={`${a.valor}-${selectedYear}-${modo}-${resetToken}`}
                area={a.valor}
                year={selectedYear}
                modo={modo}
                categoriaOptions={categoriaOptions}
                existing={presupuestosByArea.get(a.valor) || null}
                gastadoArea={gastadoPorArea.get(a.valor) || 0}
                gastadoPorCategoria={gastadoPorAreaCategoria.get(a.valor) || new Map()}
                open={openArea === a.valor}
                onToggle={() => setOpenArea((cur) => (cur === a.valor ? null : a.valor))}
                onSaved={handleSaved}
                onDeleted={() => handleDeleted(a.valor)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
