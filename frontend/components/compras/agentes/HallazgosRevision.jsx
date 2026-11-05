"use client";

import { fmtCOP } from "@/lib/format";
import { IconAlert, IconCheck, IconInfo, IconSpark } from "@/components/icons";

const NIVEL = {
  alerta: { clase: "alerta", Icono: IconAlert, txt: "Revisar" },
  atencion: { clase: "atencion", Icono: IconAlert, txt: "Atención" },
  info: { clase: "info", Icono: IconInfo, txt: "Información" },
  ok: { clase: "ok", Icono: IconCheck, txt: "En orden" },
};

// Resultado del revisor de una compra: el resumen de Nova arriba y cada hallazgo (calculado por el sistema) con las
// compras relacionadas. onCategoria: si se pasa, ofrece aplicar la categoría que sugiere Nova.
export default function HallazgosRevision({ revision, onCategoria, compacto = false }) {
  if (!revision) return null;
  const { hallazgos, nova, referencia } = revision;
  const malos = hallazgos.filter((h) => h.nivel === "alerta").length;
  const atencion = hallazgos.filter((h) => h.nivel === "atencion").length;
  return (
    <div className={`ag-revision ${compacto ? "compacto" : ""}`}>
      <div className={`ag-revision-veredicto ${malos ? "alerta" : atencion ? "atencion" : "ok"}`}>
        {malos ? <IconAlert size={18} /> : atencion ? <IconInfo size={18} /> : <IconCheck size={18} />}
        <div>
          <strong>{malos ? `${malos} punto(s) para revisar antes de guardar` : atencion ? `${atencion} punto(s) de atención` : "Todo en orden"}</strong>
          {nova?.resumen && <p><IconSpark size={12} /> {nova.resumen}</p>}
        </div>
      </div>
      <ul className="ag-hallazgos">
        {hallazgos.map((h, i) => {
          const n = NIVEL[h.nivel] || NIVEL.info;
          return (
            <li key={i} className={`ag-hallazgo ${n.clase}`}>
              <span className="ag-hallazgo-icono" aria-hidden="true"><n.Icono size={14} /></span>
              <div>
                <strong>{h.titulo}</strong>
                <p>{h.detalle}</p>
                {h.compras?.length > 0 && (
                  <div className="ag-chips">
                    {h.compras.map((c) => <span key={c.id} title={c.descripcion}>#{c.numero ?? "—"} · {c.fecha || "sin fecha"} · {c.valor != null ? fmtCOP(c.valor) : "—"}</span>)}
                  </div>
                )}
                {onCategoria && nova?.categoria && h.titulo === "Categoría a revisar" && (
                  <button type="button" className="btn small" onClick={() => onCategoria(nova.categoria)}>Usar «{nova.categoria.valor}»</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {referencia && !compacto && <p className="count-note">Referencia: {referencia.compras} compras parecidas, entre {fmtCOP(referencia.minimo)} y {fmtCOP(referencia.maximo)} (mediana {fmtCOP(referencia.mediana)}).</p>}
    </div>
  );
}
