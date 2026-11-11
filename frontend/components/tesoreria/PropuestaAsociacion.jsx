"use client";

import { IconSpark, IconCheck, IconArrowRight } from "@/components/icons";
import { MESES, fechaCorta } from "@/components/tesoreria/comun";

const CONFIANZA = { alta: "alta", media: "media", baja: "baja" };

function Texto({ v, ancho = 300 }) {
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap" style={{ maxWidth: ancho }}>
      <span className="desc-text">{v}</span>
      <span className="desc-tooltip-bubble">{v}</span>
    </span>
  );
}

// Una propuesta del agente de asociación con el mismo diseño de los agentes de Compras y Bienestar (ag-propuesta): la
// tarjeta toma el color de su confianza (verde alta, ámbar media, rojizo baja). La usan la página de Agentes y el paso
// 3 de Conciliación. p: { id, confianza, motivo, valorTexto, movimiento: {...}, pago: {...} } o null en `pago` si no hay.
export default function PropuestaAsociacion({ movimiento: m, pago, confianza, motivo, valorTexto, resuelta, puede, ocupado, onAceptar, onDescartar, onAMano }) {
  return (
    <li className={`ag-propuesta${confianza ? ` conf-${confianza}` : " conf-ninguna"}`}>
      <div className="ag-prop-compra">
        <span className="ag-etiqueta">Movimiento · {m.banco ? `${m.banco} · ` : ""}{fechaCorta(m.fecha)}</span>
        <Texto v={m.descripcion} ancho={340} />
        <span className="ag-prop-meta">
          <Texto v={m.concepto ? `Concepto: ${m.concepto}` : m.tercero ? `Tercero: ${m.tercero}` : "Sin concepto"} ancho={220} />
          <b className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{m.tipo === "debito" ? "−" : "+"}{m.valorTexto}</b>
        </span>
      </div>
      <span className="ag-flecha" aria-hidden="true"><IconArrowRight size={18} /></span>
      <div className="ag-prop-actividad">
        <span className="ag-etiqueta">{pago ? "Pago programado propuesto" : "Resultado"}</span>
        {pago ? <span className="ag-prop-nombre"><Texto v={pago.concepto} ancho={300} /></span> : <span className="muted">El agente no encontró un pago parecido</span>}
        <span className="ag-prop-meta">
          {pago && <span>{[pago.item, pago.mes ? `${MESES[pago.mes - 1]} ${pago.anio}` : null, pago.estado === "E" ? "E sin movimiento" : "P pendiente"].filter(Boolean).join(" · ")}</span>}
          {pago && <b className="tes-num">{pago.valorTexto}</b>}
          {confianza && <span className={`agente-conf ${confianza}`}>Confianza {CONFIANZA[confianza]}</span>}
        </span>
      </div>
      <div className="ag-prop-razon">
        <span className="ag-etiqueta"><IconSpark size={12} /> Por qué</span>
        <Texto v={motivo ? `${motivo}${valorTexto ? ` · se asociarían ${valorTexto}` : ""}` : pago ? null : "Asócialo a mano o créalo como pago extraordinario."} ancho={320} />
      </div>
      <div className="ag-prop-acciones">
        {resuelta ? (
          <span className="ag-resuelta">{resuelta === "aceptar" ? "Asociado · el pago quedó en E" : "Descartada"}</span>
        ) : puede ? (
          <>
            {pago && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={onAceptar}>{ocupado ? <span className="spinner" /> : <IconCheck size={14} />} Asociar</button>}
            {pago && <button type="button" className="btn ag-btn-suave" disabled={ocupado} onClick={onDescartar}>Descartar</button>}
            {onAMano && <button type="button" className="btn ag-btn-suave" disabled={ocupado} onClick={onAMano}>{pago ? "Otro pago" : "Asociar a mano"}</button>}
          </>
        ) : null}
      </div>
    </li>
  );
}
