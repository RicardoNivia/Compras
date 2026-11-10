"use client";

import DashboardView from "@/components/DashboardView";

// El dashboard de proveedores vive ahora en Proveedores › Indicadores
// (ver app/(app)/proveedores/indicadores), así que aquí solo queda el de compras.
export default function DashboardTabs({ records, presupuestos }) {
  return <DashboardView records={records} presupuestos={presupuestos} />;
}
