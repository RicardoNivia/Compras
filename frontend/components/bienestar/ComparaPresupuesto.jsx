import { fmtCOP } from "@/lib/format";

// Presupuesto, gastado y la diferencia, cada uno con su valor. Las actividades sin presupuesto se muestran aparte: su
// gasto no se compara contra nada, y sumarlo al porcentaje lo inflaría (p. ej. 1282 % por una sola actividad con presupuesto).
export default function ComparaPresupuesto({ presupuesto = 0, gastado = 0, gastoSinPresupuesto = 0 }) {
  const comparable = gastado - gastoSinPresupuesto;
  const diferencia = presupuesto - comparable;
  return (
    <div className="compara-presu">
      <dl>
        <div><dt>Presupuesto</dt><dd>{presupuesto ? fmtCOP(presupuesto) : "Sin asignar"}</dd></div>
        <div><dt>Gastado</dt><dd>{fmtCOP(comparable)}</dd></div>
        {presupuesto > 0 && (
          <div className={`diferencia ${diferencia < 0 ? "excedido" : "disponible"}`}>
            <dt>{diferencia < 0 ? "Excedido" : "Disponible"}</dt>
            <dd>{fmtCOP(Math.abs(diferencia))}</dd>
          </div>
        )}
      </dl>
      {gastoSinPresupuesto > 0 && <span className="count-note">Además, {fmtCOP(gastoSinPresupuesto)} en actividades sin presupuesto</span>}
    </div>
  );
}
