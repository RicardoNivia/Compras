"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { verificarFacturaApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { IconFile, IconCheck, IconAlert, IconInfo, IconSpark } from "@/components/icons";
import { CabezaAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import ElegirCompra from "@/components/compras/agentes/ElegirCompra";

const ESTADO = {
  coincide: { txt: "Coincide", clase: "ok", Icono: IconCheck },
  no_coincide: { txt: "No coincide", clase: "alerta", Icono: IconAlert },
  revisar: { txt: "Revisar", clase: "atencion", Icono: IconInfo },
  sin_dato: { txt: "Sin dato", clase: "info", Icono: IconInfo },
};
const valorTxt = (v) => (v == null || v === "" ? "—" : typeof v === "number" ? fmtCOP(v) : String(v));

// Verificador de factura: Nova lee la factura y el sistema la compara con el registro antes de legalizar. No cambia la
// compra; la verificación queda en la auditoría de la compra.
export default function VerificarFactura() {
  const [compra, setCompra] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [res, setRes] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);

  async function verificar() {
    setError("");
    setRes(null);
    setPensando(true);
    try {
      setRes(await verificarFacturaApi(compra.id, archivo));
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  }

  const v = res?.veredicto;
  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconFile size={22} />}
        color="turquesa"
        titulo="Verificar la factura antes de legalizar"
        descripcion="Sube la factura (PDF o foto): Nova la lee y el sistema la compara con el registro de la compra (NIT, proveedor, valores, número y fecha). Tú decides si legalizas."
        pasos={["Elige la compra", "Sube la factura", "Revisa qué coincide y qué no"]}
        paso={res ? 2 : compra ? 1 : 0}
      />
      <section className="ag-paso-card">
        <span className="ag-paso-card-num">1</span>
        <div className="ag-paso-card-cuerpo">
          <label><strong>¿De qué compra es la factura?</strong></label>
          <ElegirCompra valor={compra} onChange={(c) => { setCompra(c); setRes(null); }} />
        </div>
      </section>
      <section
        className={`ag-dropzone ag-dropzone-compacta ${arrastrando ? "activa" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (e.dataTransfer.files[0]) { setArchivo(e.dataTransfer.files[0]); setRes(null); } }}
      >
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => { if (e.target.files[0]) { setArchivo(e.target.files[0]); setRes(null); } e.target.value = ""; }} />
        <span className="ag-dropzone-icono" aria-hidden="true"><IconFile size={26} /></span>
        <strong>{archivo ? archivo.name : "Arrastra aquí la factura"}</strong>
        <span className="count-note">PDF o foto (JPG, PNG) · máximo 10 MB · los PDF con código o archivos incrustados se rechazan</span>
        <div className="ag-elegir">
          <button type="button" className="btn" onClick={() => input.current?.click()}>{archivo ? "Cambiar archivo" : "Elegir archivo"}</button>
          <button type="button" className="btn btn-primary ag-btn-grande" disabled={!compra || !archivo || pensando} onClick={verificar}>
            {pensando ? <><span className="spinner" /> Nova está leyendo la factura…</> : <><IconSpark size={15} /> Verificar</>}
          </button>
        </div>
      </section>
      {error && <div className="modal-error">{error}</div>}
      {!res && !pensando && <VacioAgente icono={<IconFile size={26} />} titulo="Elige la compra y sube su factura">El resultado queda en la auditoría de la compra; el registro no se modifica.</VacioAgente>}
      {res && (
        <section className="ag-lista-card">
          <div className={`ag-revision-veredicto ${v === "coincide" ? "ok" : v === "revisar" ? "atencion" : "alerta"} ag-veredicto-tarjeta`}>
            {v === "coincide" ? <IconCheck size={20} /> : <IconAlert size={20} />}
            <div>
              <strong>{v === "coincide" ? "La factura coincide con el registro" : v === "revisar" ? "Hay datos para revisar" : "La factura no coincide con el registro"}</strong>
              <p>Compra #{res.compra.numero ?? "—"} · {res.compra.descripcion} · estado de legalización: {res.estadoLegalizacion || "—"}. <Link href="/registros">Ir a Registros</Link></p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="records ficha-tabla ag-tabla">
              <thead><tr><th>Dato</th><th>En la factura</th><th>En el registro</th><th>Resultado</th></tr></thead>
              <tbody>
                {res.checks.map((c) => {
                  const e = ESTADO[c.estado] || ESTADO.sin_dato;
                  return (
                    <tr key={c.campo}>
                      <td><b>{c.campo}</b>{c.detalle && <span className="agente-aviso-fila">{c.detalle}</span>}</td>
                      <td>{valorTxt(c.enFactura)}</td>
                      <td>{valorTxt(c.enRegistro)}</td>
                      <td><span className={`ag-pill ${e.clase}`}><e.Icono size={11} /> {e.txt}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="ag-detalle ag-detalle-plano">
            <summary>Lo que Nova leyó de la factura</summary>
            <div className="ag-factura-leida">
              <span>Número: <b>{res.factura.numero || "—"}</b></span>
              <span>Fecha: <b>{res.factura.fecha || "—"}</b></span>
              <span>Emisor: <b>{res.factura.nombreEmisor || "—"}</b> ({res.factura.nitEmisor || "sin NIT"})</span>
              <span>Facturada a: <b>{res.factura.nombreReceptor || "—"}</b></span>
              <span>Subtotal: <b>{valorTxt(res.factura.subtotal)}</b> · IVA: <b>{valorTxt(res.factura.iva)}</b> · Total: <b>{valorTxt(res.factura.total)}</b></span>
              {res.factura.cufe && <span>CUFE: <span className="mono">{res.factura.cufe}</span></span>}
              {res.factura.items.length > 0 && <span>Ítems: {res.factura.items.join(" · ")}</span>}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
