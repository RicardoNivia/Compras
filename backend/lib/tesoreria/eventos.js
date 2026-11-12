import { prisma } from "@/lib/prisma";
import { publicarEvento } from "@/lib/notificacionesEventos";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { fmtMoneda } from "@/lib/tesoreria/comun";

// Eventos de Tesorería para las notificaciones (lib/notificacionesEventos.js): «un pago pasó a pagado (E)» y «se
// registró un movimiento del banco». Se publican DESPUÉS de la escritura (con un pequeño retraso para que la transacción
// ya esté confirmada) y vuelven a leer el dato: si la transacción se deshizo, no se avisa nada. Nunca lanzan ni frenan
// la escritura original. La carga masiva de la plantilla no publica eventos (es historia, no hechos nuevos).

const despues = (fn) => setTimeout(() => { fn().catch(() => {}); }, 1200);

// via: cómo pasó a E («asociado al movimiento del banco», «marcado a mano», «aprobado desde el agente»…).
export function publicarPagoPagado(pagoId, actor, via) {
  despues(async () => {
    const p = await prisma.pagoProgramado.findUnique({ where: { id: Number(pagoId) }, include: { asociaciones: { select: { valor: true, movimiento: { select: { fecha: true, bancoId: true } } } } } });
    if (!p || p.estado !== "E") return;
    const m = await mapasCatalogos();
    const mov = p.asociaciones.map((a) => a.movimiento).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    await publicarEvento("tesoreria.pago_pagado", {
      entidadId: p.id,
      clave: `tesoreria.pago_pagado|${p.id}|${p.updatedAt.toISOString()}`,
      actor,
      datos: {
        pagoId: p.id, concepto: m.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? m.items.get(p.itemId)?.nombre : null,
        medio: p.medioPagoId ? m.medios.get(p.medioPagoId)?.nombre : null, paga: p.pagadorId ? m.pagadores.get(p.pagadorId)?.nombre : null,
        valor: Number(p.valor), valorTexto: fmtMoneda(p.valor, p.moneda), vence: p.fecha, pagadoEl: mov?.fecha || null,
        banco: mov ? m.bancos.get(mov.bancoId)?.nombre : null, via: via || (p.estadoPor === "asociacion" ? "Asociado al movimiento del banco" : "Marcado como pagado"),
        sentido: Number(p.valor) < 0 ? "sale" : "entra", actualizadoPor: actor?.nombre || null,
      },
    });
    // Pagado por un valor distinto al programado (lo asociado no da lo que se esperaba).
    const asociado = p.asociaciones.reduce((s, a) => s + Number(a.valor), 0);
    const programado = Math.abs(Number(p.valor));
    if (p.asociaciones.length && Math.abs(asociado - programado) > 0.5) {
      await publicarEvento("tesoreria.pago_con_diferencia", {
        entidadId: p.id, clave: `tesoreria.pago_con_diferencia|${p.id}|${p.updatedAt.toISOString()}`, actor,
        datos: { pagoId: p.id, concepto: m.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? m.items.get(p.itemId)?.nombre : null, medio: p.medioPagoId ? m.medios.get(p.medioPagoId)?.nombre : null, valor: asociado, valorTexto: fmtMoneda(asociado, p.moneda), programadoTexto: fmtMoneda(programado, p.moneda), diferenciaTexto: fmtMoneda(asociado - programado, p.moneda), pagadoEl: mov?.fecha || null, banco: mov ? m.bancos.get(mov.bancoId)?.nombre : null, actualizadoPor: actor?.nombre || null },
      });
    }
  });
}

// ids: uno o varios movimientos recién creados. via: «a mano», «desde el extracto «x»», «con soporte»…
export function publicarMovimientosRegistrados(ids, actor, via) {
  const lista = [].concat(ids).map(Number).filter(Boolean).slice(0, 200);
  if (!lista.length) return;
  despues(async () => {
    const movs = await prisma.movimientoBanco.findMany({ where: { id: { in: lista } } });
    const m = await mapasCatalogos();
    for (const x of movs) {
      await publicarEvento("tesoreria.movimiento_registrado", {
        entidadId: x.id,
        clave: `tesoreria.movimiento_registrado|${x.id}`,
        actor,
        datos: {
          movimientoId: x.id, fecha: x.fecha, banco: m.bancos.get(x.bancoId)?.nombre || null, descripcion: x.descripcion, concepto: x.concepto, tercero: x.tercero,
          valor: Number(x.valor), valorTexto: fmtMoneda(x.tipo === "debito" ? -Number(x.valor) : Number(x.valor), x.moneda), sentido: x.tipo === "debito" ? "sale" : "entra",
          via: via || "registrado", registradoPor: actor?.nombre || x.creadoPorNombre || null,
        },
      });
    }
  });
}
