"use client";

import { useEffect, useState } from "react";
import { importarConNovaApi } from "@/lib/api";

const TITULOS = {
  programados: "Importar programados",
  asistentes: "Importar asistentes",
  calificaciones: "Importar calificaciones",
};
const CAMPOS = {
  nombre: "Nombre", nombres: "Nombres", apellidos: "Apellidos", documento: "Documento", area: "Área", correo: "Correo",
  asistencia: "Asistencia", motivo: "Motivo", calificacion: "Calificación", observacion: "Comentario",
};
const siNo = (v) => (v === true ? "Sí" : v === false ? "No" : "—");

// Importar un Excel con Nova: Nova lee el archivo y dice cómo está armado, aquí se ve qué se va a cargar (nada se ha
// escrito todavía) y solo al confirmar se aplica, con el mismo mapeo de la vista previa.
export default function ImportarNovaModal({ actividadId, tipo, archivo, onClose, onListo }) {
  const [previa, setPrevia] = useState(null);
  const [noMarcados, setNoMarcados] = useState(false);
  const [trabajando, setTrabajando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    importarConNovaApi(actividadId, archivo, { tipo })
      .then((r) => { if (vigente) setPrevia(r); })
      .catch((e) => { if (vigente) setError(e.message || "Nova no pudo leer el archivo."); })
      .finally(() => { if (vigente) setTrabajando(false); });
    return () => { vigente = false; };
  }, [actividadId, archivo, tipo]);

  // Cambiar la casilla recalcula la vista previa con el mismo mapeo, sin volver a llamar a Nova.
  async function cambiarNoMarcados(valor) {
    setNoMarcados(valor);
    setTrabajando(true);
    setError("");
    try {
      setPrevia(await importarConNovaApi(actividadId, archivo, { tipo, mapeo: previa.mapeo, noMarcadosNoAsistieron: valor }));
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar() {
    setTrabajando(true);
    setError("");
    try {
      const r = await importarConNovaApi(actividadId, archivo, { tipo, mapeo: previa.mapeo, noMarcadosNoAsistieron: noMarcados, confirmar: true });
      const x = r.resultado;
      onListo(`${TITULOS[tipo].replace("Importar ", "")[0].toUpperCase()}${TITULOS[tipo].replace("Importar ", "").slice(1)}: ${x.creados} nuevos, ${x.actualizados} actualizados${x.sinCoincidencia ? `, ${x.sinCoincidencia} sin coincidencia` : ""}${x.marcadosNo ? `, ${x.marcadosNo} marcados como no asistieron` : ""}.`);
    } catch (e) {
      setError(e.message || "No se pudo cargar el archivo.");
      setTrabajando(false);
    }
  }

  const r = previa?.resultado;
  const sinCambios = r && !r.creados && !r.actualizados && !r.marcadosNo;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !trabajando) onClose(); }}>
      <div className="modal importar-nova" role="dialog" aria-modal="true" aria-labelledby="importar-nova-titulo">
        <div className="modal-head">
          <div>
            <h2 id="importar-nova-titulo" style={{ margin: 0 }}>{TITULOS[tipo]}</h2>
            <span className="count-note">{archivo.name}</span>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={trabajando} aria-label="Cerrar">✕</button>
        </div>
        <div className="importar-nova-body">
          {!previa && trabajando && <div className="empty"><span className="spinner" /> Nova está leyendo el archivo…</div>}
          {error && <div className="modal-error">{error}</div>}
          {previa && (
            <>
              <p className="importar-nova-explica">{previa.mapeo.explicacion || `Hoja "${previa.hoja}".`}</p>
              {previa.mapeo.advertencias.map((a, i) => <div key={i} className="importar-nova-aviso" role="alert">{a}</div>)}

              <div className="importar-nova-columnas" aria-label="Columnas que Nova identificó">
                <span className="count-note">Hoja «{previa.hoja}»:</span>
                {previa.columnas.map((c) => <span key={c.campo} className="actividad-chip"><b>{CAMPOS[c.campo] || c.campo}</b> ← {c.encabezado}</span>)}
              </div>

              <div className="actividad-cifras">
                <div><span>Filas leídas</span><strong>{r.leidos}</strong></div>
                <div><span>Personas nuevas</span><strong>{r.creados}</strong></div>
                <div><span>Se actualizan</span><strong>{r.actualizados}</strong></div>
                {r.sinCoincidencia > 0 && <div><span>Sin coincidencia</span><strong>{r.sinCoincidencia}</strong></div>}
                {r.marcadosNo > 0 && <div><span>Quedan como no asistieron</span><strong>{r.marcadosNo}</strong></div>}
                {previa.descartadas > 0 && <div><span>Filas descartadas</span><strong>{previa.descartadas}</strong></div>}
              </div>
              {tipo !== "programados" && r.creados > 0 && (
                <p className="count-note">Las personas nuevas no estaban programadas: se agregan como asistentes no inscritos. {r.nuevos.slice(0, 6).join(", ")}{r.creados > 6 ? "…" : ""}</p>
              )}

              {tipo === "asistentes" && (
                <label htmlFor="importar-nomarcados" className="actividad-check">
                  <span>Los programados que no aparezcan en el archivo, no asistieron</span>
                  <input id="importar-nomarcados" type="checkbox" checked={noMarcados} disabled={trabajando} onChange={(e) => cambiarNoMarcados(e.target.checked)} />
                </label>
              )}

              <div className="table-scroll">
                <table className="plain-table importar-nova-tabla">
                  <caption className="count-note">Primeras {previa.muestra.length} filas, como quedarían</caption>
                  <thead>
                    <tr>
                      <th>Nombre</th><th>Documento</th><th>Área</th>
                      {tipo !== "calificaciones" && <th>Asistió</th>}
                      {tipo !== "programados" && <th className="num">Calificación</th>}
                      <th>Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.muestra.map((m, i) => (
                      <tr key={i}>
                        <td><span className="desc-tooltip-wrap"><span className="desc-text">{m.nombre}</span><span className="desc-tooltip-bubble">{m.nombre}</span></span></td>
                        <td className="mono">{m.documento || "—"}</td>
                        <td className="truncate">{m.area || "—"}</td>
                        {tipo !== "calificaciones" && <td>{siNo(m.asistio)}</td>}
                        {tipo !== "programados" && <td className="num">{m.calificacion ?? "—"}</td>}
                        <td><span className="desc-tooltip-wrap"><span className="desc-text">{m.observacion || "—"}</span>{m.observacion && <span className="desc-tooltip-bubble">{m.observacion}</span>}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          {previa && (
            <button type="button" className="btn btn-primary" onClick={confirmar} disabled={trabajando || sinCambios}>
              {trabajando && <span className="spinner" />} {sinCambios ? "No hay nada por cargar" : "Cargar a la actividad"}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={trabajando}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
