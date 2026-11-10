import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-server";

// Utilidades del módulo de Tesorería. El acceso es NOMINAL (tabla tesoreria_accesos), no por rol ni por la Matriz:
// ser administrador del panel no da acceso, porque el módulo tiene finanzas personales y patrimoniales.
//   consulta: ve todo · registro: además registra y edita movimientos, importa extractos y concilia
//   firma: además firma el cierre del mes y administra accesos y maestros.
// Arranque: mientras no haya NINGÚN acceso, un administrador del panel puede dar el primero (y solo eso).

export const NIVELES = ["consulta", "registro", "firma"];
const RANGO = { consulta: 1, registro: 2, firma: 3 };

export const badRequest = (m) => Object.assign(new Error(m), { status: 400 });
export const notFound = (m = "No se encontró.") => Object.assign(new Error(m), { status: 404 });
export const forbidden = (m = "No tienes acceso a Tesorería.") => Object.assign(new Error(m), { status: 403 });

export async function accesoDe(userId) {
  if (!userId) return null;
  const a = await prisma.accesoTesoreria.findUnique({ where: { userId } });
  return a ? { nivel: a.nivel, puedeRegistrar: RANGO[a.nivel] >= 2, puedeFirmar: RANGO[a.nivel] >= 3 } : null;
}

// Para los route handlers: { user, acceso, denied }.
export async function requireTesoreria(nivelMinimo = "consulta") {
  const user = await getSessionUser();
  if (!user) return { denied: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const acceso = await accesoDe(user.id);
  if (!acceso) return { denied: NextResponse.json({ error: "No tienes acceso a Tesorería." }, { status: 403 }) };
  if (RANGO[acceso.nivel] < RANGO[nivelMinimo]) {
    return { denied: NextResponse.json({ error: `Necesitas acceso de ${nivelMinimo} en Tesorería.` }, { status: 403 }) };
  }
  return { user, acceso, denied: null };
}

// ---------- Texto, números, fechas y moneda (ISO 4217) ----------

export const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// La BD rechaza U+FFFD: se quita aquí (texto que viene de bancos o archivos con codificación dañada).
export const limpiar = (s, max = 500) => (s == null ? null : String(s).replace(/�/g, "").replace(/\s+/g, " ").trim().slice(0, max) || null);

export function numero(v, campo = "El valor") {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw badRequest(`${campo} no es un número válido.`);
  return Math.round(n * 100) / 100;
}

export function fechaValida(f, campo = "La fecha") {
  const s = String(f || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw badRequest(`${campo} debe tener el formato AAAA-MM-DD.`);
  return s;
}

const MONEDAS_ISO = new Set(Intl.supportedValuesOf("currency"));
export function monedaValida(m) {
  const c = String(m || "COP").trim().toUpperCase();
  if (!MONEDAS_ISO.has(c)) throw badRequest(`«${m}» no es un código de moneda ISO 4217 (ej. COP, USD, EUR).`);
  return c;
}

// "COP 1.234.567" (ISO 4217, con el código, nunca solo "$").
export function fmtMoneda(valor, moneda = "COP") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda, currencyDisplay: "code", maximumFractionDigits: moneda === "COP" ? 0 : 2 }).format(Number(valor) || 0);
}

export const mesDe = (fecha) => String(fecha).slice(0, 7); // AAAA-MM

export function rangoMes(anio, mes) {
  const m = String(mes).padStart(2, "0");
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${m}-01`, hasta: `${anio}-${m}-${String(fin).padStart(2, "0")}` };
}

// Un mes firmado es de solo lectura: ningún movimiento ni enlace de ese mes se puede cambiar.
export async function exigirMesAbierto(fecha) {
  const [anio, mes] = String(fecha).split("-").map(Number);
  const c = await prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } }, select: { firmadoPorNombre: true } });
  if (c) throw badRequest(`El cierre de ${String(mes).padStart(2, "0")}/${anio} ya está firmado${c.firmadoPorNombre ? ` por ${c.firmadoPorNombre}` : ""}: ese mes es de solo lectura. Registra el ajuste en un mes abierto.`);
}
