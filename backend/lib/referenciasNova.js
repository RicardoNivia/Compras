import { PROCUREMENT_POLICY_TITLE, PROCUREMENT_POLICY_TEXT } from "@/lib/procurementPolicy";
import { APP_GUIDE_TITLE, APP_GUIDE_TEXT } from "@/lib/appGuide";
import { CONECTANDO_CORAZONES_TITULO, CONECTANDO_CORAZONES_TEXTO } from "@/lib/conectandoCorazones";

// El procedimiento de compras (B) y la guía de la app (C) ya no van completos en el system prompt de Nova (eran ~12.000
// tokens que se pagaban en CADA pregunta, aunque la mayoría son de datos): Nova recibe solo su índice y pide las
// secciones que necesita con la herramienta "consultar_referencia" (ver lib/agentTools.js).

const DOCUMENTOS = {
  procedimiento: { titulo: PROCUREMENT_POLICY_TITLE, texto: PROCUREMENT_POLICY_TEXT, inicio: (l) => esTituloMayusculas(l) },
  guia: { titulo: APP_GUIDE_TITLE, texto: APP_GUIDE_TEXT, inicio: (l) => /^\d{1,2}\. [A-ZÁÉÍÓÚÑ]/.test(l) },
  fundacion: { titulo: CONECTANDO_CORAZONES_TITULO, texto: CONECTANDO_CORAZONES_TEXTO.replace(/^## /gm, ""), inicio: (l) => TITULOS_FUNDACION.has(l) },
};

// Títulos de sección de Conectando Corazones (líneas "## " de lib/conectandoCorazones.js).
const TITULOS_FUNDACION = new Set([...CONECTANDO_CORAZONES_TEXTO.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()));

const MAX_CHARS_RESPUESTA = 9000;
const VACIAS = new Set(["que", "como", "cual", "cuales", "para", "por", "con", "los", "las", "del", "una", "uno", "este", "esta", "esto", "hay", "puedo", "debo", "hace", "hacer", "donde", "cuando", "segun", "sobre", "entre", "sus", "mis", "tiene", "son", "the"]);

// "PROPÓSITO", "DEFINICIONES", "DESCRIPCIÓN DE ACTIVIDADES"… (líneas cortas en mayúsculas).
function esTituloMayusculas(l) {
  return l.length >= 4 && l.length <= 90 && /[A-ZÁÉÍÓÚÑ]{3}/.test(l) && l === l.toUpperCase() && !/[a-záéíóúñ]/.test(l);
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function partir(doc) {
  const secciones = [];
  let actual = { titulo: "Introducción", lineas: [] };
  for (const linea of doc.texto.split("\n")) {
    const l = linea.trim();
    if (doc.inicio(l)) {
      if (actual.lineas.some((x) => x.trim())) secciones.push(actual);
      actual = { titulo: l.length > 90 ? `${l.slice(0, 87)}…` : l, lineas: [linea] };
    } else {
      actual.lineas.push(linea);
    }
  }
  if (actual.lineas.some((x) => x.trim())) secciones.push(actual);
  return secciones.map((s) => ({ titulo: s.titulo, texto: s.lineas.join("\n").trim() }));
}

const cache = {};
function seccionesDe(documento) {
  if (!cache[documento]) cache[documento] = partir(DOCUMENTOS[documento]);
  return cache[documento];
}

// Índice que sí va fijo en el prompt (corto), para que Nova sepa qué pedir.
export function indiceReferencia(documento) {
  return seccionesDe(documento).map((s, i) => `${i + 1}. ${s.titulo.replace(/^\d{1,2}\.\s*/, "")}`).join("\n");
}

// documento: "procedimiento" | "guia" | "fundacion". consulta: palabras clave o la pregunta. secciones: números o títulos del índice.
export function consultarReferencia({ documento, consulta, secciones } = {}) {
  const doc = DOCUMENTOS[documento];
  if (!doc) return { error: 'documento debe ser "procedimiento", "guia" o "fundacion".' };
  const todas = seccionesDe(documento);

  let elegidas = [];
  for (const s of Array.isArray(secciones) ? secciones : []) {
    const n = Number(String(s).match(/^\s*(\d{1,2})/)?.[1]);
    const porNumero = n >= 1 && n <= todas.length ? todas[n - 1] : null;
    const porTitulo = todas.find((x) => norm(x.titulo).includes(norm(s).replace(/^\d{1,2}\.\s*/, "").trim()));
    const sec = porNumero || porTitulo;
    if (sec && !elegidas.includes(sec)) elegidas.push(sec);
  }

  if (!elegidas.length && consulta) {
    const terminos = [...new Set(norm(consulta).split(/[^a-z0-9ñ]+/).filter((t) => t.length >= 3 && !VACIAS.has(t)))];
    elegidas = todas
      .map((s) => {
        const titulo = norm(s.titulo);
        const cuerpo = norm(s.texto);
        const puntaje = terminos.reduce((acc, t) => acc + (titulo.includes(t) ? 5 : 0) + Math.min(6, cuerpo.split(t).length - 1), 0);
        return { s, puntaje };
      })
      .filter((x) => x.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, 3)
      .map((x) => x.s);
  }

  if (!elegidas.length) {
    return { documento: doc.titulo, aviso: "No se encontró una sección para esa consulta. Pide las secciones por número o título según este índice.", indice: indiceReferencia(documento) };
  }

  let usados = 0;
  const salida = [];
  for (const s of elegidas) {
    if (usados >= MAX_CHARS_RESPUESTA) break;
    const texto = s.texto.length > MAX_CHARS_RESPUESTA - usados ? `${s.texto.slice(0, MAX_CHARS_RESPUESTA - usados)}… [sección recortada; pídela sola por su número si necesitas el resto]` : s.texto;
    usados += texto.length;
    salida.push({ seccion: s.titulo, texto });
  }
  return { documento: doc.titulo, secciones: salida };
}

export const CONSULTAR_REFERENCIA_TOOL = {
  name: "consultar_referencia",
  description: "Consulta el procedimiento oficial de compras (fuente B, documento \"procedimiento\"), la guía de uso de la app (fuente C, documento \"guia\") o qué es el programa Conectando Corazones de la línea Fundación (documento \"fundacion\": propósito, misión, visión, valores, componentes, alianza con Sincosoft y apoyo corporativo) y devuelve SOLO las secciones pedidas o las más relacionadas con la consulta. Úsala SIEMPRE antes de explicar reglas del procedimiento (plazos, montos, aprobaciones, documentos, roles del proceso) o cómo se usa la app / qué puede hacer un rol, y cita lo que dice. Úsala también (documento \"fundacion\") cuando pregunten qué es Conectando Corazones, su propósito, sus valores, sus componentes, la Fundación Proyecto Unión o la alianza con Sincosoft. Si ya sabes qué secciones necesitas por el índice, pídelas por número en \"secciones\".",
  input_schema: {
    type: "object",
    properties: {
      documento: { type: "string", enum: ["procedimiento", "guia", "fundacion"], description: "\"procedimiento\" (B), \"guia\" (C) o \"fundacion\" (Conectando Corazones)." },
      consulta: { type: "string", description: "Palabras clave o la pregunta del usuario, para buscar las secciones relevantes (opcional si das \"secciones\")." },
      secciones: { type: "array", items: { type: "string" }, description: "Números o títulos de secciones del índice (opcional, máximo 3)." },
    },
    required: ["documento"],
  },
};
