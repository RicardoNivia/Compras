// Convierte entre las filas de SQL Server (via Prisma) y el formato
// plano que espera app-logic.js (fechas como "YYYY-MM-DD", igual que en
// el archivo original).

function toDateStr(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function strOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Fila de Prisma -> objeto plano para el navegador
export function toClientRecord(r) {
  return {
    id: r.id,
    informe: r.informe,
    fechaSolicitud: toDateStr(r.fechaSolicitud),
    fechaEntrega: toDateStr(r.fechaEntrega),
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    descripcion: r.descripcion,
    medioPago: r.medioPago,
    licitacion: r.licitacion,
    estadoLegalizacion: r.estadoLegalizacion,
    proveedor: r.proveedor,
    fe: r.fe,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    valorCot: r.valorCot,
    observaciones: r.observaciones,
    radicado: !!r.radicado,
  };
}

// Body recibido del navegador (POST/PUT) -> datos listos para Prisma
export function fromClientPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de la solicitud inválido");
  }
  if (!strOrNull(body.descripcion)) {
    throw new Error("descripcion es obligatoria");
  }
  return {
    informe: strOrNull(body.informe),
    fechaSolicitud: body.fechaSolicitud ? new Date(body.fechaSolicitud) : null,
    fechaEntrega: body.fechaEntrega ? new Date(body.fechaEntrega) : null,
    area: strOrNull(body.area),
    responsable: strOrNull(body.responsable),
    estado: strOrNull(body.estado),
    categoria: strOrNull(body.categoria),
    descripcion: strOrNull(body.descripcion),
    medioPago: strOrNull(body.medioPago),
    licitacion: strOrNull(body.licitacion),
    estadoLegalizacion: strOrNull(body.estadoLegalizacion),
    proveedor: strOrNull(body.proveedor),
    fe: strOrNull(body.fe),
    valorConIva: numOrNull(body.valorConIva),
    valorSinIva: numOrNull(body.valorSinIva),
    valorCot: numOrNull(body.valorCot),
    observaciones: strOrNull(body.observaciones),
    radicado: !!body.radicado,
  };
}
