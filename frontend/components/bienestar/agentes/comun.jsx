"use client";

// Piezas compartidas de la página de Agentes: la cabecera de cada agente (qué hace + cómo funciona en pasos) y las
// tarjetas de cifras con icono.

export function CabezaAgente({ icono, color = "verde", titulo, descripcion, pasos = [], paso = 0, children }) {
  return (
    <section className={`ag-cabeza ag-${color}`}>
      <div className="ag-cabeza-top">
        <span className="ag-icono" aria-hidden="true">{icono}</span>
        <div className="ag-cabeza-txt">
          <h2>{titulo}</h2>
          <p>{descripcion}</p>
        </div>
        {children && <div className="ag-cabeza-acciones">{children}</div>}
      </div>
      {pasos.length > 0 && (
        <ol className="ag-pasos" aria-label="Cómo funciona">
          {pasos.map((t, i) => (
            <li key={t} className={paso > i ? "hecho" : paso === i ? "actual" : ""}>
              <span className="ag-paso-num">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CifraAgente({ icono, etiqueta, valor, nota, tono = "", pequena = false }) {
  return (
    <div className={`ag-cifra ${tono}`}>
      <span className="ag-cifra-icono" aria-hidden="true">{icono}</span>
      <div>
        <span className="ag-cifra-etiqueta">{etiqueta}</span>
        <strong className={pequena ? "pequena" : ""}>{valor}</strong>
        {nota && <small>{nota}</small>}
      </div>
    </div>
  );
}

export function VacioAgente({ icono, titulo, children }) {
  return (
    <div className="ag-vacio">
      <span className="ag-vacio-icono" aria-hidden="true">{icono}</span>
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
