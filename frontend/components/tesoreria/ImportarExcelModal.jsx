"use client";

import { useState } from "react";
import { Portal } from "@/components/notificaciones/ui";
import { fmtMoneda } from "@/lib/moneda";
import { IconFile, IconSpark, IconCheck, IconAlert } from "@/components/icons";

// Importar la plantilla Excel de flujo de caja: subir → Nova analiza (sin escribir nada) → vista previa → confirmar.
// La carga usa el mismo núcleo que el script de consola (backend/lib/tesoreria/importadorExcel.js).
const CAMPO = { item: "Ítem", tipo: "Tipo (ingreso/egreso)", estado: "Estado", concepto: "Concepto", medio: "Medio de pago (cuenta)", paga: "Paga", anio: "Año", mes: "Mes", fecha: "Fecha", valor: "Valor" };
const MAESTRO = { cuentas: "Cuentas", items: "Ítems", conceptos: "Conceptos", pagadores: "Quién paga" };
const FASES = ["Revisando el archivo", "Buscando la hoja del libro", "Leyendo columnas y códigos", "Unificando maestros", "Nova revisa el plan"];
const letra = (i) => { let s = ""; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export default function ImportarExcelModal({ acceso, onClose, onListo }) {
  const [paso, setPaso] = useState("subir"); // subir | analizando | vista | aplicando | listo
  const [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null);
  const [modo, setModo] = useState("agregar");
  const [entiendo, setEntiendo] = useState(false);
  const [abiertos, setAbiertos] = useState({});
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [fase, setFase] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);

  async function analizar(f) {
    if (!f) return;
    setArchivo(f); setError(""); setPaso("analizando"); setFase(0);
    const t = setInterval(() => setFase((x) => Math.min(FASES.length - 1, x + 1)), 1800);
    try {
      const form = new FormData();
      form.set("archivo", f);
      const r = await api("/api/tesoreria/importar/analizar", { method: "POST", body: form });
      setVista(r);
      setModo(r.puedeAgregar ? "agregar" : "reemplazar");
      setPaso("vista");
    } catch (e) { setError(e.message); setPaso("subir"); } finally { clearInterval(t); }
  }

  async function aplicar() {
    setPaso("aplicando"); setError("");
    try {
      setResultado(await api("/api/tesoreria/importar/aplicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: vista.token, modo }) }));
      setPaso("listo");
    } catch (e) { setError(e.message); setPaso("vista"); }
  }

  const r = vista?.resumen;
  const puedeConfirmar = paso === "vista" && (modo === "agregar" ? vista?.puedeAgregar : acceso?.puedeFirmar && entiendo);

  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && paso !== "analizando" && paso !== "aplicando") onClose(); }}>
        <div className="modal tes-imp" role="dialog" aria-modal="true" aria-label="Importar plantilla Excel" style={{ maxWidth: 920, width: "100%" }}>
          <div className="modal-head">
            <div><h3 style={{ margin: 0 }}>Importar plantilla Excel</h3><span className="card-sub">El libro de flujo de caja con sus extractos. Nada se guarda hasta que confirmes.</span></div>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar" disabled={paso === "analizando" || paso === "aplicando"}>✕</button>
          </div>
          <div className="modal-body tes-modal-body">
            {error && <p className="tes-nova-no" role="alert"><IconAlert size={16} /><span>{error}</span></p>}

            {paso === "subir" && (
              <label className={`tca-drop${arrastrando ? " sobre" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={(e) => { e.preventDefault(); setArrastrando(false); analizar(e.dataTransfer.files?.[0]); }}>
                <span className="tca-drop-icono" aria-hidden="true"><IconFile size={26} /></span>
                <strong>Suelta aquí la plantilla de flujo de caja</strong>
                <span>Excel (.xlsx) con la hoja de movimientos (como «Detalle 2026») y, si quieres, las hojas de extractos («Mvto …»). Si las columnas se llaman distinto, Nova las reconoce.</span>
                <span className="btn btn-primary ag-btn-grande">Elegir archivo</span>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => { analizar(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}

            {(paso === "analizando" || paso === "aplicando") && (
              <div className="tca-corriendo" role="status">
                <div className="tca-orbe" aria-hidden="true"><span /><span /><span /><IconSpark size={26} /></div>
                <strong>{paso === "analizando" ? `${FASES[fase]}…` : "Cargando la información…"}</strong>
                <span>{archivo?.name}</span>
                {paso === "analizando" && <ol className="tca-fases">{FASES.map((t, i) => <li key={t} className={fase > i ? "hecho" : fase === i ? "actual" : ""}>{t}</li>)}</ol>}
              </div>
            )}

            {paso === "vista" && r && (
              <>
                <div className="tes-imp-cab">
                  <span className="tca-ya-icono" aria-hidden="true"><IconFile size={20} /></span>
                  <div>
                    <strong>{vista.archivo}</strong>
                    <span>Hoja del libro: «{r.libro.hoja}» · {r.libro.origen === "nova" ? "columnas leídas por Nova" : "columnas reconocidas solas"} · años {r.anios.join(", ")}</span>
                  </div>
                </div>
                {vista.mapeoNova && <p className="ag-aviso tca-nova"><IconSpark size={15} /> <span>{vista.mapeoNova}</span></p>}
                {vista.nova?.lectura && (
                  <div className="ag-aviso tca-nova tes-imp-nova">
                    <IconSpark size={15} />
                    <div><strong>Lectura de Nova</strong><p>{vista.nova.lectura}</p>{vista.nova.revisar?.length > 0 && <ul>{vista.nova.revisar.map((x) => <li key={x}>{x}</li>)}</ul>}</div>
                  </div>
                )}

                <div className="tes-imp-cifras">
                  <div><strong>{r.movimientos.toLocaleString("es-CO")}</strong><span>movimientos ({r.proyectados} proyectados)</span></div>
                  <div><strong>{r.traslados}</strong><span>traslados entre cuentas propias</span></div>
                  <div><strong>{r.extractos.reduce((a, e) => a + e.lineas, 0).toLocaleString("es-CO")}</strong><span>líneas de extracto</span></div>
                  <div><strong>{r.enCero}</strong><span>filas en cero (se omiten)</span></div>
                </div>
                {r.fechaAproximada && <p className="prov-note" style={{ margin: 0 }}>La plantilla trae solo el mes: los movimientos quedan con fecha aproximada (día 1) y toman la fecha real al conciliarlos con el banco.</p>}

                <h4 className="tes-sub">Maestros</h4>
                <div className="tes-imp-maestros">
                  {Object.entries(r.maestros).map(([k, m]) => (
                    <div key={k} className="tes-imp-maestro">
                      <span>{MAESTRO[k]}</span>
                      <strong>{m.total}</strong>
                      {m.nuevos.length ? (
                        <button type="button" className="btn-ghost tes-imp-nuevos" onClick={() => setAbiertos((x) => ({ ...x, [k]: !x[k] }))} aria-expanded={!!abiertos[k]}>{m.nuevos.length} nuevo(s) {abiertos[k] ? "▴" : "▾"}</button>
                      ) : <small className="tes-pos">Ya existen todos</small>}
                    </div>
                  ))}
                </div>
                {Object.entries(abiertos).filter(([, v]) => v).map(([k]) => (
                  <div key={k} className="tes-imp-chips"><span>{MAESTRO[k]} nuevos:</span>{r.maestros[k].nuevos.slice(0, 60).map((n) => <span key={n} className="tes-chip">{n}</span>)}{r.maestros[k].nuevos.length > 60 && <span className="muted">y {r.maestros[k].nuevos.length - 60} más</span>}</div>
                ))}

                <div className="tes-dos">
                  <div>
                    <h4 className="tes-sub">Columnas leídas</h4>
                    <ul className="tes-lista">{Object.entries(vista.columnas).map(([c, i]) => <li key={c}><span><strong>{CAMPO[c] || c}</strong></span><span className="tes-chip">Columna {letra(i)}</span></li>)}</ul>
                  </div>
                  <div>
                    <h4 className="tes-sub">Extractos y saldos iniciales</h4>
                    <ul className="tes-lista">
                      {r.extractos.map((e) => <li key={e.hoja}><span><strong>«{e.hoja}» → {e.cuenta}</strong><small>{e.lineas} líneas · {e.coincidencias} coinciden con el libro</small></span></li>)}
                      {r.saldos.map((s) => <li key={s.cuenta}><span><strong>Saldo inicial {s.cuenta}</strong><small>{s.fecha}</small></span><strong>{fmtMoneda(s.valor, "COP")}</strong></li>)}
                      {!r.extractos.length && !r.saldos.length && <li><span className="muted">La plantilla no trae extractos ni saldos iniciales.</span></li>}
                    </ul>
                  </div>
                </div>
                {r.avisos.length > 0 && <div className="tes-imp-avisos">{r.avisos.map((a) => <p key={a}><IconAlert size={13} /> {a}</p>)}</div>}

                <h4 className="tes-sub">¿Cómo la cargo?</h4>
                <div className="tes-imp-modos" role="radiogroup" aria-label="Modo de carga">
                  <label className={`tes-imp-modo${modo === "agregar" ? " activo" : ""}${!vista.puedeAgregar ? " deshabilitado" : ""}`}>
                    <span><strong>Agregar y actualizar</strong><small>{vista.puedeAgregar ? "Crea lo nuevo y pasa a ejecutado lo que en esta versión ya se pagó. Lo que ya estaba no se duplica." : "No disponible: hay movimientos importados antes de que cada fila llevara su huella y se duplicarían. Usa «Reemplazar todo» una vez."}</small></span>
                    <input type="radio" name="modo" checked={modo === "agregar"} disabled={!vista.puedeAgregar} onChange={() => setModo("agregar")} />
                  </label>
                  <label className={`tes-imp-modo peligro${modo === "reemplazar" ? " activo" : ""}${!acceso?.puedeFirmar ? " deshabilitado" : ""}`}>
                    <span><strong>Reemplazar todo</strong><small>{acceso?.puedeFirmar ? `Borra antes TODO lo de Tesorería${vista.yaHayDatos ? ` (${vista.yaHayDatos.toLocaleString("es-CO")} movimientos, extractos, reglas, recurrentes y cierres)` : ""} y carga solo esta plantilla.` : "Solo quien tiene acceso de firma."}</small></span>
                    <input type="radio" name="modo" checked={modo === "reemplazar"} disabled={!acceso?.puedeFirmar} onChange={() => setModo("reemplazar")} />
                  </label>
                </div>
                {modo === "reemplazar" && <label className="tes-check"><span>Entiendo que se borra todo lo que hay en Tesorería y no se puede deshacer</span><input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} /></label>}
              </>
            )}

            {paso === "listo" && resultado && (
              <div className="tes-imp-listo">
                <span className="tca-ya-icono" aria-hidden="true"><IconCheck size={22} /></span>
                <strong>Plantilla cargada</strong>
                <ul className="tes-lista">
                  <li><span>Movimientos nuevos</span><strong>{resultado.movimientosNuevos.toLocaleString("es-CO")}</strong></li>
                  <li><span>Pasaron de proyectado a ejecutado</span><strong>{resultado.movimientosActualizados}</strong></li>
                  <li><span>Ya estaban (no se duplicaron)</span><strong>{resultado.movimientosIguales.toLocaleString("es-CO")}</strong></li>
                  {resultado.omitidosPorMesFirmado > 0 && <li><span>Omitidos por estar en un mes firmado</span><strong>{resultado.omitidosPorMesFirmado}</strong></li>}
                  {resultado.extractos.map((e) => <li key={e.hoja}><span>Extracto {e.cuenta}: {e.lineasNuevas} líneas nuevas</span><strong>{e.enlazadas} enlazadas solas</strong></li>)}
                  <li><span>Reglas de clasificación nuevas</span><strong>{resultado.reglasNuevas}</strong></li>
                </ul>
              </div>
            )}
          </div>
          <div className="modal-foot">
            {paso === "vista" && <button type="button" className="btn" onClick={() => { setVista(null); setPaso("subir"); }}>Subir otro archivo</button>}
            <div className="spacer" />
            {paso === "vista" && <button type="button" className={`btn ${modo === "reemplazar" ? "btn-danger-solid" : "btn-primary"}`} onClick={aplicar} disabled={!puedeConfirmar}><IconCheck size={13} /> {modo === "reemplazar" ? "Reemplazar todo y cargar" : "Cargar la plantilla"}</button>}
            {paso === "listo" && <button type="button" className="btn btn-primary" onClick={onListo}>Ver los movimientos</button>}
            {(paso === "subir") && <button type="button" className="btn" onClick={onClose}>Cancelar</button>}
          </div>
        </div>
      </div>
    </Portal>
  );
}
