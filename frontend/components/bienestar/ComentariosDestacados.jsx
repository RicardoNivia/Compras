"use client";

import { ManoSentimiento } from "@/components/bienestar/Sentimiento";
import { rangoFechas } from "@/components/bienestar/actividadesUi";

const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");

// Al final del Resumen (anual o mensual): los 5 comentarios más a favor y los 5 más en contra del período, según la
// manito de Nova, con la actividad de cada uno. Sin el nombre de quien lo escribió. Al hacer clic se abre el detalle
// de la actividad en sus comentarios, donde está la lista completa y paginada.
export default function ComentariosDestacados({ comentarios, periodo, onAbrir }) {
  const grupos = [
    { clave: "positivos", titulo: "Lo que más gustó", sub: "Los 5 comentarios más a favor", vacio: "Sin comentarios positivos", total: comentarios?.totalPositivos },
    { clave: "negativos", titulo: "Lo que no gustó", sub: "Los 5 comentarios más en contra", vacio: "Sin comentarios negativos", total: comentarios?.totalNegativos },
  ];
  return (
    <div className="resumen-fila">
      {grupos.map((g) => (
        <section key={g.clave} className={`resumen-card comentarios-top comentarios-top-${g.clave}`} aria-labelledby={`top-${g.clave}`}>
          <h2 id={`top-${g.clave}`}>{g.titulo}</h2>
          <p className="card-sub">{g.sub}, {periodo}{g.total ? ` (de ${entero(g.total)})` : ""}. Clic para ver la actividad.</p>
          {!comentarios?.[g.clave]?.length ? (
            <p className="count-note">{g.vacio} en {periodo}.</p>
          ) : (
            <ol className="comentarios-top-lista">
              {comentarios[g.clave].map((c) => (
                <li key={c.clave}>
                  <button type="button" onClick={() => onAbrir(c)} title={c.texto}>
                    <ManoSentimiento valor={c.sentimiento} />
                    <span className="comentarios-top-texto">
                      <span className="comentarios-top-cita">“{c.texto}”</span>
                      <span className="count-note">{c.actividad} · {rangoFechas(c)}{c.calificacion ? ` · ${c.calificacion} ★` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
