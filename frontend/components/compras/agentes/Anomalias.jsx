"use client";

import { useEffect, useMemo, useState } from "react";
import { anomaliasApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { crossfade } from "@/lib/crossfade";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconAlert, IconCopy, IconTrendUp, IconBuilding, IconSearch, IconLayers } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import LecturaNova from "@/components/compras/agentes/LecturaNova";

const TIPOS = [
  ["fraccionamiento", "Compras partidas", IconLayers, "Misma necesidad al mismo proveedor en 30 días: cada una bajo 2 SMMLV y juntas por encima."],
  ["duplicado", "Posibles duplicados", IconCopy, "Mismo proveedor, descripción y valor en pocos días."],
  ["precio", "Precios disparados", IconTrendUp, "El doble o más de lo pagado antes por algo parecido."],
  ["concentracion", "Gasto concentrado", IconBuilding, "Un proveedor con más del 40 % del gasto de un área."],
];
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const haceUnAnio = () => { const h = hoy(); return `${Number(h.slice(0, 4)) - 1}${h.slice(4)}`; };

// Detector de anomalías: señales a revisar (no acusaciones), calculadas por el sistema; Nova las prioriza a pedido.
export default function Anomalias() {
  const [desde, setDesde] = useState(haceUnAnio);
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState("");
  const [buscando, setBuscando] = useState(false);

  function buscar() {
    setBuscando(true);
    setError("");
    anomaliasApi(desde, hasta).then(setDatos).catch((e) => setError(e.message)).finally(() => setBuscando(false));
  }
  useEffect(() => { buscar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => (datos?.hallazgos || []).filter((h) => !tipo || h.tipo === tipo), [datos, tipo]);
  const pag = usePagina(lista, `${tipo}|${datos?.desde}|${datos?.hasta}`);

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconAlert size={22} />}
        color="morado"
        titulo="Detector de anomalías"
        descripcion="Busca en las compras lo que no se ve a simple vista: compras partidas para no pasar el umbral del cuadro comparativo, posibles duplicados, precios que se dispararon y gasto concentrado en un proveedor. Son señales para revisar: pueden tener explicación."
        pasos={["Elige el período", "El sistema revisa todas las compras", "Filtra por tipo y revisa cada señal", "Pide a Nova qué revisar primero"]}
        paso={datos ? 2 : 1}
      >
        <div className="ag-periodo">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          <button type="button" className="btn btn-primary ag-btn-grande" onClick={buscar} disabled={buscando}>{buscando ? <><span className="spinner" /> Revisando…</> : <><IconSearch size={15} /> Revisar</>}</button>
        </div>
      </CabezaAgente>
      {error && <div className="modal-error">{error}</div>}
      {!datos && !error && <div className="skeleton-bar" style={{ height: 120, borderRadius: 16 }} />}
      {datos && (
        <>
          <section className="ag-cifras">
            {TIPOS.map(([k, l, Icono, nota]) => (
              <button key={k} type="button" className={`ag-cifra-boton ${tipo === k ? "activa" : ""}`} onClick={() => crossfade(() => setTipo((t) => (t === k ? "" : k)))} aria-pressed={tipo === k}>
                <CifraAgente icono={<Icono size={18} />} etiqueta={l} valor={datos.conteo[k] || 0} nota={nota} tono={k === "fraccionamiento" || k === "duplicado" ? (datos.conteo[k] ? "mal" : "bien") : ""} />
              </button>
            ))}
          </section>
          <LecturaNova cuerpo={{ tipo: "anomalias", desde: datos.desde, hasta: datos.hasta }} titulo="Qué revisar primero, según Nova" deshabilitado={!datos.hallazgos.length} />
          <div className="ag-lista-card">
            <div className="ag-barra-filtros">
              <span className="count-note">{datos.revisadas} compras revisadas del {datos.desde} al {datos.hasta}{tipo ? ` · filtro: ${TIPOS.find((t) => t[0] === tipo)[1]}` : ""}</span>
              {tipo && <button type="button" className="btn small" onClick={() => setTipo("")}>Ver todas</button>}
            </div>
            <ul className="ag-hallazgos ag-pad">
              {lista.length === 0 && <li><VacioAgente icono={<IconSearch size={26} />} titulo="Sin señales en esta lista" /></li>}
              {pag.pagina.map((h, i) => (
                <li key={`${h.titulo}-${i}`} className={`ag-hallazgo ${h.nivel}`}>
                  <span className="ag-hallazgo-icono" aria-hidden="true"><IconAlert size={14} /></span>
                  <div>
                    <strong>{h.titulo}</strong>
                    <p>{h.detalle}</p>
                    <div className="ag-chips">
                      {h.compras.map((c) => <span key={c.id} title={`${c.descripcion} · ${c.area || ""}`}>#{c.numero ?? "—"} · {c.fecha || "sin fecha"} · {c.valor != null ? fmtCOP(c.valor) : "—"}</span>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <PiePagina id="ag-anom-size" p={pag} total={lista.length} etiqueta="señal(es)" />
          </div>
        </>
      )}
    </div>
  );
}
