import { AsyncLocalStorage } from "node:async_hooks";

// Catálogo de modelos Anthropic (Claude) disponibles para el Agente IA —
// único proveedor de IA configurado en la app. La cuenta Anthropic es 100%
// de pago (sin nivel gratuito).

export const ANTHROPIC_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    tier: "paid",
    description: "El más rápido y económico de Anthropic. Bueno para consultas simples y de alto volumen.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    tier: "paid",
    description: "Buen balance entre velocidad y calidad de razonamiento. Recomendado dentro de Anthropic.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    tier: "paid",
    description: "El de mayor capacidad de razonamiento de Anthropic, para análisis más complejos.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
];

// Qué modelos usa la app y en qué orden. En PRODUCCIÓN (NODE_ENV=production):
//   - lo que pide una persona (chat de Nova, informes, agentes, "Explicar"…): Opus 5.5 y, si falla, Sonnet 5.5;
//   - lo automático (lo que corre en segundo plano: valoración de compras, análisis mensual, informes programados,
//     revisión diaria del asociador, manito de comentarios, recalificación de actividades, agente al desplegar):
//     Sonnet 5.5 y, si falla, Opus 5.5.
// Nunca Haiku en producción. Fuera de producción (local) se queda Haiku, para que las pruebas no gasten de más.
// ANTHROPIC_MODELOS y ANTHROPIC_MODELOS_AUTO (ids separados por coma) cambian el orden de cada caso sin tocar el código.
// 2026-11-05: en producción Nova respondió "Error al conectar con el servicio de IA (401)" con Opus/Sonnet, así que se
// volvió a Haiku 4.5 en todos los casos, como estaba antes. Para usar otros modelos sin tocar el código, definir
// ANTHROPIC_MODELOS / ANTHROPIC_MODELOS_AUTO en el servidor (después de comprobar que la clave de producción los permite).
const ORDEN_PRODUCCION = ["claude-haiku-4-5-20251001"];
const ORDEN_PRODUCCION_AUTO = ["claude-haiku-4-5-20251001"];
const ORDEN_LOCAL = ["claude-haiku-4-5-20251001"];

// ¿La llamada es automática? Lo marca enSegundoPlano(): los temporizadores y promesas que nacen dentro heredan la marca
// (AsyncLocalStorage), así que basta con envolver el arranque de cada proceso automático.
const segundoPlano = globalThis.__iaSegundoPlano || (globalThis.__iaSegundoPlano = new AsyncLocalStorage());
export function enSegundoPlano(fn) {
  return segundoPlano.run(true, fn);
}
export function esSegundoPlano() {
  return segundoPlano.getStore() === true;
}

export function isValidAnthropicModel(id) {
  return ANTHROPIC_MODELS.some((m) => m.id === id);
}

export function modelosEnOrden({ automatico = esSegundoPlano() } = {}) {
  const variable = automatico ? process.env.ANTHROPIC_MODELOS_AUTO : process.env.ANTHROPIC_MODELOS;
  const elegidos = String(variable || "").split(",").map((s) => s.trim()).filter(isValidAnthropicModel);
  if (elegidos.length) return [...new Set(elegidos)];
  if (process.env.NODE_ENV !== "production") return ORDEN_LOCAL;
  return automatico ? ORDEN_PRODUCCION_AUTO : ORDEN_PRODUCCION;
}

// El principal de lo que pide una persona. Se mantiene el nombre porque lo usan varios módulos.
export const DEFAULT_ANTHROPIC_MODEL = modelosEnOrden({ automatico: false })[0];

// ¿Vale la pena intentar con el siguiente modelo? Sí cuando el problema es del modelo o del servicio (no existe o no
// está habilitado, saturado, límite de uso, caída, tiempo agotado, respuesta cortada o mal formada); no cuando es de
// la cuenta (API key) o de la petición, porque el siguiente modelo fallaría igual.
export function reintentarConOtroModelo(err) {
  const st = err?.status;
  if (st === 401 || st === 403) return false;
  if ([404, 408, 409, 429, 500, 502, 503, 504, 529].includes(st)) return true;
  if (st === 400) return /model/i.test(err?.detalle || err?.message || "");
  return !st && !/API_KEY/.test(err?.message || "");
}

// Ejecuta llamada(modelo) con cada modelo de la lista hasta que uno responda. Devuelve { valor, modelo }.
export async function conModelos(llamada) {
  const lista = modelosEnOrden();
  let ultimo;
  for (const [i, modelo] of lista.entries()) {
    try {
      return { valor: await llamada(modelo), modelo };
    } catch (err) {
      ultimo = err;
      if (i === lista.length - 1 || !reintentarConOtroModelo(err)) throw err;
      console.warn(`[IA] ${modelo} falló (${err.status || "sin status"}: ${String(err.message).slice(0, 120)}); se intenta con ${lista[i + 1]}.`);
    }
  }
  throw ultimo;
}
