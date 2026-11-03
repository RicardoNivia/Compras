"use client";

import { MESES, fmtCOP } from "@/lib/format";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { estadoActividad, rangoHumano } from "@/components/bienestar/actividadesUi";

const entero = (v) => Math.round(v).toLocaleString("es-CO");

// Cambio contra el mes anterior: "+12 %", o el valor nuevo si el mes anterior fue cero (ahí no hay porcentaje posible).
function Variacion({ actual, anterior, mesAnterior, formato }) {
  if (mesAnterior == null) return <span className="count-note">Primer mes del año</span>;
  if (!anterior && !actual) return <span className="count-note">Sin datos este mes ni en {mesAnterior}</span>;
  if (!anterior) return <span className="mes-delta sube">Nuevo frente a {mesAnterior}, que no tuvo</span>;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  return (
    <span className={`mes-delta ${pct > 0 ? "sube" : pct < 0 ? "baja" : ""}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)} % frente a {mesAnterior} ({formato(anterior)})
    </span>
  );
}

function Medidor({ etiqueta, valor, total, texto, clase }) {
  const pct = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="mes-medidor">
      <div className="mes-medidor-top"><span>{etiqueta}</span><strong>{texto}</strong></div>
      <div className="mes-medidor-barra"><span className={clase} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// La vista Mensual del resumen: cómo va el mes frente al anterior y cada actividad con su asistencia y su gasto. Una
// gráfica por actividad no dice nada con una o dos actividades, y menos si aún no se han realizado.
export default function ResumenDelMes({ mes, anio, porMes, porActividad, kpis, onAbrirActividad, etiquetaActividades = "Actividades", etiquetaPersonas = "Asistentes" }) {
  const actual = porMes[mes - 1];
  const previo = mes > 1 ? porMes[mes - 2] : null;
  const mesAnterior = previo ? MESES[mes - 2].toLowerCase() : null;
  const tarjetas = [
    { label: etiquetaPersonas, valor: actual.asistentes, anterior: previo?.asistentes, format: entero },
    { label: "Gasto en compras asociadas", valor: actual.gastoArea, anterior: previo?.gastoArea, format: fmtCOP },
    { label: etiquetaActividades, valor: actual.actividades, anterior: previo?.actividades, format: entero },
  ];
  const presupuesto = kpis.presupuestoAsignado;

  return (
    <div className="mes-vista">
      <div className="mes-comparacion">
        {tarjetas.map((t) => (
          <div key={t.label}>
            <span className="mes-comparacion-label">{t.label}</span>
            <strong><AnimatedNumber value={t.valor} format={t.format} /></strong>
            <Variacion actual={t.valor} anterior={t.anterior} mesAnterior={mesAnterior} formato={t.format} />
          </div>
        ))}
      </div>
      {porActividad.length === 0 ? (
        <div className="empty">No hay actividades en {MESES[mes - 1].toLowerCase()} de {anio}.</div>
      ) : (
        <ul className="mes-actividades">
          {porActividad.map((a, i) => {
            const est = estadoActividad(a.estado);
            const yaOcurrio = a.estado === "ejecutada" || a.estado === "cerrada";
            return (
              <li key={a.id} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <button type="button" onClick={() => onAbrirActividad(a.id)}>
                  <span className="mes-actividad-dia">{Number(a.fecha.slice(8, 10))}</span>
                  <span className="mes-actividad-info">
                    <span className="mes-actividad-nombre">{a.nombre}</span>
                    <span className="count-note">{rangoHumano(a)} <span className={`pill ${est.pill}`}>{est.label}</span></span>
                  </span>
                  {a.aplicaParticipantes === false ? (
                    <div className="mes-medidor mes-medidor-pendiente"><span>Asistencia</span><strong>No aplica</strong></div>
                  ) : yaOcurrio ? (
                    <Medidor
                      etiqueta="Asistencia"
                      valor={a.asistentes} total={a.inscritos || a.asistentes}
                      texto={a.inscritos ? `${entero(a.asistentes)} de ${entero(a.inscritos)}` : entero(a.asistentes)}
                      clase="asistencia"
                    />
                  ) : (
                    <div className="mes-medidor mes-medidor-pendiente"><span>Asistencia</span><strong>{a.inscritos ? `${entero(a.inscritos)} inscritos` : "Aún no se realiza"}</strong></div>
                  )}
                  {a.presupuesto ? (
                    <Medidor etiqueta="Gasto" valor={a.gastado} total={a.presupuesto} texto={`${fmtCOP(a.gastado)} de ${fmtCOP(a.presupuesto)}`} clase={a.gastado > a.presupuesto ? "excedido" : "gasto"} />
                  ) : (
                    <div className="mes-medidor mes-medidor-pendiente"><span>Gasto</span><strong>{a.gastado ? fmtCOP(a.gastado) : "Sin compras asociadas"}</strong></div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {presupuesto > 0 && <span className="count-note">Presupuesto de las actividades del mes: {fmtCOP(presupuesto)}.</span>}
    </div>
  );
}
