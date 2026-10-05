"use client";

import { useState } from "react";
import { generateBloqueIaApi } from "@/lib/api";
import { IconPlus, IconTrash, IconSpark, IconAlert, IconChevronDown } from "@/components/icons";

// Tipos de bloque del constructor manual de informes (ver reportContent.js en
// el backend, que sabe renderizar cada uno): "texto" es lo que el usuario
// escribe; "kpi"/"grafico"/"tabla" se calculan exactos sobre los datos reales
// (sin IA); "ia" es una pregunta puntual que el usuario le hace a la IA para
// ESE bloque — su respuesta se "congela" (contenidoCongelado) y de ahí en
// adelante no se vuelve a llamar a la IA para ese bloque.
const TIPOS = [
  { key: "texto", label: "Texto" },
  { key: "kpi", label: "KPI" },
  { key: "grafico", label: "Gráfico" },
  { key: "tabla", label: "Tabla" },
  { key: "ia", label: "Pregunta a la IA" },
];

const METRICAS_KPI = [
  { key: "totalValorConIva", label: "Valor total comprado" },
  { key: "totalRegistros", label: "Total de compras" },
  { key: "totalSinLegalizar", label: "Compras sin legalizar" },
  { key: "cumplimientoPct", label: "Cumplimiento de tiempos de entrega" },
  { key: "promedioDiasHabiles", label: "Promedio días hábiles de entrega" },
  { key: "totalPendientesVencidos", label: "Pendientes vencidos (fuera de SLA)" },
];

const AGRUPACIONES = [
  { key: "area", label: "Área" },
  { key: "categoria", label: "Categoría" },
  { key: "estado", label: "Estado" },
  { key: "estadoLegalizacion", label: "Estado de legalización" },
  { key: "proveedor", label: "Proveedor" },
];

function nuevoId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nuevoBloque(tipo) {
  const base = { id: nuevoId(), tipo, titulo: "" };
  if (tipo === "texto") return { ...base, contenido: "", destacado: "" };
  if (tipo === "kpi") return { ...base, metrica: METRICAS_KPI[0].key };
  if (tipo === "grafico") return { ...base, agruparPor: "area", metricaAgrupada: "valorConIva" };
  if (tipo === "tabla") return { ...base, agruparPor: "area" };
  if (tipo === "ia") return { ...base, pregunta: "", contenidoCongelado: null, destacadoCongelado: null };
  return base;
}

export function tieneBloqueIaSinGenerar(bloques) {
  return (bloques || []).find((b) => b.tipo === "ia" && !b.contenidoCongelado) || null;
}

