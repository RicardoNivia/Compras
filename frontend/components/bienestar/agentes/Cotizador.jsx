"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCuadrosApi, extraerCotizacionApi, crearCuadroApi, eliminarCuadroApi, COTIZADOR_BIENESTAR } from "@/lib/api";
import ElegirCompra from "@/components/compras/agentes/ElegirCompra";
import { fmtCOP } from "@/lib/format";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconSpark, IconTrash, IconMoney, IconFile, IconCheck, IconAlert, IconDownload, IconStar, IconInfo, IconEye } from "@/components/icons";
import { CabezaAgente, VacioAgente } from "@/components/bienestar/agentes/comun";

const ACEPTA = ".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png";
const pctTxt = (p) => (p == null ? "—" : p === 0 ? "La más económica" : `+${(p * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

// Agente cotizador: sube las cotizaciones, Nova lee cada una y el sistema arma el cuadro comparativo (totales,
// diferencias y si el procedimiento exige cuadro), con la recomendación de Nova. Se guarda y se descarga en PDF.
// base: ruta de la API del módulo (Bienestar o Compras). conCompra: en Compras el cuadro puede quedar adjunto a una compra.
export default function Cotizador({ base = COTIZADOR_BIENESTAR, conCompra = false, compraInicial = null }) {
  const [compra, setCompra] = useState(compraInicial);
  const [cuadros, setCuadros] = useState(null);
  const [salario, setSalario] = useState(null);
  const [archivos, setArchivos] = useState([]); // { nombre, estado: leyendo|lista|rechazada, cotizacion?, error? }
  const [titulo, setTitulo] = useState("");
  const [armando, setArmando] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState("");
  const [borrar, setBorrar] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);

  const cargar = () => fetchCuadrosApi(base).then((r) => { setCuadros(r.cuadros); setSalario(r.salario); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const pag = usePagina(cuadros || [], "");

  async function subir(lista) {
    const nuevos = [...lista].slice(0, 6 - archivos.length);
    if (!nuevos.length) return;
    setError("");
    setArchivos((a) => [...a, ...nuevos.map((f) => ({ nombre: f.name, estado: "leyendo" }))]);
    for (const f of nuevos) {
      try {
        const { cotizacion } = await extraerCotizacionApi(f, base);
        setArchivos((a) => a.map((x) => (x.nombre === f.name && x.estado === "leyendo" ? { ...x, estado: "lista", cotizacion } : x)));
      } catch (e) {
        setArchivos((a) => a.map((x) => (x.nombre === f.name && x.estado === "leyendo" ? { ...x, estado: "rechazada", error: e.message } : x)));
      }
    }
  }

  const listas = archivos.filter((a) => a.estado === "lista");
  const leyendo = archivos.some((a) => a.estado === "leyendo");
  const paso = abierto ? 3 : listas.length >= 2 ? 2 : archivos.length ? 1 : 0;

  async function armar() {
    setError("");
    setArmando(true);
    try {
      const { cuadro } = await crearCuadroApi({ titulo, recordId: conCompra ? compra?.id || null : undefined, cotizaciones: listas.map((a) => a.cotizacion) }, base);
      setAbierto(cuadro);
      setArchivos([]);
      setTitulo("");
      setCompra(null);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setArmando(false);
    }
  }

  async function eliminar(c) {
    try {
      await eliminarCuadroApi(c.id, base);
      setBorrar(null);
      if (abierto?.id === c.id) setAbierto(null);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconMoney size={22} />}
        color="ambar"
        titulo="Cotizador: cuadro comparativo"
        descripcion="Sube las cotizaciones y Nova lee de cada una el proveedor, los ítems, el total y las condiciones. El sistema calcula las diferencias y te dice si el procedimiento exige cuadro comparativo."
        pasos={["Sube de 2 a 6 cotizaciones", "Nova lee cada una", "Ponle nombre y arma el cuadro", "Revisa la recomendación y descarga el PDF"]}
        paso={paso}
      />

      {salario && (
        <div className="ag-aviso">
          <IconInfo size={16} />
          <span>
            Umbral del procedimiento con el salario mínimo {salario.anio} ({fmtCOP(salario.valor)}): compras administrativas desde <b>{fmtCOP(2 * salario.valor)}</b> (2 SMMLV) y técnicas desde <b>{fmtCOP(4 * salario.valor)}</b> (4 SMMLV).
            {!salario.exacto && ` No hay salario mínimo de ${salario.anioPedido} en Maestros: se usa el de ${salario.anio}.`}
          </span>
        </div>
      )}
      {salario === null && cuadros && <div className="ag-aviso alerta"><IconAlert size={16} /> <span>No hay salario mínimo en Maestros: el cuadro no podrá decir si el procedimiento lo exige. Agrégalo en Maestros › Salario mínimo.</span></div>}

      <section
        className={`ag-dropzone ${arrastrando ? "activa" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" accept={ACEPTA} multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        <span className="ag-dropzone-icono" aria-hidden="true"><IconFile size={28} /></span>
        <strong>Arrastra aquí las cotizaciones</strong>
        <span className="count-note">PDF, Excel, CSV o foto · de 2 a 6 por cuadro · lo ideal son 3 proveedores · los archivos peligrosos se rechazan</span>
        <button type="button" className="btn btn-primary ag-btn-grande" onClick={() => input.current?.click()} disabled={archivos.length >= 6}>Elegir archivos</button>
      </section>

      {archivos.length > 0 && (
        <section className="ag-lista-card">
          <div className="ag-archivos-grid">
            {archivos.map((a, i) => (
              <div key={`${a.nombre}-${i}`} className={`ag-archivo ${a.estado}`}>
                <div className="ag-archivo-cabeza">
                  <span className="ag-archivo-icono" aria-hidden="true">{a.estado === "lista" ? <IconCheck size={15} /> : a.estado === "rechazada" ? <IconAlert size={15} /> : <span className="spinner" />}</span>
                  <span className="ag-archivo-nombre" title={a.nombre}>{a.nombre}</span>
                  <button type="button" className="icon-action-btn" aria-label={`Quitar ${a.nombre}`} disabled={a.estado === "leyendo"} onClick={() => setArchivos((l) => l.filter((_, k) => k !== i))}><IconTrash size={14} /></button>
                </div>
                {a.estado === "leyendo" && <span className="muted">Nova lo está leyendo…</span>}
                {a.estado === "lista" && (
                  <>
                    <strong className="ag-archivo-prov">{a.cotizacion.proveedor || "Proveedor sin identificar"}</strong>
                    <span className="ag-archivo-total">{a.cotizacion.total != null ? fmtCOP(a.cotizacion.total) : "Sin total"}</span>
                    <span className="muted">{a.cotizacion.items.length} ítem(s)</span>
                  </>
                )}
                {a.estado === "rechazada" && <span className="agente-rojo">{a.error}</span>}
              </div>
            ))}
          </div>
          {conCompra && (
            <div className="ag-pie-accion ag-pie-compra">
              <div><strong>¿De qué compra es?</strong><small>Opcional: el cuadro queda adjunto a la compra y el revisor lo tiene en cuenta.</small></div>
              <ElegirCompra valor={compra} onChange={setCompra} />
            </div>
          )}
          <div className="ag-pie-accion">
            <input className="ag-titulo-input" placeholder="¿Qué se está cotizando? (ej. Refrigerios Día del Niño)" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Nombre del cuadro" />
            <button type="button" className="btn btn-primary ag-btn-grande" disabled={listas.length < 2 || leyendo || armando || !titulo.trim()} onClick={armar}>
              {armando ? <><span className="spinner" /> Armando el cuadro…</> : <><IconSpark size={15} /> Armar cuadro con {listas.length} cotización(es)</>}
            </button>
          </div>
          {listas.length < 2 && !leyendo && <p className="count-note ag-nota-centro">Necesitas al menos 2 cotizaciones leídas para armar el cuadro.</p>}
        </section>
      )}

      {error && <div className="modal-error">{error}</div>}

      {abierto && <CuadroVista cuadro={abierto} onCerrar={() => setAbierto(null)} />}

      <section className="ag-lista-card">
        <div className="ag-lista-titulo">
          <span className="ag-paso-card-num"><IconFile size={14} /></span>
          <div><strong>Cuadros guardados</strong><small>Ábrelos para revisarlos o descargar el PDF.</small></div>
        </div>
        {cuadros && cuadros.length === 0 ? (
          <VacioAgente icono={<IconMoney size={26} />} titulo="Aún no hay cuadros comparativos">Sube tus primeras cotizaciones arriba.</VacioAgente>
        ) : (
          <div className="table-scroll">
            <table className="records ficha-tabla ag-tabla">
              <thead><tr><th>Cuadro</th>{conCompra && <th>Compra</th>}<th>Fecha</th><th>Proveedores</th><th>Más económica</th><th>Creado por</th><th className="actions-col">Acciones</th></tr></thead>
              <tbody>
                {!cuadros && <tr><td colSpan={conCompra ? 7 : 6}><div className="skeleton-bar" style={{ height: 34, borderRadius: 8 }} /></td></tr>}
                {pag.pagina.map((c) => {
                  const comp = c.datos.comparacion;
                  const mejor = comp.mejorIndice != null ? comp.filas[comp.mejorIndice] : null;
                  return (
                    <tr key={c.id}>
                      <td><span className="desc-tooltip-wrap" style={{ maxWidth: 280 }}><span className="desc-text"><b>{c.titulo}</b></span><span className="desc-tooltip-bubble">{c.titulo}</span></span></td>
                      {conCompra && <td className="mono">{c.datos.compra ? `#${c.datos.compra.numero ?? "—"}` : <span className="muted">—</span>}</td>}
                      <td>{new Date(c.createdAt).toLocaleDateString("es-CO")}</td>
                      <td><span className="ag-pill">{comp.filas.length}</span></td>
                      <td>{mejor ? <span className="desc-tooltip-wrap" style={{ maxWidth: 260 }}><span className="desc-text">{mejor.proveedor} · <b>{fmtCOP(mejor.total)}</b></span><span className="desc-tooltip-bubble">{mejor.proveedor} · {fmtCOP(mejor.total)}</span></span> : "—"}</td>
                      <td>{c.creadoPorNombre || "—"}</td>
                      <td className="actions-cell">
                        <span className="agente-acciones">
                          <button type="button" className="btn small" onClick={() => setAbierto(c)}><IconEye size={13} /> Ver</button>
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
        )}
        <PiePagina id="cuadros-size" p={pag} total={(cuadros || []).length} etiqueta="cuadro(s)" />
      </section>
    </div>
  );
}

function CuadroVista({ cuadro, onCerrar }) {
  const { cotizaciones, comparacion: comp, recomendado } = cuadro.datos;
  const u = comp.umbral;
  const valor = comp.mejorIndice != null ? comp.filas[comp.mejorIndice].total : null;
  const maximo = Math.max(1, ...comp.filas.map((f) => f.total || 0));
  const orden = comp.filas.map((f, i) => ({ ...f, i })).sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));

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
    <section className="agente-cuadro ag-cuadro" aria-label={`Cuadro comparativo ${cuadro.titulo}`}>
      <div className="agente-cuadro-cabeza">
        <div>
          <span className="ag-etiqueta">Cuadro comparativo{cuadro.datos.compra ? ` · compra #${cuadro.datos.compra.numero ?? "—"}` : ""}</span>
          <h3>{cuadro.titulo}</h3>
        </div>
        <span className="agente-acciones">
          <button type="button" className="btn btn-primary" onClick={pdf}><IconDownload size={14} /> Descargar PDF</button>
          <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
        </span>
      </div>

      {cuadro.recomendacion && (
        <div className="ag-recomendacion">
          <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={16} /></span>
          <div><strong>Recomendación de Nova</strong><p>{cuadro.recomendacion}</p></div>
        </div>
      )}

      <div className="ag-podio">
        {orden.map((f, pos) => (
          <div key={f.i} className={`ag-podio-item ${f.i === comp.mejorIndice ? "mejor" : ""} ${f.i === recomendado ? "recomendada" : ""}`}>
            <div className="ag-podio-top">
              <span className="ag-podio-pos">{pos + 1}</span>
              <strong title={f.proveedor}>{f.proveedor}</strong>
            </div>
            <span className="ag-podio-total">{f.total != null ? fmtCOP(f.total) : "Sin total"}</span>
            <div className="ag-podio-barra" aria-hidden="true"><i style={{ width: `${((f.total || 0) / maximo) * 100}%` }} /></div>
            <span className="ag-podio-dif">{pctTxt(f.diferencia?.pct)}</span>
            {f.avisos.length > 0 && <span className="agente-aviso-fila">{f.avisos.join(" ")}</span>}
            <div className="ag-podio-sellos">
              {f.i === recomendado && <span className="ag-sello-nova"><IconStar size={11} /> Recomendada por Nova</span>}
            </div>
          </div>
        ))}
      </div>

      <div className={`ag-umbral ${u.requiereAdministrativa ? "exige" : ""}`}>
        {u.requiereAdministrativa ? <IconAlert size={16} /> : <IconCheck size={16} />}
        <span>
          {valor == null ? "No se pudo calcular el total más bajo." : !u.smmlv ? "No había salario mínimo en Maestros al armar este cuadro: no se pudo medir el umbral del procedimiento." : u.requiereAdministrativa
            ? <>La compra ({fmtCOP(valor)}) supera 2 SMMLV ({fmtCOP(u.administrativa)}): si es administrativa <b>exige cuadro comparativo</b>{u.requiereTecnica ? " (y también si es técnica, supera 4 SMMLV)" : `; si es técnica, el umbral es 4 SMMLV (${fmtCOP(u.tecnica)})`}.</>
            : <>La compra ({fmtCOP(valor)}) no supera 2 SMMLV ({fmtCOP(u.administrativa)}): el procedimiento no exige cuadro comparativo, pero queda como soporte.</>}
          {u.smmlv && u.smmlvAnio ? ` (SMMLV ${u.smmlvAnio}: ${fmtCOP(u.smmlv)}.)` : ""}
          {" "}{u.suficientes ? `Tiene ${u.cotizaciones} cotizaciones (mínimo 3).` : `Tiene ${u.cotizaciones} cotizaciones: el mínimo es 3, o 2 con soporte de las rechazadas.`}
        </span>
      </div>

      <details className="ag-detalle">
        <summary>Ver el detalle de cada cotización</summary>
        <div className="table-scroll">
          <table className="records ficha-tabla agente-tabla ag-tabla">
            <thead><tr><th>Proveedor</th><th className="num">Total</th><th>Diferencia</th><th>Entrega</th><th>Forma de pago</th><th>Validez</th><th>Ítems</th></tr></thead>
            <tbody>
              {comp.filas.map((f, i) => (
                <tr key={i} className={i === comp.mejorIndice ? "agente-mejor" : ""}>
                  <td>
                    <b>{f.proveedor}</b>{cotizaciones[i].nit ? <span className="muted"> · NIT {cotizaciones[i].nit}</span> : null}
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
      </details>
    </section>
  );
}
