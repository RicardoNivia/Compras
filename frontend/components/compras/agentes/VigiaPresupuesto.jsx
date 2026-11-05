"use client";

import { useEffect, useMemo, useState } from "react";
import { vigiaPresupuestoApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { crossfade } from "@/lib/crossfade";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconMoney, IconAlert, IconCheck, IconTrendUp, IconClock } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import LecturaNova from "@/components/compras/agentes/LecturaNova";

const ESTADOS = {
  excedido: { txt: "Ya se pasó", clase: "alerta" },
  se_agota: { txt: "Se agota antes de fin de año", clase: "alerta" },
  justo: { txt: "Llega justo", clase: "atencion" },
  ok: { txt: "Va bien", clase: "ok" },
  sin_presupuesto: { txt: "Sin presupuesto", clase: "info" },
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function Fila({ a, abierta, onToggle }) {
  const e = ESTADOS[a.estado];
  const usado = a.presupuesto ? Math.min(100, (a.gastado / a.presupuesto) * 100) : 0;
  const proy = a.presupuesto ? Math.min(100, (a.proyeccion / a.presupuesto) * 100) : 0;
  const maxMes = Math.max(1, ...a.porMes);
  return (
    <li className={`ag-vigia ${e.clase}`}>
      <button type="button" className="ag-vigia-cabeza" onClick={onToggle} aria-expanded={abierta}>
        <div className="ag-vigia-nombre">
          <strong>{a.etiqueta}</strong>
          <span className={`ag-pill ${e.clase}`}>{e.txt}</span>
        </div>
        <div className="ag-vigia-barra" aria-hidden="true">
          <i className="proy" style={{ width: `${proy}%` }} />
          <i className="usado" style={{ width: `${usado}%` }} />
        </div>
        <div className="ag-vigia-cifras">
          <span><b>{fmtCOP(a.gastado)}</b> de {fmtCOP(a.presupuesto)} ({pct(a.pct)})</span>
          <span>Al ritmo actual cerraría en <b>{fmtCOP(a.proyeccion)}</b> ({pct(a.pctProyectado)})</span>
          <span>{a.agotaEn ? (a.agotaEn.yaExcedido ? "Ya se agotó" : <>Se agotaría en <b>{a.agotaEn.mes}</b></>) : "No se agota este año"}</span>
        </div>
      </button>
      {abierta && (
        <div className="ag-vigia-detalle">
          <div className="ag-vigia-meses" aria-label="Gasto por mes">
            {a.porMes.map((v, i) => <span key={i} title={`${fmtCOP(v)}`}><i style={{ height: `${(v / maxMes) * 100}%` }} /><small>{MESES[i]}</small></span>)}
          </div>
          <div className="ag-vigia-top">
            <strong>Las compras que más pesan</strong>
            {a.topCompras.length === 0 && <p className="muted">Sin compras este año.</p>}
            <ul>{a.topCompras.map((c) => <li key={c.id}><span className="mono">#{c.numero ?? "—"}</span> <span className="ag-compra-desc" title={c.descripcion}>{c.descripcion}</span> <b>{fmtCOP(c.valor)}</b></li>)}</ul>
            {a.categorias?.length > 0 && (
              <>
                <strong>Por categoría</strong>
                <ul>{a.categorias.map((c) => <li key={c.etiqueta}><span className="ag-compra-desc">{c.etiqueta}</span> <span className={`ag-pill ${ESTADOS[c.estado].clase}`}>{ESTADOS[c.estado].txt}</span> <b>{fmtCOP(c.gastado)}</b> <span className="muted">de {fmtCOP(c.presupuesto)}</span></li>)}</ul>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// Vigía de presupuesto: proyección al ritmo actual de gasto (cálculo, no IA) y lectura de Nova a pedido.
export default function VigiaPresupuesto() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => {
    setDatos(null);
    setError("");
    vigiaPresupuestoApi(anio).then(setDatos).catch((e) => setError(e.message));
  }, [anio]);

  const areas = useMemo(() => (datos?.areas || []).filter((a) => filtro === "todas" || (filtro === "riesgo" ? ["excedido", "se_agota", "justo"].includes(a.estado) : a.estado === "ok")), [datos, filtro]);
  const pag = usePagina(areas, `${anio}|${filtro}`);
  const enRiesgo = (datos?.areas || []).filter((a) => a.estado === "excedido" || a.estado === "se_agota").length;

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconTrendUp size={22} />}
        color="rojo"
        titulo="Vigía de presupuesto"
        descripcion="Proyecta, al ritmo de gasto de lo que va del año, cómo cerraría cada área y en qué mes se agotaría su presupuesto. Las cifras son cálculo; Nova solo las explica si se lo pides."
        pasos={["Elige el año", "Mira las áreas en riesgo", "Abre una para ver qué compras pesan", "Pide la lectura de Nova"]}
        paso={datos ? 1 : 0}
      >
        <label className="ag-anio">Año
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[anioActual, anioActual - 1, anioActual - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </CabezaAgente>
      {error && <div className="modal-error">{error}</div>}
      {!datos && !error && <div className="skeleton-bar" style={{ height: 120, borderRadius: 16 }} />}
      {datos && datos.areas.length === 0 && <VacioAgente icono={<IconMoney size={26} />} titulo={`No hay presupuesto configurado para ${anio}`}>Configúralo en Presupuesto para que el vigía pueda proyectar.</VacioAgente>}
      {datos && datos.areas.length > 0 && (
        <>
          <section className="ag-cifras">
            <CifraAgente icono={<IconMoney size={18} />} etiqueta={`Presupuesto ${anio}`} valor={fmtCOP(datos.total)} pequena />
            <CifraAgente icono={<IconTrendUp size={18} />} etiqueta="Gastado" valor={fmtCOP(datos.gastado)} nota={`${pct(datos.total ? datos.gastado / datos.total : null)} · ${datos.mesesTranscurridos} meses transcurridos`} pequena tono="destaca" />
            <CifraAgente icono={enRiesgo ? <IconAlert size={18} /> : <IconCheck size={18} />} etiqueta="Áreas en riesgo" valor={enRiesgo} nota="Ya se pasaron o se agotan antes de fin de año" tono={enRiesgo ? "mal" : "bien"} />
            <CifraAgente icono={<IconClock size={18} />} etiqueta="Áreas con compras sin presupuesto" valor={datos.areasSinPresupuesto.length} nota={datos.areasSinPresupuesto.slice(0, 3).join(", ") || "Ninguna"} />
          </section>
          <LecturaNova cuerpo={{ tipo: "presupuesto", anio }} titulo="Qué hacer, según Nova" />
          <div className="ag-lista-card">
            <div className="ag-barra-filtros">
              <div className="ag-segmentos" role="tablist" aria-label="Filtro">
                {[["todas", "Todas"], ["riesgo", "En riesgo"], ["ok", "Van bien"]].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => crossfade(() => setFiltro(k))}>{l}</button>
                ))}
              </div>
              <span className="count-note">Barra oscura: lo gastado · barra clara: a dónde llegaría al ritmo actual</span>
            </div>
            <ul className="ag-vigias">
              {pag.pagina.map((a) => <Fila key={a.etiqueta} a={a} abierta={abierta === a.etiqueta} onToggle={() => setAbierta((x) => (x === a.etiqueta ? null : a.etiqueta))} />)}
              {areas.length === 0 && <li><VacioAgente icono={<IconCheck size={26} />} titulo="Ninguna área en esta lista" /></li>}
            </ul>
            <PiePagina id="ag-vigia-size" p={pag} total={areas.length} etiqueta="área(s)" />
          </div>
        </>
      )}
    </div>
  );
}
