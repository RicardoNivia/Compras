"use client";

import { useState } from "react";
import { updateConfigProveedoresApi } from "@/lib/api";

// Fecha de corte del ciclo de actualización de proveedores. Un cambio aplica
// desde el próximo ciclo: el ciclo vigente conserva sus fechas (ver
// lib/proveedoresCicloReglas.js).
export default function ConfigCicloProveedores({ initial }) {
  const [config, setConfig] = useState(initial);
  const [guardado, setGuardado] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setGuardado("");
    try {
      const nuevo = await updateConfigProveedoresApi({
        diaCorte: Number(config.diaCorte),
        mesCorte: Number(config.mesCorte),
        diasAviso: Number(config.diasAviso),
      });
      setConfig(nuevo);
      setGuardado("Guardado. Aplica desde el próximo ciclo.");
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="prov-panel" aria-labelledby="cfg-prov-t">
      <div className="prov-panel-head">
        <h2 id="cfg-prov-t">Ciclo de actualización de proveedores</h2>
        <span className="muted">Al día siguiente del corte, todos los proveedores de Actualización pasan a Desactualizado.</span>
      </div>
      <div className="prov-reloj" aria-label="Hora del servidor y ciclo vigente">
        <div><span className="muted">Hora y fecha del servidor (Colombia)</span><strong className="mono">{config.ahoraColombia}</strong></div>
        <div><span className="muted">Ciclo vigente</span><strong>{config.cicloVigente} · {config.inicioCiclo} → {config.finCiclo}</strong></div>
        <div><span className="muted">Días para el corte</span><strong className="mono">{config.diasParaCorte}</strong></div>
      </div>
      <p className="prov-note">La validación del ciclo usa siempre el reloj del servidor, no el del navegador ni el de tu equipo.</p>
      <form onSubmit={guardar} className="prov-config-form">
        <label>Día de corte
          <input type="number" min={1} max={31} value={config.diaCorte} onChange={(e) => setConfig({ ...config, diaCorte: e.target.value })} />
        </label>
        <label>Mes de corte
          <select value={config.mesCorte} onChange={(e) => setConfig({ ...config, mesCorte: e.target.value })}>
            {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label>Días de aviso antes del corte
          <input type="number" min={0} max={365} value={config.diasAviso} onChange={(e) => setConfig({ ...config, diasAviso: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primary small" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
      </form>
      {guardado && <p className="prov-note" role="status">{guardado}</p>}
      {error && <div className="modal-error" role="alert">{error}</div>}
    </section>
  );
}
