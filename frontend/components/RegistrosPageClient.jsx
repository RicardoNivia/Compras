"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import RegistrosView from "@/components/RegistrosView";
import ExportMenu from "@/components/ExportMenu";

export default function RegistrosPageClient({ user, initialRecords, currentUser, maestros, proveedores = [], alertasProveedores = {}, presupuestos = [], actividades = [], nuevaCompraActividad = null }) {
  const [records, setRecords] = useState(initialRecords || []);
  const [filtered, setFiltered] = useState(initialRecords || []);

  return (
    <AppShell
      user={user}
      title="Registros"
      subtitle={`${records.length} registros`}
      actions={<ExportMenu allRecords={records} filteredRecords={filtered} />}
    >
      <RegistrosView
        records={records}
        setRecords={setRecords}
        onFilteredChange={setFiltered}
        currentUser={currentUser}
        maestros={maestros}
        proveedores={proveedores}
        alertasProveedores={alertasProveedores}
        presupuestos={presupuestos}
        actividades={actividades}
        nuevaCompraActividad={nuevaCompraActividad}
      />
    </AppShell>
  );
}