export default function ReportBloqueBuilder({ bloques, onChange }) {
  const [genBusyId, setGenBusyId] = useState(null);
  const [genError, setGenError] = useState("");

  function addBloque(tipo) {
    onChange([...bloques, nuevoBloque(tipo)]);
  }
  function updateBloque(id, patch) {
    onChange(bloques.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function removeBloque(id) {
    onChange(bloques.filter((b) => b.id !== id));
  }
  function moveBloque(id, dir) {
    const idx = bloques.findIndex((b) => b.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= bloques.length) return;
    const next = [...bloques];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  }

  async function handleGenerarIa(bloque) {
    if (!bloque.pregunta?.trim()) return;
    setGenBusyId(bloque.id);
    setGenError("");
    try {
      const res = await generateBloqueIaApi({ pregunta: bloque.pregunta });
      updateBloque(bloque.id, { contenidoCongelado: res.contenido, destacadoCongelado: res.destacado || null });
    } catch (err) {
      setGenError(err.message || "No se pudo generar el contenido con IA.");
    } finally {
      setGenBusyId(null);
    }
  }

  return (
    <div className="bloques-builder">
      <div className="bloques-toolbar">
        {TIPOS.map((t) => (
          <button key={t.key} type="button" className="btn small" onClick={() => addBloque(t.key)}>
            <IconPlus size={11} /> {t.label}
          </button>
        ))}
      </div>

      {genError && <div className="modal-error" style={{ marginTop: 8 }}><IconAlert size={13} /> {genError}</div>}

      {bloques.length === 0 ? (
        <p className="schedule-note" style={{ marginTop: 8 }}>
          Aún no hay bloques. Agrega uno con los botones de arriba, o genera un borrador con IA más abajo.
        </p>
      ) : (
        <div className="bloques-list">
          {bloques.map((b, i) => (
            <div className="bloque-card" key={b.id}>
              <div className="bloque-card-head">
                <span className={`bloque-tipo-tag tipo-${b.tipo}`}>{TIPOS.find((t) => t.key === b.tipo)?.label}</span>
                <input
                  className="bloque-titulo-input"
                  value={b.titulo}
                  onChange={(e) => updateBloque(b.id, { titulo: e.target.value })}
                  placeholder="Título del bloque (opcional)"
                />
                <div className="bloque-card-actions">
                  <button type="button" className="btn-ghost icon-btn" title="Subir" disabled={i === 0} onClick={() => moveBloque(b.id, -1)}>
                    <IconChevronDown size={12} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button type="button" className="btn-ghost icon-btn" title="Bajar" disabled={i === bloques.length - 1} onClick={() => moveBloque(b.id, 1)}>
                    <IconChevronDown size={12} />
                  </button>
                  <button type="button" className="btn-ghost icon-btn" title="Eliminar" onClick={() => removeBloque(b.id)}>
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>

              {b.tipo === "texto" && (
                <>
                  <textarea
                    rows={3} value={b.contenido}
                    onChange={(e) => updateBloque(b.id, { contenido: e.target.value })}
                    placeholder="Escribe el contenido de este bloque…"
                  />
                  <input
                    value={b.destacado || ""}
                    onChange={(e) => updateBloque(b.id, { destacado: e.target.value })}
                    placeholder="Dato destacado (opcional, ej. $128.400.000)"
                  />
                </>
              )}

              {b.tipo === "kpi" && (
                <select value={b.metrica} onChange={(e) => updateBloque(b.id, { metrica: e.target.value })}>
                  {METRICAS_KPI.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              )}

              {(b.tipo === "grafico" || b.tipo === "tabla") && (
                <div className="field-row">
                  <select value={b.agruparPor} onChange={(e) => updateBloque(b.id, { agruparPor: e.target.value })}>
                    {AGRUPACIONES.map((a) => <option key={a.key} value={a.key}>Por {a.label}</option>)}
                  </select>
                  {b.tipo === "grafico" && (
                    <select value={b.metricaAgrupada} onChange={(e) => updateBloque(b.id, { metricaAgrupada: e.target.value })}>
                      <option value="valorConIva">Valor comprado</option>
                      <option value="cantidad">Cantidad de compras</option>
                    </select>
                  )}
                </div>
              )}

              {b.tipo === "ia" && (
                <>
                  <textarea
                    rows={2} value={b.pregunta}
                    onChange={(e) => updateBloque(b.id, { pregunta: e.target.value, contenidoCongelado: null, destacadoCongelado: null })}
                    placeholder="Ej. ¿Qué proveedor tuvo más compras sin legalizar este trimestre?"
                  />
                  <button
                    type="button" className="btn btn-sync small"
                    disabled={!b.pregunta?.trim() || genBusyId === b.id}
                    onClick={() => handleGenerarIa(b)}
                  >
                    {genBusyId === b.id ? <span className="spinner" /> : <IconSpark size={12} />}
                    {genBusyId === b.id ? "Generando…" : b.contenidoCongelado ? "Regenerar con IA" : "Generar con IA"}
                  </button>
                  {b.contenidoCongelado ? (
                    <div className="bloque-ia-resultado">
                      {b.contenidoCongelado}
                      {b.destacadoCongelado ? ` (${b.destacadoCongelado})` : ""}
                    </div>
                  ) : (
                    <p className="schedule-note" style={{ margin: 0 }}>Genera el contenido antes de guardar el informe.</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
