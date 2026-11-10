import { prisma } from "@/lib/prisma";
import { logPresupuestoUpsert, logPresupuestoDelete, logPresupuestoModoChange } from "@/lib/audit";
import { revisarUmbralPresupuesto, publicarCambioPresupuesto } from "@/lib/notificacionesEventos";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function toClientPresupuesto(p, modo) {
  const categorias = (p.categorias || [])
    .map((c) => ({ id: c.id, categoria: c.categoria, valor: c.valor }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "es"));
  const total = modo === "categoria" ? categorias.reduce((s, c) => s + c.valor, 0) : (p.valorArea || 0);

  return {
    id: p.id,
    area: p.area,
    anio: p.anio,
    modo,
    valorArea: modo === "area" ? (p.valorArea ?? null) : null,
    categorias: modo === "categoria" ? categorias : [],
    total,
    updatedAt: p.updatedAt,
  };
}

export async function getModoAnio(anio) {
  const row = await prisma.presupuestoAnio.findUnique({ where: { anio: Number(anio) } });
  return row?.modo || null;
}

// Sin año: devuelve todos los presupuestos de todos los años (cada uno con el
// modo vigente de SU año — puede variar de un año a otro). Con año: además
// incluye el modo de ese año aunque todavía no tenga ningún presupuesto
// configurado (o null si tampoco se ha elegido modo).
export async function listPresupuestos({ anio } = {}) {
  const where = {};
  if (anio !== undefined) where.anio = Number(anio);

  const [rows, modoRows] = await Promise.all([
    prisma.presupuesto.findMany({ where, include: { categorias: true }, orderBy: [{ anio: "desc" }, { area: "asc" }] }),
    anio !== undefined ? prisma.presupuestoAnio.findMany({ where: { anio: Number(anio) } }) : prisma.presupuestoAnio.findMany(),
  ]);
  const modoPorAnio = new Map(modoRows.map((m) => [m.anio, m.modo]));

  const presupuestos = rows.map((r) => toClientPresupuesto(r, modoPorAnio.get(r.anio) || "area"));

  if (anio !== undefined) {
    return { presupuestos, modo: modoPorAnio.get(Number(anio)) || null };
  }
  return { presupuestos };
}

// Define (o cambia) el modo general de un año. Si ya había un modo distinto
// con presupuestos configurados, es destructivo (se borran) y requiere
// `confirm: true` explícito — de lo contrario devuelve un 409 con el detalle
// para que el cliente muestre la advertencia antes de reintentar.
export async function setModoAnio(body, actor) {
  const anio = Number(body.anio);
  const modo = body.modo;
  if (!Number.isInteger(anio)) throw badRequest("El año es obligatorio.");
  if (!["area", "categoria"].includes(modo)) throw badRequest("El modo debe ser \"area\" o \"categoria\".");

  const actual = await getModoAnio(anio);
  if (actual === modo) return { anio, modo, cambiado: false };

  const afectados = await prisma.presupuesto.count({ where: { anio } });
  if (actual && afectados > 0 && !body.confirm) {
    const err = new Error(
      `Ya hay ${afectados} área(s) con presupuesto configurado por "${actual === "area" ? "área" : "categoría"}" para ${anio}. ` +
      `Cambiar a "${modo === "area" ? "área" : "categoría"}" borrará esos datos.`
    );
    err.status = 409;
    err.requiresConfirm = true;
    err.afectados = afectados;
    throw err;
  }

  if (afectados > 0) {
    await prisma.presupuesto.deleteMany({ where: { anio } });
  }

  await prisma.presupuestoAnio.upsert({
    where: { anio },
    update: { modo },
    create: { anio, modo },
  });

  await logPresupuestoModoChange(actor, anio, actual, modo, afectados).catch(() => {});
  if (actual !== modo) publicarCambioPresupuesto("modo", null, null, actor, { anio, modoAnterior: actual, modoNuevo: modo, borrados: afectados });
  return { anio, modo, cambiado: true, presupuestosBorrados: afectados };
}

// Crea o reemplaza el presupuesto de un área para un año — en el modo vigente
// de ese año (debe estar definido primero con setModoAnio).
export async function upsertPresupuesto(body, actor) {
  const area = (body.area || "").trim();
  const anio = Number(body.anio);
  if (!area) throw badRequest("El área es obligatoria.");
  if (!Number.isInteger(anio)) throw badRequest("El año es obligatorio.");

  const modo = await getModoAnio(anio);
  if (!modo) throw badRequest("Primero define si el presupuesto de este año se maneja por área o por categoría.");

  const existing = await prisma.presupuesto.findUnique({
    where: { area_anio: { area, anio } },
    include: { categorias: true },
  });
  const before = existing ? toClientPresupuesto(existing, modo) : null;

  let row;
  if (modo === "area") {
    const valorArea = Number(body.valorArea);
    if (!Number.isFinite(valorArea) || valorArea < 0) {
      throw badRequest("El presupuesto debe ser un número válido mayor o igual a 0.");
    }

    row = await prisma.presupuesto.upsert({
      where: { area_anio: { area, anio } },
      update: { valorArea },
      create: { area, anio, valorArea },
      include: { categorias: true },
    });
  } else {
    const categorias = Array.isArray(body.categorias) ? body.categorias : [];
    if (!categorias.length) throw badRequest("Agrega al menos una categoría con su presupuesto.");

    const seen = new Set();
    const clean = [];
    for (const c of categorias) {
      const nombre = (c.categoria || "").trim();
      const valor = Number(c.valor);
      if (!nombre) throw badRequest("Cada categoría debe tener un nombre.");
      if (!Number.isFinite(valor) || valor < 0) {
        throw badRequest(`El presupuesto de "${nombre}" debe ser un número válido mayor o igual a 0.`);
      }
      if (seen.has(nombre)) throw badRequest(`La categoría "${nombre}" está repetida.`);
      seen.add(nombre);
      clean.push({ categoria: nombre, valor });
    }

    row = await prisma.$transaction(async (tx) => {
      const presupuesto = await tx.presupuesto.upsert({
        where: { area_anio: { area, anio } },
        update: { valorArea: null, categorias: { deleteMany: {} } },
        create: { area, anio },
      });
      await tx.presupuestoCategoria.createMany({
        data: clean.map((c) => ({ presupuestoId: presupuesto.id, categoria: c.categoria, valor: c.valor })),
      });
      return tx.presupuesto.findUnique({ where: { id: presupuesto.id }, include: { categorias: true } });
    });
  }

  const after = toClientPresupuesto(row, modo);
  await logPresupuestoUpsert(actor, before, after).catch(() => {});
  publicarCambioPresupuesto(before ? "modificado" : "creado", before, after, actor);
  // Bajar un tope también puede dejarlo superado: se revisan el área (y cada categoría) y el general.
  for (const c of after.categorias?.length ? after.categorias : [{ categoria: null }]) revisarUmbralPresupuesto(after.area, c.categoria);
  return after;
}

export async function deletePresupuesto(id, actor) {
  const current = await prisma.presupuesto.findUnique({ where: { id }, include: { categorias: true } });
  if (!current) {
    const err = new Error("Presupuesto no encontrado.");
    err.status = 404;
    throw err;
  }
  const modo = await getModoAnio(current.anio);
  await prisma.presupuesto.delete({ where: { id } });
  await logPresupuestoDelete(actor, toClientPresupuesto(current, modo || "area")).catch(() => {});
  publicarCambioPresupuesto("eliminado", toClientPresupuesto(current, modo || "area"), null, actor);
}
