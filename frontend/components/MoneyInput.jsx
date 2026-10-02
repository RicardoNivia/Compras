"use client";

// Input de valor en pesos colombianos: guarda el número plano (sin separadores)
// en el estado del padre, pero muestra el valor formateado con separador de
// miles a medida que se digita — mismo comportamiento en todos los formularios
// que manejan montos (Presupuesto, Registros).
export default function MoneyInput({ id, value, onChange, placeholder, ariaLabel, disabled, prefix = "$" }) {
  const display = value === "" || value === null || value === undefined
    ? ""
    : new Intl.NumberFormat("es-CO").format(Number(value) || 0);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits === "" ? "" : String(Number(digits)));
  }

  return (
    <div className={`money-field${prefix.length > 1 ? " wide-prefix" : ""}`}>
      <span className="money-field-prefix">{prefix}</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}
