"use client";

import { useState } from "react";
import { revisarCompraApi } from "@/lib/api";
import { IconCheck, IconSearch } from "@/components/icons";
import { CabezaAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import ElegirCompra from "@/components/compras/agentes/ElegirCompra";
import HallazgosRevision from "@/components/compras/agentes/HallazgosRevision";

// Revisor de una compra ya registrada (el mismo revisor está en el formulario de Registros, botón «Revisar la compra»,
// para revisarla antes de guardar). No cambia nada: solo avisa.
export default function RevisorCompra() {
  const [compra, setCompra] = useState(null);
  const [revision, setRevision] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");

  async function revisar(c = compra) {
    if (!c) return;
    setError("");
    setRevision(null);
    setPensando(true);
    try {
      const todos = await fetch("/api/records", { cache: "no-store" }).then((r) => r.json());
      const r = (todos.records || todos).find((x) => x.id === c.id);
      setRevision(await revisarCompraApi(r || c, c.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  }

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconCheck size={22} />}
        color="verde"
        titulo="Revisor de la compra"
        descripcion="Revisa una compra contra el procedimiento antes de seguir con ella. También está en el formulario de Registros: botón «Revisar la compra» antes de guardar."
        pasos={["Elige la compra", "El sistema revisa umbral, proveedor, duplicados y precio", "Nova revisa la categoría y te resume", "Tú decides qué corregir"]}
        paso={revision ? 3 : pensando ? 1 : compra ? 1 : 0}
      />
      <section className="ag-paso-card">
        <span className="ag-paso-card-num">1</span>
        <div className="ag-paso-card-cuerpo">
          <label><strong>¿Qué compra reviso?</strong> <small>Revisa: cuadro comparativo según el SMMLV, compra partida, estado del proveedor, posibles duplicados, factura repetida y precio frente a compras parecidas.</small></label>
          <div className="ag-elegir">
            <ElegirCompra valor={compra} onChange={(c) => { setCompra(c); setRevision(null); }} />
            <button type="button" className="btn btn-primary ag-btn-grande" disabled={!compra || pensando} onClick={() => revisar()}>
              {pensando ? <><span className="spinner" /> Revisando…</> : <><IconSearch size={16} /> Revisar</>}
            </button>
          </div>
        </div>
      </section>
      {error && <div className="modal-error">{error}</div>}
      {revision ? <section className="ag-lista-card ag-pad"><HallazgosRevision revision={revision} /></section>
        : !pensando && <VacioAgente icono={<IconCheck size={26} />} titulo="Elige una compra para revisarla">Nada se cambia: el revisor solo te dice qué mirar.</VacioAgente>}
    </div>
  );
}
