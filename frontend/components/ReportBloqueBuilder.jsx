"use client";

import { useRef, useState } from "react";
import { IconPlus, IconTrash, IconSpark, IconChevronDown } from "@/components/icons";

// Tipos de bloque del constructor manual de informes (ver reportContent.js en
// el backend, que sabe renderizar cada uno): "texto" es lo que el usuario
// escribe; "kpi"/"grafico"/"tabla" se calculan exactos sobre los datos reales
// (sin IA); "ia" solo guarda una pregunta — se ejecuta contra la IA al
// generar el informe (vista previa, envío manual o programado), no al
// agregar el bloque aquí (ver renderBloqueIa en backend/lib/reportContent.js).
export const TIPOS = [
  { key: "texto", label: "Texto" },
  { key: "kpi", label: "KPI" },
  { key: "grafico", label: "Gráfico" },
  { key: "tabla", label: "Tabla" },
  { key: "ia", label: "Pregunta a la IA" },
];

export const METRICAS_KPI = [
  { key: "totalValorConIva", label: "Valor total comprado" },
  { key: "totalRegistros", label: "Total de compras" },
  { key: "totalSinLegalizar", label: "Compras sin legalizar" },
  { key: "cumplimientoPct", label: "Cumplimiento de tiempos de entrega" },
  { key: "promedioDiasHabiles", label: "Promedio días hábiles de entrega" },
  { key: "totalPendientesVencidos", label: "Pendientes vencidos (fuera de SLA)" },
];

export const AGRUPACIONES = [
  { key: "area", label: "Área" },
  { key: "categoria", label: "Categoría" },
  { key: "estado", label: "Estado" },
  { key: "estadoLegalizacion", label: "Estado de legalización" },
  { key: "proveedor", label: "Proveedor" },
];

// Periodo dinámico: se recalcula relativo a "ahora" cada vez que se genera el
// informe (vista previa, envío manual o programado) — "mes anterior" en un
// envío programado siempre es el mes antes del día en que corre, nunca una
// fecha fija guardada en el bloque (ver backend/lib/reportContent.js).
export const PERIODOS = [
  { key: "historico", label: "Todo el histórico" },
  { key: "mes_actual", label: "Mes actual" },
  { key: "mes_anterior", label: "Mes anterior" },
  { key: "anio_actual", label: "Año actual" },
  { key: "anio_anterior", label: "Año anterior" },
];

function nuevoId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nuevoBloque(tipo) {
  const base = { id: nuevoId(), tipo, titulo: "" };
  if (tipo === "texto") return { ...base, contenido: "", destacado: "" };
  if (tipo === "kpi") return { ...base, metrica: METRICAS_KPI[0].key, analisisIa: false, analisisPregunta: "" };
  if (tipo === "grafico") return { ...base, agruparPor: "area", metricaAgrupada: "valorConIva", analisisIa: false, analisisPregunta: "" };
  if (tipo === "tabla") return { ...base, agruparPor: "area", analisisIa: false, analisisPregunta: "" };
  if (tipo === "ia") return { ...base, pregunta: "" };
  return base;
}

// Mismas claves que selecciona el bloque KPI — se pueden usar como
// "{{clave}}" dentro de un bloque de texto, para que ese texto incluya un
// dato real sin tener que agregar un bloque KPI aparte (ver interpolarTexto
// en backend/lib/reportContent.js, que calcula el valor sobre el periodo
// general del informe al momento de generar).
const PLACEHOLDERS_TEXTO = METRICAS_KPI;

// Ejemplo puramente ilustrativo (NUNCA llama a la IA ni usa datos reales) de
// cómo se vería la respuesta a la pregunta del bloque — solo para que el
// usuario se haga una idea de formato/extensión mientras arma el informe. El
// análisis real, con cifras reales, se genera recién al presionar "Generar
// vista previa" o al enviarse el informe (ver renderBloqueIa en el backend).
function ejemploFicticio(pregunta) {
  const p = (pregunta || "").trim() || "tu pregunta";
  return `Ejemplo ilustrativo (datos ficticios, no reales) de cómo se vería la respuesta a "${p}":

- El área de Tecnología concentra el mayor gasto, con 18 compras por $350.000.000 (32% del total).
- Hay 4 compras sin legalizar que suman $28.500.000.
- El proveedor "Proveedor Ejemplo S.A.S." es el más recurrente, con 7 compras en el periodo.

Esto es solo un ejemplo de formato — el contenido real, con tus datos, se calcula al generar la vista previa o al enviar el informe.`;
}

