"use client";

import { useRef, useState } from "react";
import { analizarConAgenteApi, importarConAgenteApi, subirFotoApi } from "@/lib/api";
import { reducir } from "@/components/bienestar/FotosActividad";
import { IconDownload, IconSpark, IconTrash, IconCheck, IconAlert } from "@/components/icons";

const EXT_FOTO = /\.(jpe?g|png|webp)$/i;
const MIME_FOTO = /^image\/(jpeg|png|webp)$/;
const EXT_DATOS = /\.(xlsx|xls|csv)$/i;
const MAX_ARCHIVOS = 40;
const MAX_FOTO = 25 * 1024 * 1024;
const MAX_DATOS = 10 * 1024 * 1024;
const ACEPTA = ".xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp";
const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");
let siguienteId = 1;

// Qué se cargaría, en una línea.
function resumenPrevia(it) {
  const v = it.plan?.vistaPrevia;
  if (it.clase === "foto") return "Se agrega a las fotos de la actividad.";
  if (!v) return it.plan?.tipo === "ninguno" ? "No se importa." : "";
  if (v.items != null) return `${entero(v.items)} ítem(s) de inventario.`;
  const r = v.resultado;
  return [
    `${entero(r.leidos)} fila(s) leídas`,
    `${entero(r.creados)} persona(s) nuevas`,
    `${entero(r.actualizados)} se actualizan`,
    r.sinCoincidencia ? `${entero(r.sinCoincidencia)} sin coincidencia` : "",
    r.marcadosNo ? `${entero(r.marcadosNo)} quedan como no asistieron` : "",
    v.descartadas ? `${entero(v.descartadas)} fila(s) descartadas` : "",
  ].filter(Boolean).join(" · ") + ".";
}

