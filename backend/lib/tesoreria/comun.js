import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// Utilidades del módulo de Tesorería. El acceso se da por ROL en la Matriz de permisos (Usuarios y roles), con tres
// funcionalidades: verTesoreria / registrarTesoreria / firmarTesoreria (por defecto solo admin, que siempre tiene todo).
// La antigua lista nominal (tabla tesoreria_accesos) ya no da ni quita acceso.
//   consulta: ve todo · registro: además registra y edita movimientos, importa extractos y concilia
//   firma: además firma el cierre del mes y administra accesos y maestros.
// Arranque: mientras no haya NINGÚN acceso, un administrador del panel puede dar el primero (y solo eso).

export const NIVELES = ["consulta", "registro", "firma"];
const RANGO = { consulta: 1, registro: 2, firma: 3 };

export const badRequest = (m) => Object.assign(new Error(m), { status: 400 });
export const notFound = (m = "No se encontró.") => Object.assign(new Error(m), { status: 404 });
export const forbidden = (m = "No tienes acceso a Tesorería.") => Object.assign(new Error(m), { status: 403 });

// Acepta el usuario (con role) o su id.
export async function accesoDe(usuario) {
  const u = typeof usuario === "string" ? await prisma.user.findUnique({ where: { id: usuario }, select: { id: true, role: true, activo: true } }) : usuario;
  if (!u?.role || u.activo === false) return null;
  const [ver, registrar, firmar] = await Promise.all(["verTesoreria", "registrarTesoreria", "firmarTesoreria"].map((f) => isRoleAllowed(u.role, f)));
  const nivel = firmar ? "firma" : registrar ? "registro" : ver ? "consulta" : null;
  return nivel ? { nivel, puedeRegistrar: RANGO[nivel] >= 2, puedeFirmar: RANGO[nivel] >= 3 } : null;
}

// Para los route handlers: { user, acceso, denied }.
export async function requireTesoreria(nivelMinimo = "consulta") {
  const user = await getSessionUser();
  if (!user) return { denied: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const acceso = await accesoDe(user);
  if (!acceso) return { denied: NextResponse.json({ error: "No tienes acceso a Tesorería: pídelo a un administrador en Usuarios y roles." }, { status: 403 }) };
  if (RANGO[acceso.nivel] < RANGO[nivelMinimo]) {
    return { denied: NextResponse.json({ error: `Necesitas acceso de ${nivelMinimo} en Tesorería.` }, { status: 403 }) };
  }
  return { user, acceso, denied: null };
}

// ---------- Texto, números, fechas y moneda (ISO 4217) ----------

export const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// La BD rechaza U+FFFD: se quita aquí (texto que viene de bancos o archivos con codificación dañada).
export const limpiar = (s, max = 500) => (s == null ? null : String(s).replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim().slice(0, max) || null);

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

// ---------- Pagos programados (los códigos de la columna INGRESO/EGRESO del Excel) ----------
// Códigos de la columna INGRESO/EGRESO: I ingreso, E egreso, J jornal, S saldo, T traslado entre cuentas.
// I, E y J suman en ingresos y egresos (J según su signo: positivo entra, negativo sale); S y T se registran pero no suman.
export const TIPOS_PAGO = { I: "Ingreso", E: "Egreso", J: "Jornal", S: "Saldo", T: "Traslado" };
export const TIPOS_QUE_SUMAN = ["I", "E", "J"];
// Un pago cuenta como ingreso o egreso por su tipo; el jornal (J) por su signo.
export const esIngreso = (p) => p.tipo === "I" || (p.tipo === "J" && Number(p.valor) > 0);
export const esEgreso = (p) => p.tipo === "E" || (p.tipo === "J" && Number(p.valor) < 0);
export const ESTADOS_PAGO = { P: "Pendiente", E: "Pagado" };
export const PERIODICIDADES = { quincenal: "Quincenal", mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };
export const PASO_MESES = { quincenal: 1, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

// Valor con el signo del Excel: egreso negativo; I, J y S positivos; T conserva el signo que trae (sale − / entra +).
export function valorConSigno(tipo, valor, signoTraslado = null) {
  const v = Math.abs(Number(valor) || 0);
  if (tipo === "E") return -v;
  if (tipo === "T") return (signoTraslado ?? (Number(valor) < 0 ? -1 : 1)) < 0 ? -v : v;
  return v;
}

export const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
export const fechaDe = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(Math.max(1, dia), ultimoDia(anio, mes))).padStart(2, "0")}`;
export function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}
