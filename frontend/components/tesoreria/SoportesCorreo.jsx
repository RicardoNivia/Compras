"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { tesSoportesCorreo, tesSoporteCorreo, tesArchivoSoporteCorreo, tesRegistrarSoporteCorreo, tesDescartarSoporteCorreo, urlSoporteCorreo } from "@/lib/tesoreriaApi";
import { useConfirmar } from "@/components/Confirmar";
import { Paginacion } from "@/components/notificaciones/ui";
import { FormMovimientoModal } from "@/components/tesoreria/MovimientoModales";
import { fechaCorta } from "@/components/tesoreria/comun";
import { IconMail } from "@/components/icons";

const PAGE_SIZES = [10, 25, 50, 100];
const FILTROS = [["pendiente", "Pendientes"], ["registrado", "Registrados"], ["descartado", "Descartados"], ["", "Todos"]];
const ESTADO_PILL = { pendiente: ["warning", "Pendiente"], registrado: ["good", "Registrado"], descartado: ["muted", "Descartado"] };
const recibido = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// «Soportes del correo» (Por resolver): comprobantes de pago que llegaron al correo de soportes y que Nova leyó,
// con lo que sugiere (el movimiento que ya existe y el pago al que corresponde). «Revisar y registrar» abre el
// formulario de movimiento con el comprobante ya leído; nada se guarda sin que la persona lo confirme.
export default function SoportesCorreo({ cat, puede, onCambio, titulo = "1 · Soportes que llegaron al correo", id = "pr-correo" }) {
  const { confirmar } = useConfirmar();
  const [filtro, setFiltro] = useState("pendiente");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [lista, setLista] = useState({ items: [], total: 0 });
  const [abriendo, setAbriendo] = useState(null);
  const [form, setForm] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const r = await tesSoportesCorreo({ estado: filtro, page, size });
      setLista(r);
      if (r.page !== page) setPage(r.page);
    } catch (e) { setError(e.message); }
  }, [filtro, page, size]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [filtro, size]);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); }, [aviso]);

  const cambio = () => { cargar(); onCambio?.(); };

  async function abrir(s) {
    setAbriendo(s.id); setError("");
    try {
      const d = await tesSoporteCorreo(s.id);
      const archivo = d.conArchivo ? await tesArchivoSoporteCorreo(s.id, d.archivoNombre, d.tipoMime) : null;
      const origen = `Soporte recibido por correo${d.remitente ? ` de ${d.remitente}` : ""} el ${recibido(d.recibidoAt)}: «${d.asunto || "sin asunto"}».`;
      setForm({ soporte: d, archivo, inicial: { observacion: origen.slice(0, 500) } });
    } catch (e) { setError(e.message); } finally { setAbriendo(null); }
  }

  async function guardado(m, msg) {
    const s = form.soporte;
    setForm(null);
    try {
      await tesRegistrarSoporteCorreo(s.id, m.id);
      setAviso(msg || "Movimiento guardado con el soporte del correo.");
    } catch (e) { setError(`El movimiento quedó guardado, pero el soporte no se marcó como registrado: ${e.message}`); }
    cambio();
  }

  async function descartar(s) {
    const ok = await confirmar({
      titulo: "Descartar el soporte",
      mensaje: `¿Descartar el soporte «${s.asunto || s.archivoNombre || "sin asunto"}»?`,
      detalle: "Sale de la lista de pendientes y no se registra ningún movimiento. Queda en «Descartados» y en Auditoría.",
      boton: "Sí, descartar", peligro: true,
    });
    if (!ok) return;
    try {
      await tesDescartarSoporteCorreo(s.id, null);
      setAviso("Soporte descartado.");
      cambio();
    } catch (e) { setError(e.message); }
  }

  return (
    <section id={id} className="table-card mc-lista">
      {aviso && <div className="toast toast-good" role="status">{aviso}</div>}
      <div className="mc-lista-head">
        <div>
          <h3>{titulo}</h3>
          <p className="mc-texto">Comprobantes que llegaron al correo. Nova ya los leyó y sugiere si el pago ya está registrado y a qué gasto corresponde. Pulsa «Revisar y registrar» para confirmarlo.</p>
        </div>
        <div className="nx-segmento" role="tablist" aria-label="Estado">
          {FILTROS.map(([v, t]) => <button key={v || "todos"} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}>{t}</button>)}
        </div>
      </div>
      {error && <p className="modal-error" style={{ margin: "0 16px" }}>{error}</p>}
      <ul className="mc-soportes">
        {lista.items.length === 0 && (
          <li className="mc-soporte-vacio"><div className="empty">
            {filtro === "pendiente" ? <>No hay soportes por revisar. Llegan solos cuando alguien reenvía un comprobante al correo (se configura en <Link href="/mi-correo">Mi correo</Link>).</> : "No hay soportes en esta pestaña."}
          </div></li>
        )}
        {lista.items.map((s) => {
          const [cls, txt] = ESTADO_PILL[s.estado] || ["muted", s.estado];
          const l = s.leido || {};
          const sug = s.sugerencia;
          const de = (s.remitente || "").replace(/\s*<[^>]*>\s*$/, "") || s.remitente || "remitente desconocido";
          const titulo = l.tercero || l.descripcion || s.asunto || "Comprobante de pago";
          const detalle = [l.fecha ? `pagado el ${fechaCorta(l.fecha)}` : null, l.banco, l.referencia ? `ref. ${l.referencia}` : null].filter(Boolean).join(" · ");
          return (
            <li key={s.id} className={`mc-soporte est-${s.estado}`}>
              <div className="mc-soporte-cuerpo">
                <div className="mc-soporte-top">
                  <span className={`pill ${cls}`}>{txt}{s.movimientoId ? ` · movimiento #${s.movimientoId}` : ""}</span>
                  <small>Llegó {recibido(s.recibidoAt)} · de {de}{s.archivoNombre ? ` · archivo «${s.archivoNombre}»` : " · en el texto del correo"}</small>
                </div>
                <div className="mc-soporte-main">
                  <div className="mc-soporte-que">
                    <strong title={titulo}>{titulo}</strong>
                    {detalle && <span>{detalle}</span>}
                  </div>
                  <span className={`mc-soporte-valor tes-num ${l.tipo === "credito" ? "tes-pos" : "tes-neg"}`}>{s.valorTexto || "Sin valor"}<small>{l.tipo === "credito" ? "entró" : "salió"}</small></span>
                </div>
                {s.estado === "pendiente" && (
                  <div className="mc-soporte-nova">
                    <span className="tes-nova-chip">Nova sugiere</span>
                    {sug?.movimiento || sug?.pago ? (
                      <span>
                        {sug.movimiento && <>Ya está registrado: <b>{sug.movimiento.texto}</b> (confianza {sug.movimiento.confianza}). </>}
                        {sug.pago && <>Corresponde al pago <b>{sug.pago.texto}</b> (confianza {sug.pago.confianza}).</>}
                      </span>
                    ) : <span>No encontró un movimiento ni un pago parecido: al revisarlo lo registras como movimiento nuevo.</span>}
                  </div>
                )}
                {s.estado === "descartado" && s.motivoDescarte && <small className="muted">Motivo: {s.motivoDescarte}</small>}
              </div>
              <div className="mc-soporte-acciones">
                {puede && s.estado === "pendiente" && cat && (
                  <>
                    <button type="button" className="btn btn-primary" disabled={abriendo === s.id} onClick={() => abrir(s)}>{abriendo === s.id ? <span className="spinner" /> : null} Revisar y registrar</button>
                    <button type="button" className="btn btn-ghost" onClick={() => descartar(s)}>Descartar</button>
                  </>
                )}
                <div className="mc-soporte-links">
                  {s.conArchivo && <a href={urlSoporteCorreo(s.id)} target="_blank" rel="noreferrer">Ver comprobante</a>}
                  {s.webLink && <a href={s.webLink} target="_blank" rel="noreferrer" title="Se abre si tienes la sesión de ese Gmail abierta"><IconMail size={12} /> Abrir en Gmail</a>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Paginacion id="pr-correo-size" page={page} size={size} total={lista.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="soporte(s)" />
      {form && cat && (
        <FormMovimientoModal cat={cat} conSoporte archivoInicial={form.archivo} lecturaInicial={form.soporte.lectura} inicial={form.inicial}
          onClose={() => setForm(null)} onSaved={(m, msg) => guardado(m, msg)} />
      )}
    </section>
  );
}
