"use client";

import { useState } from "react";
import { proveedorPrecioApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import PiePagina, { usePagina, PAGE_SIZES_MODAL } from "@/components/bienestar/PiePagina";
import { IconBuilding, IconSearch, IconSpark, IconMoney, IconStar } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";

const NIVEL_ESTADO = { ok: "bien", excepcion: "bien", tramite: "", aviso: "atencion", inactivo: "mal" };

function Celda({ texto, ancho = 260 }) {
  if (!texto) return <span className="muted">—</span>;
  return <span className="desc-tooltip-wrap" style={{ maxWidth: ancho }}><span className="desc-text">{texto}</span><span className="desc-tooltip-bubble">{texto}</span></span>;
}

// Agente proveedor y precio de referencia: a quién se le ha comprado algo parecido, a qué precio y cómo le ha ido.
export default function ProveedorPrecio() {
  const [texto, setTexto] = useState("");
  const [datos, setDatos] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");
  const pagProv = usePagina(datos?.proveedores || [], datos ? "p" + datos.compras : "", PAGE_SIZES_MODAL[0]);
  const pagEj = usePagina(datos?.ejemplos || [], datos ? "e" + datos.compras : "", PAGE_SIZES_MODAL[0]);

  async function buscar(e) {
    e?.preventDefault();
    if (!texto.trim()) return;
    setError("");
    setDatos(null);
    setPensando(true);
    try {
      setDatos(await proveedorPrecioApi(texto));
    } catch (err) {
      setError(err.message);
    } finally {
      setPensando(false);
    }
  }

  const r = datos?.referencia;
  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconBuilding size={22} />}
        color="azul"
        titulo="Proveedor y precio de referencia"
        descripcion="Escribe qué vas a comprar y Nova busca compras parecidas: a quién se le compró, cuánto se pagó y cómo lo calificó. Sirve para saber con quién cotizar y si un precio es razonable."
        pasos={["Escribe qué vas a comprar", "El sistema busca compras parecidas", "Nova te dice con quién empezar"]}
        paso={datos ? 2 : pensando ? 1 : 0}
      />
      <form className="ag-paso-card" onSubmit={buscar}>
        <span className="ag-paso-card-num">1</span>
        <div className="ag-paso-card-cuerpo">
          <label htmlFor="ag-que"><strong>¿Qué vas a comprar?</strong> <small>Por ejemplo: refrigerios, tiquetes aéreos, papelería, mantenimiento de aires.</small></label>
          <div className="ag-elegir">
            <label className="ag-buscar ag-buscar-grande"><IconSearch size={16} /><input id="ag-que" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué vas a comprar…" /></label>
            <button type="submit" className="btn btn-primary ag-btn-grande" disabled={!texto.trim() || pensando}>
              {pensando ? <><span className="spinner" /> Buscando…</> : <><IconSpark size={16} /> Buscar</>}
            </button>
          </div>
        </div>
      </form>
      {error && <div className="modal-error">{error}</div>}
      {!datos && !pensando && <VacioAgente icono={<IconBuilding size={26} />} titulo="Escribe qué vas a comprar">Nova revisa todo el historial de compras para orientarte.</VacioAgente>}
      {datos && datos.compras === 0 && <VacioAgente icono={<IconSearch size={26} />} titulo="No hay compras parecidas">Prueba con otras palabras (lo esencial: «refrigerios», «tiquetes», «tóner»…).</VacioAgente>}
      {datos && datos.compras > 0 && (
        <>
          <section className="ag-cifras">
            <CifraAgente icono={<IconSearch size={18} />} etiqueta="Compras parecidas" valor={datos.compras} nota={`${datos.proveedores.length} proveedor(es)`} />
            <CifraAgente icono={<IconMoney size={18} />} etiqueta="Precio típico (mediana)" valor={fmtCOP(r.mediana)} nota="Depende de la cantidad" tono="destaca" pequena />
            <CifraAgente icono={<IconMoney size={18} />} etiqueta="La mitad de las compras, entre" valor={`${fmtCOP(r.p25)} y ${fmtCOP(r.p75)}`} nota={`Mín. ${fmtCOP(r.minimo)} · máx. ${fmtCOP(r.maximo)}`} pequena />
          </section>
          {datos.nova && (
            <div className="ag-recomendacion">
              <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={16} /></span>
              <div><strong>Con quién empezar, según Nova</strong><p>{datos.nova.replace(/\*\*/g, "")}</p></div>
            </div>
          )}
          <section className="ag-lista-card">
            <div className="ag-lista-titulo"><span className="ag-paso-card-num"><IconBuilding size={14} /></span><div><strong>Proveedores</strong><small>Ordenados por cuántas veces se les ha comprado algo parecido.</small></div></div>
            <div className="table-scroll">
              <table className="records ficha-tabla ag-tabla">
                <thead><tr><th>Proveedor</th><th className="num">Veces</th><th className="num">Promedio</th><th>Rango</th><th>Última compra</th><th>Valoración Nova</th><th>Estado</th></tr></thead>
                <tbody>
                  {pagProv.pagina.map((p) => (
                    <tr key={p.nit || p.nombre}>
                      <td><Celda texto={p.nombre} ancho={240} />{p.nit && <span className="muted mono"> {p.nit}</span>}</td>
                      <td className="num">{p.veces}</td>
                      <td className="num">{fmtCOP(p.promedio)}</td>
                      <td className="muted">{fmtCOP(p.minimo)} – {fmtCOP(p.maximo)}</td>
                      <td>{p.ultimaFecha || "—"}</td>
                      <td>{p.valoracionIA != null ? <span className="ag-estrella"><IconStar size={12} /> {p.valoracionIA.toLocaleString("es-CO")} <span className="muted">({p.valoraciones})</span></span> : <span className="muted">Sin valorar</span>}</td>
                      <td>{p.estado ? <span className={`ag-pill ${NIVEL_ESTADO[p.estado.nivel] || ""}`}>{p.estado.titulo}</span> : <span className="ag-pill atencion">{p.enCatalogo ? "—" : "Fuera del catálogo"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PiePagina id="ag-prov-size" p={pagProv} total={datos.proveedores.length} etiqueta="proveedor(es)" tamanos={PAGE_SIZES_MODAL} />
          </section>
          <section className="ag-lista-card">
            <div className="ag-lista-titulo"><span className="ag-paso-card-num"><IconSearch size={14} /></span><div><strong>Compras parecidas</strong><small>Las más parecidas primero.</small></div></div>
            <div className="table-scroll">
              <table className="records ficha-tabla ag-tabla">
                <thead><tr><th>Compra</th><th>Fecha</th><th>Descripción</th><th>Proveedor</th><th>Área</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {pagEj.pagina.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">#{e.numero ?? "—"}</td>
                      <td>{e.fecha || "—"}</td>
                      <td><Celda texto={e.descripcion} ancho={320} /></td>
                      <td><Celda texto={e.proveedor} ancho={200} /></td>
                      <td><Celda texto={e.area} ancho={140} /></td>
                      <td className="num">{e.valor != null ? fmtCOP(e.valor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PiePagina id="ag-ej-size" p={pagEj} total={datos.ejemplos.length} etiqueta="compra(s)" tamanos={PAGE_SIZES_MODAL} />
          </section>
        </>
      )}
    </div>
  );
}
