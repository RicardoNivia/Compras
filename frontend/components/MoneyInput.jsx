"use client";

// Campo de valor de dinero. REGLA DE LA APP: todo campo de valor se digita con separador de miles (puntos, es-CO:
// 1.234.567), nunca como número plano. Guarda el número plano en el estado del padre (string sin separadores, con
// punto decimal: "1234567" o "1250.5") y muestra el valor formateado a medida que se digita.
// prefix: el código ISO 4217 de la moneda ("COP", "USD"…) o, en pantallas antiguas, "$"; null = sin prefijo (celdas).
// decimales: cuántos decimales se aceptan (se escriben con coma, como en Colombia); 0 = solo enteros (pesos).
// permitirNegativo: para saldos que pueden ser negativos (p. ej. una tarjeta de crédito).
export default function MoneyInput({ id, value, onChange, placeholder, ariaLabel, disabled, prefix = "$", decimales = 0, permitirNegativo = false, className = "", style }) {
  const plano = value === "" || value === null || value === undefined ? "" : String(value);
  const negativo = plano.startsWith("-");
  const [entero, dec] = plano.replace("-", "").split(".");
  const display = plano === "" || plano === "-"
    ? plano
    : `${negativo ? "-" : ""}${new Intl.NumberFormat("es-CO").format(Number(entero) || 0)}${dec !== undefined && decimales > 0 ? `,${dec}` : ""}`;

  function handleChange(e) {
    let t = e.target.value;
    const neg = permitirNegativo && t.trim().startsWith("-");
    t = t.replace(/[^\d,]/g, "");
    let [ent, ...resto] = t.split(",");
    ent = ent.replace(/^0+(?=\d)/, "");
    let salida = ent;
    if (decimales > 0 && resto.length) salida = `${ent || "0"}.${resto.join("").slice(0, decimales)}`;
    if (salida === "" && neg) return onChange("-");
    onChange(salida === "" ? "" : `${neg ? "-" : ""}${salida}`);
  }

  const input = (
    <input
      id={id}
      type="text"
      inputMode={decimales > 0 ? "decimal" : "numeric"}
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className={prefix == null ? className : undefined}
      style={prefix == null ? style : undefined}
    />
  );
  if (prefix == null) return input;
  return (
    <div className={`money-field${prefix.length > 1 ? " wide-prefix" : ""}${className ? ` ${className}` : ""}`} style={style}>
      <span className="money-field-prefix">{prefix}</span>
      {input}
    </div>
  );
}
