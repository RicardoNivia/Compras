"use client";

import { useState } from "react";
import { crossfade } from "@/lib/crossfade";
import { COTIZADOR_COMPRAS } from "@/lib/api";
import RevisorCompra from "@/components/compras/agentes/RevisorCompra";
import ProveedorPrecio from "@/components/compras/agentes/ProveedorPrecio";
import VerificarFactura from "@/components/compras/agentes/VerificarFactura";
import VigiaPresupuesto from "@/components/compras/agentes/VigiaPresupuesto";
import Anomalias from "@/components/compras/agentes/Anomalias";
import Cotizador from "@/components/bienestar/agentes/Cotizador";
import { IconCheck, IconBuilding, IconMoney, IconFile, IconTrendUp, IconAlert, IconSpark } from "@/components/icons";

// Los agentes de Compras. permisos: { agentes, presupuesto, anomalias } — cada agente se muestra solo si se puede usar.
const AGENTES = [
  { k: "revisor", permiso: "agentes", color: "verde", Icono: IconCheck, titulo: "Revisor de la compra", nota: "Revisa una compra contra el procedimiento antes de seguir", cuando: "Antes de guardar o tramitar una compra" },
  { k: "proveedor", permiso: "agentes", color: "azul", Icono: IconBuilding, titulo: "Proveedor y precio", nota: "A quién se le ha comprado algo parecido y a qué precio", cuando: "Antes de pedir cotizaciones" },
  { k: "cotizador", permiso: "agentes", color: "ambar", Icono: IconMoney, titulo: "Cotizador", nota: "Lee las cotizaciones y arma el cuadro comparativo", cuando: "Cuando tienes 2 o más cotizaciones" },
  { k: "factura", permiso: "agentes", color: "turquesa", Icono: IconFile, titulo: "Verificar factura", nota: "Compara la factura con el registro antes de legalizar", cuando: "Al legalizar" },
  { k: "presupuesto", permiso: "presupuesto", color: "rojo", Icono: IconTrendUp, titulo: "Vigía de presupuesto", nota: "En qué mes se agotaría el presupuesto de cada área", cuando: "Para planear el gasto del año" },
  { k: "anomalias", permiso: "anomalias", color: "morado", Icono: IconAlert, titulo: "Detector de anomalías", nota: "Compras partidas, duplicados, precios disparados", cuando: "Para control interno" },
];

export default function AgentesComprasView({ permisos, tabInicial }) {
  const visibles = AGENTES.filter((a) => permisos[a.permiso]);
  const [tab, setTab] = useState(visibles.some((a) => a.k === tabInicial) ? tabInicial : visibles[0]?.k);
  return (
    <div className="agentes">
      <section className="ag-hero">
        <div className="ag-hero-txt">
          <span className="ag-hero-chip"><IconSpark size={13} /> Agentes de Nova · Compras</span>
          <h1>¿En qué te ayudo hoy?</h1>
          <p>Elige un agente. El sistema calcula y Nova explica: <b>ningún agente cambia una compra; tú decides.</b></p>
        </div>
        <div className="ag-hero-orbe" aria-hidden="true"><span /><span /><span /><IconSpark size={24} /></div>
      </section>

      <div className="ag-selector ag-selector-seis" role="tablist" aria-label="Agentes">
        {visibles.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={tab === a.k} className={`ag-opcion ag-${a.color}`} onClick={() => crossfade(() => setTab(a.k))}>
            <span className="ag-icono" aria-hidden="true"><a.Icono size={22} /></span>
            <span className="ag-opcion-txt">
              <strong>{a.titulo}</strong>
              <span>{a.nota}</span>
              <em>{a.cuando}</em>
            </span>
            <span className="ag-opcion-check" aria-hidden="true"><IconCheck size={13} /></span>
          </button>
        ))}
      </div>

      <div data-crossfade>
        {tab === "revisor" && <RevisorCompra />}
        {tab === "proveedor" && <ProveedorPrecio />}
        {tab === "cotizador" && <Cotizador base={COTIZADOR_COMPRAS} conCompra />}
        {tab === "factura" && <VerificarFactura />}
        {tab === "presupuesto" && <VigiaPresupuesto />}
        {tab === "anomalias" && <Anomalias />}
      </div>
    </div>
  );
}
