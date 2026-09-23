"use client";

import { useState } from "react";
import RegistrosView from "@/components/RegistrosView";
import ExportMenu from "@/components/ExportMenu";

export default function RegistrosPageClient({ initialRecords, currentUser, maestros }) {
  const [records, setRecords] = useState(initialRecords || []);
  const [filtered, setFiltered] = useState(initialRecords || []);

  return (
    <div>
      <div className="view-head">
        <div className="spacer" />
        <ExportMenu allRecords={records} filteredRecords={filtered} />
      </div>
      <RegistrosView
        records={records}
        setRecords={setRecords}
        onFilteredChange={setFiltered}
        currentUser={currentUser}
        maestros={maestros}
      />
    </div>
  );
}
