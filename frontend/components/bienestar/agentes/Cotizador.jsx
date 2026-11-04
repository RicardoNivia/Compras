"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCuadrosApi, extraerCotizacionApi, crearCuadroApi, eliminarCuadroApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconSpark, IconTrash } from "@/components/icons";

const ACEPTA = ".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png";
const pctTxt = (p) => (p == null ? "—" : p === 0 ? "La más económica" : `+${(p * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

// Agente cotizador: sube las cotizaciones, Nova lee cada una y el sistema arma el cuadro comparativo (totales,
// diferencias y si el procedimiento exige cuadro), con la recomendación de Nova. Se guarda y se descarga en PDF.
export default function Cotizador() {
  const [cuadros, setCuadros] = useState(null);
  const [salario, setSalario] = useState(null);
  const [archivos, setArchivos] = useState([]); // { nombre, estado: leyendo|lista|rechazada, cotizacion?, error? }
  const [titulo, setTitulo] = useState("");
  const [armando, setArmando] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState("");
  const [borrar, setBorrar] = useState(null);
  const input = useRef(null);

  const cargar = () => fetchCuadrosApi().then((r) => { setCuadros(r.cuadros); setSalario(r.salario); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const pag = usePagina(cuadros || [], "");

  async function subir(lista) {
    const nuevos = [...lista].slice(0, 6 - archivos.length);
    if (!nuevos.length) return;
    setError("");
    setArchivos((a) => [...a, ...nuevos.map((f) => ({ nombre: f.name, estado: "leyendo" }))]);
    for (const f of nuevos) {
      try {
        const { cotizacion } = await extraerCotizacionApi(f);
        setArchivos((a) => a.map((x) => (x.nombre === f.name && x.estado === "leyendo" ? { ...x, estado: "lista", cotizacion } : x)));
      } catch (e) {
        setArchivos((a) => a.map((x) => (x.nombre === f.name && x.estado === "leyendo" ? { ...x, estado: "rechazada", error: e.message } : x)));
      }
    }
  }

  const listas = archivos.filter((a) => a.estado === "lista");
  const leyendo = archivos.some((a) => a.estado === "leyendo");

  async function armar() {
    setError("");
    setArmando(true);
    try {
      const { cuadro } = await crearCuadroApi({ titulo, cotizaciones: listas.map((a) => a.cotizacion) });
      setAbierto(cuadro);
      setArchivos([]);
      setTitulo("");
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setArmando(false);
    }
  }

  async function eliminar(c) {
    try {
      await eliminarCuadroApi(c.id);
      setBorrar(null);
      if (abierto?.id === c.id) setAbierto(null);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="agente-panel">
      <section className="agente-cabeza">
        <div className="agente-cabeza-texto">
          <h2><IconSpark size={18} /> Cotizador: cuadro comparativo</h2>
          <p>Sube las cotizaciones (PDF, Excel, CSV o foto). Nova lee de cada una el proveedor, los ítems, el total y las condiciones; el sistema calcula las diferencias y te dice si el procedimiento exige cuadro comparativo{salario ? ` (más de 2 SMMLV en compras administrativas = ${fmtCOP(2 * salario.valor)}; 4 SMMLV en técnicas = ${fmtCOP(4 * salario.valor)}, con el salario mínimo ${salario.anio} de ${fmtCOP(salario.valor)})` : ""}. Los archivos peligrosos se rechazan.</p>
          {salario && !salario.exacto && <p className="agente-aviso-fila">No hay salario mínimo de {salario.anioPedido} en Maestros: se usa el de {salario.anio}. Agrégalo en Maestros › Salario mínimo.</p>}
          {salario === null && cuadros && <p className="agente-aviso-fila">No hay salario mínimo en Maestros: el cuadro no podrá decir si el procedimiento lo exige. Agrégalo en Maestros › Salario mínimo.</p>}
        </div>
      </section>

      <div
        className="fotos-zona agente-zona"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); subir(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" accept={ACEPTA} multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={archivos.length >= 6}>Subir cotizaciones</button>
        <span className="count-note">o arrástralas aquí · de 2 a 6 por cuadro · lo ideal son 3 proveedores</span>
      </div>

      {archivos.length > 0 && (
        <div className="agente-archivos">
          {archivos.map((a, i) => (
            <div key={`${a.nombre}-${i}`} className={`agente-archivo ${a.estado}`}>
              <span className="agente-archivo-nombre">{a.nombre}</span>
              {a.estado === "leyendo" && <span><span className="spinner" /> Nova lo está leyendo…</span>}
              {a.estado === "lista" && <span><b>{a.cotizacion.proveedor || "Proveedor sin identificar"}</b> · {a.cotizacion.total != null ? fmtCOP(a.cotizacion.total) : "sin total"} · {a.cotizacion.items.length} ítem(s)</span>}
              {a.estado === "rechazada" && <span className="agente-rojo">{a.error}</span>}
              <button type="button" className="icon-action-btn" aria-label={`Quitar ${a.nombre}`} disabled={a.estado === "leyendo"} onClick={() => setArchivos((l) => l.filter((_, k) => k !== i))}><IconTrash size={14} /></button>
            </div>
          ))}
          <div className="agente-filtros">
            <input placeholder="¿Qué se está cotizando? (ej. Refrigerios Día del Niño)" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Nombre del cuadro" style={{ minWidth: 340 }} />
            <button type="button" className="btn btn-primary" disabled={listas.length < 2 || leyendo || armando || !titulo.trim()} onClick={armar}>
              {armando ? <><span className="spinner" /> Armando el cuadro…</> : `Armar cuadro con ${listas.length} cotización(es)`}
            </button>
          </div>
        </div>
      )}

      {error && <div className="modal-error">{error}</div>}

      {abierto && <CuadroVista cuadro={abierto} onCerrar={() => setAbierto(null)} />}

      <section className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead><tr><th>Cuadro</th><th>Fecha</th><th>Proveedores</th><th>Más económica</th><th>Creado por</th><th className="actions-col">Acciones</th></tr></thead>
            <tbody>
              {!cuadros && <tr><td colSpan={6}><div className="skeleton-bar" style={{ height: 34, borderRadius: 8 }} /></td></tr>}
              {cuadros && pag.pagina.length === 0 && <tr><td colSpan={6}><div className="empty">Aún no hay cuadros comparativos.</div></td></tr>}
              {pag.pagina.map((c) => {
                const comp = c.datos.comparacion;
                const mejor = comp.mejorIndice != null ? comp.filas[comp.mejorIndice] : null;
                return (
                  <tr key={c.id}>
                    <td><span className="desc-tooltip-wrap" style={{ maxWidth: 280 }}><span className="desc-text">{c.titulo}</span><span className="desc-tooltip-bubble">{c.titulo}</span></span></td>
                    <td>{new Date(c.createdAt).toLocaleDateString("es-CO")}</td>
                    <td>{comp.filas.length}</td>
                    <td>{mejor ? `${mejor.proveedor} · ${fmtCOP(mejor.total)}` : "—"}</td>
                    <td>{c.creadoPorNombre || "—"}</td>
                    <td className="actions-cell">
                      <span className="agente-acciones">
                        <button type="button" className="btn small" onClick={() => setAbierto(c)}>Ver</button>
                        {borrar === c.id
                          ? <><button type="button" className="btn small agente-borrar" onClick={() => eliminar(c)}>Sí, eliminar</button><button type="button" className="btn small" onClick={() => setBorrar(null)}>No</button></>
                          : <button type="button" className="icon-action-btn" aria-label={`Eliminar ${c.titulo}`} onClick={() => setBorrar(c.id)}><IconTrash size={14} /></button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PiePagina id="cuadros-size" p={pag} total={(cuadros || []).length} etiqueta="cuadro(s)" />
      </section>
    </div>
  );
}

function CuadroVista({ cuadro, onCerrar }) {
  const { cotizaciones, comparacion: comp, recomendado } = cuadro.datos;
  const u = comp.umbral;
  const valor = comp.mejorIndice != null ? comp.filas[comp.mejorIndice].total : null;

  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(15);
    doc.text(`Cuadro comparativo · ${cuadro.titulo}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`${new Date(cuadro.createdAt).toLocaleDateString("es-CO")} · ${cuadro.creadoPorNombre || ""} · Armado con el agente cotizador de Nova`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Proveedor", "NIT", "Total", "Diferencia", "Entrega", "Forma de pago", "Validez"]],
      body: comp.filas.map((f, i) => [
        `${f.proveedor}${i === comp.mejorIndice ? " (más económica)" : ""}${i === recomendado ? " · recomendada" : ""}`,
        cotizaciones[i].nit || "", f.total != null ? fmtCOP(f.total) : "—", pctTxt(f.diferencia?.pct), cotizaciones[i].tiempoEntrega || "", cotizaciones[i].formaPago || "", cotizaciones[i].validez || "",
      ]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [31, 111, 178] },
    });
    let y = doc.lastAutoTable.finalY + 6;
    for (const [i, c] of cotizaciones.entries()) {
      autoTable(doc, { startY: y, head: [[`${comp.filas[i].proveedor} · ítems`, "Cant.", "Vr. unitario", "Vr. total"]], body: c.items.map((it) => [it.descripcion, it.cantidad ?? "", it.valorUnitario != null ? fmtCOP(it.valorUnitario) : "", it.valorTotal != null ? fmtCOP(it.valorTotal) : ""]), styles: { fontSize: 8 }, headStyles: { fillColor: [74, 91, 112] } });
      y = doc.lastAutoTable.finalY + 4;
    }
    const lineas = doc.splitTextToSize(`Recomendación de Nova: ${cuadro.recomendacion || "sin recomendación"}`, 268);
    if (y + lineas.length * 4.5 > 195) { doc.addPage(); y = 16; }
    doc.setFontSize(9.5);
    doc.text(lineas, 14, y + 4);
    doc.save(`cuadro-comparativo-${cuadro.id}.pdf`);
  }

  return (
    <section className="agente-cuadro" aria-label={`Cuadro comparativo ${cuadro.titulo}`}>
      <div className="agente-cuadro-cabeza">
        <h3>{cuadro.titulo}</h3>
        <span className="agente-acciones">
          <button type="button" className="btn" onClick={pdf}>Descargar PDF</button>
          <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
        </span>
      </div>
      <div className={`agente-umbral ${u.requiereAdministrativa ? "exige" : ""}`}>
        {valor == null ? "No se pudo calcular el total más bajo." : !u.smmlv ? "No había salario mínimo en Maestros al armar este cuadro: no se pudo medir el umbral del procedimiento." : u.requiereAdministrativa
          ? <>La compra ({fmtCOP(valor)}) supera 2 SMMLV ({fmtCOP(u.administrativa)}): si es administrativa <b>exige cuadro comparativo</b>{u.requiereTecnica ? " (y también si es técnica, supera 4 SMMLV)" : `; si es técnica, el umbral es 4 SMMLV (${fmtCOP(u.tecnica)})`}.</>
          : <>La compra ({fmtCOP(valor)}) no supera 2 SMMLV ({fmtCOP(u.administrativa)}): el procedimiento no exige cuadro comparativo, pero queda como soporte.</>}
        {u.smmlv && u.smmlvAnio ? ` (SMMLV ${u.smmlvAnio}: ${fmtCOP(u.smmlv)}.)` : ""}
        {" "}{u.suficientes ? `Tiene ${u.cotizaciones} cotizaciones (mínimo 3).` : `Tiene ${u.cotizaciones} cotizaciones: el mínimo es 3, o 2 con soporte de las rechazadas.`}
      </div>
      <div className="table-scroll">
        <table className="records ficha-tabla agente-tabla">
          <thead><tr><th>Proveedor</th><th className="num">Total</th><th>Diferencia</th><th>Entrega</th><th>Forma de pago</th><th>Validez</th><th>Ítems</th></tr></thead>
          <tbody>
            {comp.filas.map((f, i) => (
              <tr key={i} className={i === comp.mejorIndice ? "agente-mejor" : ""}>
                <td>
                  <b>{f.proveedor}</b>{cotizaciones[i].nit ? <span className="muted"> · NIT {cotizaciones[i].nit}</span> : null}
                  {i === recomendado && <span className="agente-conf alta" style={{ marginLeft: 8 }}>Recomendada por Nova</span>}
                  {f.avisos.length > 0 && <span className="agente-aviso-fila">{f.avisos.join(" ")}</span>}
                </td>
                <td className="num">{f.total != null ? fmtCOP(f.total) : "—"}</td>
                <td>{pctTxt(f.diferencia?.pct)}{f.diferencia?.valor ? <span className="muted"> ({fmtCOP(f.diferencia.valor)})</span> : null}</td>
                <td>{cotizaciones[i].tiempoEntrega || "—"}</td>
                <td>{cotizaciones[i].formaPago || "—"}</td>
                <td>{cotizaciones[i].validez || "—"}</td>
                <td>
                  <details className="agente-items">
                    <summary>{cotizaciones[i].items.length} ítem(s)</summary>
                    <ul>{cotizaciones[i].items.map((it, k) => <li key={k}>{it.descripcion}{it.cantidad != null ? ` · ${it.cantidad}` : ""}{it.valorTotal != null ? ` · ${fmtCOP(it.valorTotal)}` : ""}</li>)}</ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cuadro.recomendacion && <div className="agente-recomendacion"><IconSpark size={15} /> <span><b>Recomendación de Nova.</b> {cuadro.recomendacion}</span></div>}
    </section>
  );
}
