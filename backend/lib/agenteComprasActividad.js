import { prisma } from "@/lib/prisma";
import { generateStructuredJson } from "@/lib/aiStructured";
import { crearSolicitud } from "@/lib/solicitudesCompra";
import { hoyColombia } from "@/lib/hoyColombia";

// Agente que arma las compras de una actividad: busca las actividades parecidas del pasado que sí tuvieron compras y
// Nova propone la lista (qué comprar, categoría, proveedor que ya se usó y con cuántos días de anticipación). El valor
// estimado NO lo pone la IA: es el promedio de las compras anteriores que Nova cita como referencia; el total y la
// comparación con el presupuesto también los calcula el sistema. Nada se pide sin confirmar: con "Crear solicitudes" se
// crean las solicitudes de compra elegidas (auditadas como cualquier solicitud).

const VACIAS = new Set("de la el los las del y a en para por con un una al dia 2024 2025 2026 2027 2028".split(" "));
const palabras = (t) => new Set(String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VACIAS.has(w)));

function error(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

async function parecidas(act) {
  const pa = palabras(`${act.nombre} ${act.descripcion || ""}`);
  const mes = Number(String(act.fecha || "").slice(5, 7));
  const otras = await prisma.actividadBienestar.findMany({
    where: { id: { not: act.id }, compras: { some: {} } },
    select: {
      id: true, nombre: true, fecha: true, linea: true, asistentes: true, descripcion: true,
      compras: { select: { localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, categoria: true, categoriaId: true, valorConIva: true } },
    },
  });
  return otras
    .map((o) => {
      const po = palabras(`${o.nombre} ${o.descripcion || ""}`);
      let comunes = 0;
      for (const w of pa) if (po.has(w)) comunes++;
      const mismoMes = mes && Number(String(o.fecha || "").slice(5, 7)) === mes ? 1 : 0;
      return { o, p: comunes * 10 + mismoMes * 3 + (o.linea === act.linea ? 2 : 0) };
    })
    .filter((x) => x.p >= 10 || (x.p >= 5 && x.o.linea === act.linea))
    .sort((x, y) => y.p - x.p)
    .slice(0, 5)
    .map((x) => x.o);
}

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          descripcion: { type: "STRING" },
          categoria: { type: "STRING", nullable: true },
          proveedorSugerido: { type: "STRING", nullable: true },
          referencias: { type: "ARRAY", items: { type: "INTEGER" } },
          diasAntes: { type: "INTEGER" },
          razon: { type: "STRING" },
        },
        required: ["descripcion", "referencias", "diasAntes", "razon"],
      },
    },
    nota: { type: "STRING", nullable: true },
  },
  required: ["items"],
};