// Pestaña "Agente de importación" de la ficha: se sueltan todos los archivos de la actividad (fotos, listas de
// programados o de asistencia, encuestas de calificación, inventario). El servidor revisa que no sean maliciosos, Nova
// dice qué es cada uno y qué cargaría (sin escribir nada) y, si tiene dudas, pregunta; al importar se aplica cada
// plan con las respuestas. Las fotos se re-dibujan en el navegador antes de subirlas.
export default function AgenteImportacion({ act, onCambio }) {
  const [items, setItems] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [importando, setImportando] = useState(false);
  const entrada = useRef(null);

  const cambiar = (id, cambios) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)));

  async function analizar(it, plan = null) {
    cambiar(it.id, { estado: "analizando", error: "" });
    try {
      const r = await analizarConAgenteApi(act.id, it.file, plan);
      cambiar(it.id, { estado: r.error ? "error" : "listo", plan: r, error: r.error || "" });
    } catch (e) {
      cambiar(it.id, { estado: "rechazado", error: e.message || "Nova no pudo leer el archivo." });
    }
  }

  async function agregar(files) {
    const nuevos = [];
    for (const file of [...files].slice(0, MAX_ARCHIVOS)) {
      if (items.some((x) => x.file.name === file.name && x.file.size === file.size)) continue;
      const esFoto = EXT_FOTO.test(file.name) && MIME_FOTO.test(file.type);
      const esDatos = EXT_DATOS.test(file.name);
      const it = { id: siguienteId++, file, clase: esFoto ? "foto" : "datos", estado: "pendiente", plan: null, respuestas: {}, error: "", resultado: "" };
      if (!esFoto && !esDatos) Object.assign(it, { estado: "rechazado", error: "Solo se aceptan Excel (.xlsx, .xls), CSV y fotos (JPG, PNG o WebP)." });
      else if (file.size > (esFoto ? MAX_FOTO : MAX_DATOS)) Object.assign(it, { estado: "rechazado", error: `Pasa de ${esFoto ? 25 : 10} MB.` });
      else if (esFoto) Object.assign(it, { estado: "listo", plan: { tipoEtiqueta: "Foto de la actividad", preguntas: [] } });
      nuevos.push(it);
    }
    setItems((l) => [...l, ...nuevos].slice(0, MAX_ARCHIVOS));
    // Uno a la vez: Nova lee cada Excel y arma su plan.
    for (const it of nuevos.filter((x) => x.estado === "pendiente")) await analizar(it);
  }

  function responder(it, pregunta, valor) {
    const respuestas = { ...it.respuestas, [pregunta.id]: valor };
    cambiar(it.id, { respuestas });
    // Otro tipo: se vuelve a simular con el mismo mapeo (sin volver a llamar a Nova).
    if (pregunta.id === "tipo" && valor !== it.plan.tipo) {
      analizar({ ...it, respuestas }, { mapeo: it.plan.mapeo, tipo: valor, preguntas: it.plan.preguntas, respuestas });
    }
  }

  const faltaResponder = (it) => (it.plan?.preguntas || []).some((p) => !it.respuestas[p.id]);
  const porImportar = items.filter((x) => x.estado === "listo");
  const preguntasAbiertas = porImportar.reduce((n, x) => n + (x.plan?.preguntas || []).filter((p) => !x.respuestas[p.id]).length, 0);
  const analizando = items.some((x) => x.estado === "analizando");

  async function importarTodo() {
    setImportando(true);
    for (const it of porImportar) {
      cambiar(it.id, { estado: "importando", error: "" });
      try {
        if (it.clase === "foto") {
          const r = await reducir(it.file);
          await subirFotoApi(act.id, { ...r, nombre: it.file.name });
          cambiar(it.id, { estado: "importado", resultado: "Foto agregada." });
        } else {
          const r = await importarConAgenteApi(act.id, it.file, { tipo: it.plan.tipo, mapeo: it.plan.mapeo, preguntas: it.plan.preguntas, respuestas: it.respuestas });
          const x = r.resultado;
          cambiar(it.id, { estado: "importado", resultado: x ? `${r.tipoEtiqueta}: ${entero(x.creados)} nuevos, ${entero(x.actualizados)} actualizados${x.marcadosNo ? `, ${entero(x.marcadosNo)} no asistieron` : ""}.` : "No se importó." });
        }
      } catch (e) {
        cambiar(it.id, { estado: "error", error: e.message || "No se pudo importar." });
      }
    }
    setImportando(false);
    onCambio();
  }

  return (
    <div className="ficha-seccion">
      <section className="resumen-card agente-imp" aria-labelledby="agente-imp-t">
        <h2 id="agente-imp-t"><IconSpark size={15} /> Agente de importación</h2>
        <p className="card-sub">
          Suelta aquí todo el material de la actividad: fotos, listas de programados o de asistencia, encuestas de calificación e inventario.
          Nova revisa cada archivo, te dice qué va a cargar y, si tiene dudas, te pregunta antes de importar. Nada se guarda hasta que le des Importar.
        </p>
        <div
          className={`agente-imp-zona${arrastrando ? " activa" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (!importando) agregar(e.dataTransfer.files); }}
        >
          <IconDownload size={20} style={{ transform: "rotate(180deg)" }} />
          <span>Arrastra los archivos o</span>
          <button type="button" className="btn small" disabled={importando} onClick={() => entrada.current?.click()}>Elegir archivos</button>
          <input ref={entrada} type="file" multiple accept={ACEPTA} hidden onChange={(e) => { const f = e.target.files; if (f?.length) agregar(f); e.target.value = ""; }} />
          <span className="count-note">Excel (.xlsx, .xls), CSV y fotos JPG, PNG o WebP. Hasta {MAX_ARCHIVOS} archivos; los que tengan macros, programas o contenido sospechoso se rechazan.</span>
        </div>
      </section>

      {items.length > 0 && (
        <ul className="agente-imp-lista" aria-label="Archivos para importar">
          {items.map((it) => (
            <li key={it.id} className={`agente-imp-item estado-${it.estado}`}>
              <div className="agente-imp-cabeza">
                <strong className="agente-imp-nombre" title={it.file.name}>{it.file.name}</strong>
                {it.plan?.tipoEtiqueta && it.estado !== "rechazado" && <span className="actividad-chip">{it.plan.tipoEtiqueta}</span>}
                <span className={`pill agente-imp-pill-${it.estado}`}>
                  {{ pendiente: "En cola", analizando: "Nova está leyendo…", listo: faltaResponder(it) ? "Nova pregunta" : "Listo para importar", importando: "Importando…", importado: "Importado", error: "Error", rechazado: "Rechazado" }[it.estado]}
                </span>
                <span className="spacer" />
                {!importando && it.estado !== "importando" && (
                  <button type="button" className="icon-action-btn delete" title="Quitar de la lista" aria-label={`Quitar ${it.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}><IconTrash size={13} /></button>
                )}
              </div>
              {it.estado === "analizando" && <div className="count-note"><span className="spinner" /> Revisando el archivo…</div>}
              {it.plan?.explicacion && it.estado !== "rechazado" && <p className="agente-imp-texto">{it.plan.explicacion}</p>}
              {(it.estado === "listo" || it.estado === "importando") && <p className="count-note">{resumenPrevia(it)}</p>}
              {(it.plan?.advertencias || []).map((a, i) => <div key={i} className="importar-nova-aviso" role="alert">{a}</div>)}
              {it.estado === "listo" && (it.plan?.preguntas || []).map((p) => (
                <fieldset key={p.id} className="agente-imp-pregunta">
                  <legend><IconAlert size={13} /> {p.texto}</legend>
                  <div className="agente-imp-opciones">
                    {p.opciones.map((o) => (
                      <label key={o.valor} className={`agente-imp-opcion${it.respuestas[p.id] === o.valor ? " elegida" : ""}`}>
                        <span>{o.etiqueta}{p.sugerida === o.valor ? " (sugerida por Nova)" : ""}</span>
                        <input type="radio" name={`p-${it.id}-${p.id}`} checked={it.respuestas[p.id] === o.valor} onChange={() => responder(it, p, o.valor)} />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {it.resultado && <p className="agente-imp-ok"><IconCheck size={13} /> {it.resultado}</p>}
              {it.error && <div className="modal-error">{it.error}</div>}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="agente-imp-pie">
          <span className="count-note">
            {analizando ? "Nova sigue revisando archivos…" : preguntasAbiertas ? `Nova tiene ${preguntasAbiertas} pregunta(s) antes de importar.` : `${porImportar.length} archivo(s) listos para importar.`}
          </span>
          <span className="spacer" />
          <button type="button" className="btn" disabled={importando} onClick={() => setItems((l) => l.filter((x) => x.estado === "listo" || x.estado === "analizando" || x.estado === "pendiente"))}>Limpiar terminados</button>
          <button type="button" className="btn btn-primary" disabled={importando || analizando || !porImportar.length || preguntasAbiertas > 0} onClick={importarTodo}>
            {importando && <span className="spinner" />} Importar todo ({porImportar.length})
          </button>
        </div>
      )}
    </div>
  );
}
