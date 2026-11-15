import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// Utilidades del módulo de Consumo (servicios públicos por sede). Es independiente de Compras, Bienestar y Tesorería.
// El acceso se da por ROL en la Matriz de permisos (pestaña Consumo), con tres funcionalidades:
//   verConsumo (consulta) · registrarConsumo (registro: subir y crear recibos, confirmar la sede, marcar pagos)
//   administrarConsumo (admin: sedes, cuentas, medidores, empresas y eliminar recibos). Por defecto solo admin.

export const NIVELES = ["consulta", "registro", "admin"];
const RANGO = { consulta: 1, registro: 2, admin: 3 };

export const badRequest = (m) => Object.assign(new Error(m), { status: 400 });
export const notFound = (m = "No se encontró.") => Object.assign(new Error(m), { status: 404 });

// Servicios que maneja el módulo, con su unidad de consumo. El aseo no mide consumo: llega como cargo en otro recibo.
export const SERVICIOS = {
  energia: { nombre: "Energía", unidad: "kWh" },
  acueducto: { nombre: "Acueducto y alcantarillado", unidad: "m3" },
  gas: { nombre: "Gas natural", unidad: "m3" },
  aseo: { nombre: "Aseo", unidad: null },
};
export const PERIODICIDADES = { mensual: "Mensual", bimestral: "Bimestral" };

// Acepta el usuario (con role) o su id. null = sin acceso.
export async function accesoConsumo(usuario) {
  const u = typeof usuario === "string" ? await prisma.user.findUnique({ where: { id: usuario }, select: { id: true, role: true, activo: true } }) : usuario;
  if (!u?.role || u.activo === false) return null;
  const [ver, registrar, administrar] = await Promise.all(["verConsumo", "registrarConsumo", "administrarConsumo"].map((f) => isRoleAllowed(u.role, f)));
  const nivel = administrar ? "admin" : registrar ? "registro" : ver ? "consulta" : null;
  return nivel ? { nivel, puedeRegistrar: RANGO[nivel] >= 2, puedeAdministrar: RANGO[nivel] >= 3 } : null;
}

const ETIQUETA_NIVEL = { consulta: "ver Consumo", registro: "registrar en Consumo", admin: "administrar Consumo" };

// Para los route handlers: { user, acceso, denied }.
export async function requireConsumo(nivelMinimo = "consulta") {
  const user = await getSessionUser();
  if (!user) return { denied: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const acceso = await accesoConsumo(user);
  if (!acceso) return { denied: NextResponse.json({ error: "No tienes acceso a Consumo: pídelo a un administrador en Usuarios y roles." }, { status: 403 }) };
  if (RANGO[acceso.nivel] < RANGO[nivelMinimo]) {
    return { denied: NextResponse.json({ error: `Necesitas el permiso de ${ETIQUETA_NIVEL[nivelMinimo]}.` }, { status: 403 }) };
  }
  return { user, acceso, denied: null };
}

// ---------- Texto, números y fechas ----------

export const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// La BD rechaza U+FFFD: se quita aquí (texto leído de recibos o archivos con codificación dañada).
export const limpiar = (s, max = 500) => (s == null ? null : String(s).replace(/�/g, "").replace(/\s+/g, " ").trim().slice(0, max) || null);
// Clave para comparar nombres sin importar tildes, mayúsculas ni signos («CL 81 # 11-08» = «cl 81 11 08»).
export const claveNombre = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, " ").trim();
// Clave de un número de cuenta o de medidor: solo letras y dígitos («7174172-4» = «71741724»).
export const claveNumero = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, "");

export function numero(v, campo = "El valor") {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw badRequest(`${campo} no es un número válido.`);
  return n;
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
