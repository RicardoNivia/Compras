"use client";

import { useEffect, useState } from "react";
import { fetchSalariosMinimosApi, guardarSalarioMinimoApi, eliminarSalarioMinimoApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconEdit, IconTrash } from "@/components/icons";
import MoneyInput from "@/components/MoneyInput";

// Salario mínimo mensual legal vigente (SMMLV) por año. Con él se mide el umbral del cuadro comparativo del
// procedimiento de compras (2 SMMLV administrativas, 4 técnicas) en el agente cotizador.
export default function ConfigSalarioMinimo() {
  const anioActual = new Date().getFullYear();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState({ anio: anioActual + 1, valor: "", norma: "" });
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = () => fetchSalariosMinimosApi().then(setDatos).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const salarios = datos?.salarios || [];
  const pag = usePagina(salarios, "", 25);
  const v = datos?.vigente;

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setAviso("");
    setGuardando(true);
    try {
      const { salario } = await guardarSalarioMinimoApi({ anio: Number(form.anio), valor: Number(form.valor), norma: form.norma });
      setAviso(`Guardado el salario mínimo ${salario.anio}: ${fmtCOP(salario.valor)}.`);
      setForm({ anio: anioActual + 1, valor: "", norma: "" });
      setEditando(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(anio) {
    setError("");
    try {
      await eliminarSalarioMinimoApi(anio);
      setBorrar(null);
      setAviso(`Se eliminó el salario mínimo ${anio}.`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="prov-panel" aria-labelledby="smmlv-t">
      <div className="prov-panel-head">
        <h2 id="smmlv-t">Salario mínimo (SMMLV)</h2>
        <span className="muted">Con él se mide si una compra exige cuadro comparativo: más de 2 SMMLV en compras administrativas y 4 SMMLV en técnicas.</span>
      </div>
      <div className="prov-reloj" aria-label="Salario mínimo vigente">
        <div><span className="muted">Vigente</span><strong>{v ? `${fmtCOP(v.valor)} (${v.anio})` : "Sin registrar"}</strong></div>
        <div><span className="muted">2 SMMLV · administrativas</span><strong className="mono">{v ? fmtCOP(2 * v.valor) : "—"}</strong></div>
        <div><span className="muted">4 SMMLV · técnicas</span><strong className="mono">{v ? fmtCOP(4 * v.valor) : "—"}</strong></div>
      </div>
      {v && !v.exacto && <p className="prov-note">No hay salario mínimo de {v.anioPedido}: mientras tanto se usa el de {v.anio}. Regístralo cuando salga el decreto.</p>}
      {v?.norma && <p className="prov-note">Norma: {v.norma}</p>}

      <form onSubmit={guardar} className="prov-config-form">
        <label>Año
          <input type="number" min={2000} max={2100} value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} disabled={editando} />
        </label>
        <label>Valor mensual (pesos)
          <MoneyInput value={form.valor} onChange={(x) => setForm({ ...form, valor: x })} placeholder="Ej. 1.750.905" ariaLabel="Valor del salario mínimo" />
        </label>
        <label>Decreto (opcional)
          <input value={form.norma} onChange={(e) => setForm({ ...form, norma: e.target.value })} placeholder="Ej. Decreto 1469 de 2025" />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={guardando || !form.valor}>{guardando ? "Guardando…" : editando ? "Guardar cambio" : "Agregar año"}</button>
          {editando && <button type="button" className="btn" onClick={() => { setEditando(false); setForm({ anio: anioActual + 1, valor: "", norma: "" }); }}>Cancelar</button>}
        </div>
      </form>
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {error && <div className="modal-error">{error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="records" style={{ minWidth: 0 }}>
            <thead><tr><th>Año</th><th className="num">Valor mensual</th><th>Norma</th><th>Registrado / actualizado</th><th className="actions-col">Acciones</th></tr></thead>
            <tbody>
              {!datos && <tr><td colSpan={5}><div className="skeleton-bar" style={{ height: 30, borderRadius: 8 }} /></td></tr>}
              {datos && salarios.length === 0 && <tr><td colSpan={5}><div className="empty">Aún no hay salarios mínimos registrados.</div></td></tr>}
              {pag.pagina.map((s) => (
                <tr key={s.anio}>
                  <td className="mono">{s.anio}</td>
                  <td className="num">{fmtCOP(s.valor)}</td>
                  <td><span className="desc-tooltip-wrap" style={{ maxWidth: 280 }}><span className="desc-text">{s.norma || "—"}</span>{s.norma && <span className="desc-tooltip-bubble">{s.norma}</span>}</span></td>
                  <td className="muted">{s.actualizadoPorNombre ? `${s.actualizadoPorNombre} · ${new Date(s.updatedAt).toLocaleDateString("es-CO")}` : `${s.creadoPorNombre || "—"} · ${new Date(s.createdAt).toLocaleDateString("es-CO")}`}</td>
                  <td className="actions-cell">
                    <button type="button" className="icon-action-btn" aria-label={`Editar ${s.anio}`} title="Editar" onClick={() => { setEditando(true); setForm({ anio: s.anio, valor: s.valor, norma: s.norma || "" }); }}><IconEdit size={14} /></button>
                    {borrar === s.anio
                      ? <><button type="button" className="btn small" onClick={() => eliminar(s.anio)}>Sí, eliminar</button><button type="button" className="btn small" onClick={() => setBorrar(null)}>No</button></>
                      : <button type="button" className="icon-action-btn" aria-label={`Eliminar ${s.anio}`} title="Eliminar" onClick={() => setBorrar(s.anio)}><IconTrash size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PiePagina id="smmlv-size" p={pag} total={salarios.length} etiqueta="año(s)" />
      </div>
    </section>
  );
}