// Casilla "Agregar análisis de IA" integrada en el propio bloque KPI/Gráfico/
// Tabla (no un bloque aparte) — al marcarla, el análisis se ejecuta al
// generar el informe usando EXCLUSIVAMENTE los datos de ESE bloque (su
// métrica/agrupación y periodo), igual que antes, pero ahora como una opción
// del bloque en vez de un bloque de IA independiente (ver renderBloqueKpi/
// Grafico/Tabla en backend/lib/reportContent.js).
function AnalisisIaToggle({ bloque, updateBloque, ejemplos, toggleEjemplo }) {
  return (
    <div className="bloque-analisis-ia">
      <div className="bloque-analisis-ia-row">
        <span
          className="bloque-analisis-ia-label"
          onClick={() => updateBloque(bloque.id, { analisisIa: !bloque.analisisIa })}
        >
          <IconSpark size={11} /> Agregar análisis de IA de este dato
        </span>
        <label className="switch-toggle">
          <input
            type="checkbox"
            checked={!!bloque.analisisIa}
            onChange={(e) => updateBloque(bloque.id, { analisisIa: e.target.checked })}
          />
          <span className="switch-toggle-track"><span className="switch-toggle-thumb" /></span>
        </label>
      </div>
      {bloque.analisisIa && (
        <>
          <textarea
            rows={2} value={bloque.analisisPregunta || ""}
            onChange={(e) => updateBloque(bloque.id, { analisisPregunta: e.target.value })}
            placeholder="Opcional — qué quieres que destaque el análisis (si lo dejas vacío, hace un resumen simple)"
          />
          <button type="button" className="btn-ghost small" onClick={() => toggleEjemplo(bloque, bloque.analisisPregunta)}>
            <IconSpark size={11} /> {ejemplos[bloque.id] ? "Ocultar ejemplo" : "Ver ejemplo (datos ficticios)"}
          </button>
          {ejemplos[bloque.id] && <div className="bloque-ia-resultado">{ejemplos[bloque.id]}</div>}
        </>
      )}
    </div>
  );
}

export default function ReportBloqueBuilder({ bloques, onChange }) {
  const dragIndexRef = useRef(null);
  const [ejemplos, setEjemplos] = useState({}); // { [bloqueId]: texto ficticio visible }

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
  function moveBloqueTo(fromIdx, toIdx) {
    if (fromIdx === null || fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const next = [...bloques];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
  }

  function toggleEjemplo(bloque, pregunta) {
    setEjemplos((prev) => {
      if (prev[bloque.id]) {
        const { [bloque.id]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [bloque.id]: ejemploFicticio(pregunta) };
    });
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

      {bloques.length === 0 ? (
        <p className="schedule-note" style={{ marginTop: 8 }}>
          Aún no hay bloques. Agrega uno con los botones de arriba, o genera un borrador con IA más abajo.
        </p>
      ) : (
        <div className="bloques-list">
          {bloques.map((b, i) => (
            <div
              className="bloque-card"
              key={b.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                moveBloqueTo(dragIndexRef.current, i);
                dragIndexRef.current = null;
              }}
            >
              <div className="bloque-card-head">
                <span
                  className="bloque-drag-handle"
                  draggable
                  onDragStart={(e) => { dragIndexRef.current = i; e.dataTransfer.effectAllowed = "move"; }}
                  title="Arrastrar para reordenar"
                >
                  ⠿
                </span>
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
                    placeholder="Escribe el contenido de este bloque… puedes usar {{totalValorConIva}} para insertar un dato real"
                  />
                  <input
                    value={b.destacado || ""}
                    onChange={(e) => updateBloque(b.id, { destacado: e.target.value })}
                    placeholder="Dato destacado (opcional, ej. $128.400.000 o {{totalValorConIva}})"
                  />
                  <details className="bloque-placeholders-help">
                    <summary>¿Cómo insertar un dato real en el texto?</summary>
                    <p className="schedule-note" style={{ margin: "4px 0" }}>
                      Escribe cualquiera de estas claves entre doble llave y se reemplaza por el valor real (según el
                      periodo elegido arriba) al generar el informe:
                    </p>
                    <ul className="bloque-placeholders-list">
                      {PLACEHOLDERS_TEXTO.map((m) => (
                        <li key={m.key}><code>{`{{${m.key}}}`}</code> — {m.label}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}

              {b.tipo === "kpi" && (
                <>
                  <select value={b.metrica} onChange={(e) => updateBloque(b.id, { metrica: e.target.value })}>
                    {METRICAS_KPI.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                  <AnalisisIaToggle bloque={b} updateBloque={updateBloque} ejemplos={ejemplos} toggleEjemplo={toggleEjemplo} />
                </>
              )}

              {(b.tipo === "grafico" || b.tipo === "tabla") && (
                <>
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
                  <AnalisisIaToggle bloque={b} updateBloque={updateBloque} ejemplos={ejemplos} toggleEjemplo={toggleEjemplo} />
                </>
              )}

              {b.tipo === "ia" && (
                <>
                  <textarea
                    rows={2} value={b.pregunta}
                    onChange={(e) => updateBloque(b.id, { pregunta: e.target.value })}
                    placeholder="Ej. ¿Qué proveedor tuvo más compras sin legalizar este trimestre?"
                  />
                  <button type="button" className="btn-ghost small" onClick={() => toggleEjemplo(b, b.pregunta)}>
                    <IconSpark size={11} /> {ejemplos[b.id] ? "Ocultar ejemplo" : "Ver ejemplo (datos ficticios)"}
                  </button>
                  {ejemplos[b.id] ? (
                    <div className="bloque-ia-resultado">{ejemplos[b.id]}</div>
                  ) : (
                    <p className="schedule-note" style={{ margin: 0 }}>
                      Se ejecuta contra tus datos reales al generar la vista previa o al enviar el informe — no hace falta generarlo aquí.
                    </p>
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
