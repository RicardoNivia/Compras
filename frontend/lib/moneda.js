// Montos con el estándar ISO 4217: siempre con el código de la moneda ("COP 1.234.567", "USD 1.250,00"), nunca solo "$".
// Regla del proyecto para todo código nuevo que muestre dinero (Tesorería la usa en todas sus pantallas).

const cache = new Map();
function formateador(moneda, compacto) {
  const k = `${moneda}|${compacto ? 1 : 0}`;
  if (!cache.has(k)) {
    cache.set(k, new Intl.NumberFormat("es-CO", {
      style: "currency", currency: moneda || "COP", currencyDisplay: "code",
      ...(compacto ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: moneda === "COP" ? 0 : 2, minimumFractionDigits: moneda === "COP" ? 0 : 2 }),
    }));
  }
  return cache.get(k);
}

export function fmtMoneda(valor, moneda = "COP") {
  return formateador(moneda, false).format(Number(valor) || 0);
}

// Para ejes y etiquetas cortas: "COP 1,2 mil M".
export function fmtMonedaCorta(valor, moneda = "COP") {
  return formateador(moneda, true).format(Number(valor) || 0);
}