export async function sugerirCompras(actividadId) {
  const act = await prisma.actividadBienestar.findUnique({ where: { id: Number(actividadId) }, select: { id: true, nombre: true, descripcion: true, fecha: true, linea: true, estado: true, presupuesto: true, inscritos: true } });
  if (!act) throw error("Actividad no encontrada.", 404);
  if (act.estado === "cerrada") throw error("La actividad está cerrada: no recibe compras nuevas.");
  const [refs, yaTiene, solicitudes, categorias] = await Promise.all([
    parecidas(act),
    prisma.record.findMany({ where: { actividadId: act.id }, select: { descripcion: true, valorConIva: true } }),
    prisma.solicitudCompra.findMany({ where: { actividadId: act.id, estado: { in: ["pendiente", "generando"] } }, select: { descripcion: true, valorEstimado: true } }),
    prisma.maestro.findMany({ where: { tipo: "categoria", activo: true }, select: { id: true, valor: true } }),
  ]);
  const base = { actividad: act, presupuesto: act.presupuesto, parecidas: refs.map((o) => ({ id: o.id, nombre: o.nombre, fecha: o.fecha, compras: o.compras.length })) };
  const comprometido = yaTiene.reduce((s, c) => s + (c.valorConIva || 0), 0) + solicitudes.reduce((s, c) => s + (c.valorEstimado || 0), 0);
  if (!refs.length) return { ...base, items: [], comprometido, nota: "No encontré actividades parecidas que hayan tenido compras: no hay historial para proponer la lista." };

  const porNumero = new Map(refs.flatMap((o) => o.compras.map((c) => [c.localSeq, { ...c, actividad: o.nombre, actividadFecha: o.fecha }])));
  const r = await generateStructuredJson({
    systemInstruction: `Eres Nova y ayudas a planear las compras de una actividad de Bienestar de Sinco. Recibes la actividad nueva, lo que ya tiene comprado o pedido, y las compras de actividades parecidas del pasado (cada una con su número).
Propón la lista de compras que probablemente necesita la actividad nueva, basándote SOLO en esas compras anteriores: cada ítem debe citar en "referencias" los números de las compras anteriores en que se basa (al menos uno). No repitas lo que ya tiene comprado o pedido. "categoria" debe ser exactamente una de las categorías permitidas (o null). "proveedorSugerido": el proveedor que se usó en las referencias (o null). "diasAntes": con cuántos días de anticipación a la actividad debe llegar (según cuándo se pidieron las referencias). "razon": una frase corta. NO pongas valores en pesos: el sistema los calcula. Máximo 10 ítems. Si nada aplica, devuelve items vacío y explícalo en "nota".`,
    prompt: JSON.stringify({
      actividad: { nombre: act.nombre, descripcion: act.descripcion, fecha: act.fecha, linea: act.linea, inscritos: act.inscritos },
      yaComprado: yaTiene.map((c) => c.descripcion).slice(0, 20),
      yaPedido: solicitudes.map((c) => c.descripcion).slice(0, 20),
      categoriasPermitidas: categorias.map((c) => c.valor),
      actividadesParecidas: refs.map((o) => ({
        nombre: o.nombre, fecha: o.fecha, asistentes: o.asistentes,
        compras: o.compras.map((c) => ({ numero: c.localSeq, descripcion: (c.descripcion || "").slice(0, 160), proveedor: c.proveedor, categoria: c.categoria, pedidaDiasAntes: c.fechaSolicitud && o.fecha ? Math.round((Date.parse(o.fecha) - Date.parse(c.fechaSolicitud)) / 864e5) : null })),
      })),
    }),
    schema: ESQUEMA,
    budgetMs: 60000,
    cache: false,
  });

  const categoriaPorNombre = new Map(categorias.map((c) => [c.valor.toLowerCase(), c]));
  const hoy = hoyColombia();
  const items = (r?.items || []).slice(0, 10).map((it, i) => {
    const referencias = [...new Set((it.referencias || []).map(Number))].filter((n) => porNumero.has(n));
    const valores = referencias.map((n) => porNumero.get(n).valorConIva).filter((v) => v > 0);
    const cat = it.categoria ? categoriaPorNombre.get(String(it.categoria).toLowerCase()) : null;
    let fechaRequerida = null;
    if (act.fecha) {
      const d = new Date(`${act.fecha}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - Math.max(0, Math.min(90, Number(it.diasAntes) || 0)));
      fechaRequerida = d.toISOString().slice(0, 10);
      if (fechaRequerida < hoy) fechaRequerida = hoy;
    }
    return {
      clave: i,
      descripcion: String(it.descripcion || "").slice(0, 300),
      categoriaId: cat?.id || null,
      categoria: cat?.valor || null,
      proveedorSugerido: it.proveedorSugerido ? String(it.proveedorSugerido).slice(0, 200) : null,
      valorEstimado: valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null,
      fechaRequerida,
      razon: String(it.razon || "").slice(0, 300),
      referencias: referencias.map((n) => { const c = porNumero.get(n); return { numero: n, descripcion: c.descripcion, valor: c.valorConIva, actividad: c.actividad, fecha: c.fechaSolicitud }; }),
    };
  }).filter((it) => it.descripcion && it.referencias.length);
  const total = items.reduce((s, it) => s + (it.valorEstimado || 0), 0);
  return { ...base, items, total, comprometido, presupuesto: act.presupuesto, nota: r?.nota || null };
}

// Crea las solicitudes elegidas (las mismas reglas y auditoría que una solicitud hecha a mano).
export async function crearSolicitudesSugeridas(actividadId, items, actor) {
  if (!Array.isArray(items) || !items.length) throw error("Elige al menos una compra.");
  const creadas = [];
  for (const it of items.slice(0, 20)) {
    const refs = (it.referencias || []).map((r) => `#${r.numero ?? r}`).join(", ");
    creadas.push(await crearSolicitud(actividadId, {
      descripcion: it.descripcion,
      fechaRequerida: it.fechaRequerida,
      valorEstimado: it.valorEstimado,
      categoriaId: it.categoriaId || null,
      proveedorSugerido: it.proveedorSugerido,
      observaciones: `Sugerida por Nova a partir de compras anteriores${refs ? ` (${refs})` : ""}.`,
    }, actor));
  }
  return creadas;
}
