import PanelCompras from "./PanelCompras";
import { prisma } from "../lib/prisma";
import { toClientRecord } from "../lib/records";

// Los datos vienen de SQLite en cada solicitud (no se pre-generan
// en el build, ya que en build time normalmente no hay conexión a la
// base de datos disponible).
export const dynamic = "force-dynamic";

export default async function Page() {
  let initialRecords = [];
  try {
    const records = await prisma.purchaseRecord.findMany({
      orderBy: [{ fechaSolicitud: "asc" }, { createdAt: "asc" }],
    });
    initialRecords = records.map(toClientRecord);
  } catch (err) {
    // Si la base de datos aún no está configurada (DATABASE_URL,
    // migraciones), el panel igual carga y se puede reintentar
    // recargando la página una vez esté lista.
    console.error("No se pudo leer la base de datos en la carga inicial:", err);
  }

  return <PanelCompras initialRecords={initialRecords} />;
}
