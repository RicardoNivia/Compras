"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  tesCrearMovimiento, tesEditarMovimiento, tesMovimiento, tesBorrarMovimiento, tesAsociarMovimiento, tesLeerSoporte,
  tesAgregarSoporte, tesBorrarSoporte, urlSoporte, tesPagos, tesAnalizarExtracto, tesAplicarExtracto, tesBuscarPropuestas,
} from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { IconSpark, IconTrash, IconSearch, IconPlus, IconFile, IconEdit, IconCheck, IconArrowRight } from "@/components/icons";
import { useConfirmar } from "@/components/Confirmar";
import MoneyInput from "@/components/MoneyInput";
import { Modal, MESES, hoyCO, fechaCorta, fechaSinAnio, EstadoPago, TipoPago, useCatalogos } from "@/components/tesoreria/comun";
import { PagoFormModal } from "@/components/tesoreria/PagoModales";
import { ConciliacionContable, PistasDiferencia } from "@/components/tesoreria/ConciliacionContable";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const VACIO = { bancoId: "", tipo: "debito", fecha: "", valor: "", descripcion: "", concepto: "", tercero: "", observacion: "", referencia: "", tipoCarga: "", tipoSolicitud: "", preparador: "", formato: "" };

// ---------- Piezas comunes del formulario y del detalle ----------
// Encabezado con el resumen del movimiento: si sale o entra (color), el valor en grande, qué es y sus etiquetas.
// etiqueta: texto pequeño sobre el valor (por defecto «Sale del banco» / «Entra al banco»). Lo usan también los pagos.
export function HeroMovimiento({ tipo, valor, moneda = "COP", titulo, sub, etiqueta, children }) {
  const sale = tipo !== "credito";
  return (
    <div className={`mv-hero ${sale ? "debito" : "credito"}`}>
      <div className="mv-hero-monto">
        <small>{etiqueta || (sale ? "Sale del banco" : "Entra al banco")}</small>
        <strong className="tes-num">{valor > 0 ? `${sale ? "−" : "+"}${fmtMoneda(valor, moneda)}` : "Sin valor aún"}</strong>
      </div>
      <div className="mv-hero-txt">
        <strong title={titulo}>{titulo}</strong>
        {sub && <span>{sub}</span>}
        {children && <div className="mv-hero-chips">{children}</div>}
      </div>
    </div>
  );
}

// Barra «cuánto del movimiento ya está repartido en pagos».
// etiqueta y textos: para usarla también en los pagos («Pagado con movimientos», «Cuadra con lo programado»…).
export function BarraCuadre({ valor, repartido, moneda = "COP", etiqueta = "Asignado a pagos", textos = {} }) {
  const t = { mal: (x) => `Te pasas por ${x}`, ok: "Todo el movimiento está asignado", parcial: (x) => `Faltan ${x} por asignar`, nada: "Aún sin asignar a ningún pago", ...textos };
  const resto = Math.round((valor - repartido) * 100) / 100;
  const pct = valor > 0 ? Math.min(100, Math.max(0, (repartido / valor) * 100)) : 0;
  const estado = resto < -0.5 ? "mal" : Math.abs(resto) < 0.5 && valor > 0 ? "ok" : "";
  return (
    <div className={`mv-cuadre ${estado}`}>
      <div className="mv-cuadre-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <div className="mv-cuadre-txt">
        <span>{etiqueta}: <b className="tes-num">{fmtMoneda(repartido, moneda)}</b> de <b className="tes-num">{fmtMoneda(valor, moneda)}</b></span>
        <strong>{estado === "mal" ? t.mal(fmtMoneda(-resto, moneda)) : estado === "ok" ? t.ok : repartido > 0 ? t.parcial(fmtMoneda(resto, moneda)) : t.nada}</strong>
      </div>
    </div>
  );
}

// ---------- Asociar a pagos (lo usan el formulario y el detalle) ----------
// lista: [{ pagoId, valor, pago }] con el valor que va a cada pago. Sugiere pagos del mismo mes (y el anterior) que aún
// esperan movimiento, ordenados por lo parecido del valor; también se puede buscar por texto. Si el pago no existe,
// «+ Crear un pago nuevo» (siempre visible junto al buscador) lo crea con los datos del movimiento y lo deja elegido.
const CANDS_POR_PAGINA = 5;
export function AsociadorPagos({ movimiento, lista, onCambio }) {
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);
  const { cat } = useCatalogos();
  const [cands, setCands] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [pag, setPag] = useState(1);
  const valorMov = num(movimiento.valor);
  const fecha = movimiento.fecha || hoyCO();
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const anio = Number(fecha.slice(0, 4));
        const mes = Number(fecha.slice(5, 7));
        const base = q.trim() ? { q: q.trim(), size: 50 } : { anio, mes, size: 100 };
        const [a, b] = await Promise.all([tesPagos({ ...base, asociacion: "sin" }), q.trim() ? Promise.resolve({ items: [] }) : tesPagos({ anio: mes === 1 ? anio - 1 : anio, mes: mes === 1 ? 12 : mes - 1, asociacion: "sin", size: 100 })]);
        const sentidoOk = (p) => (movimiento.tipo === "debito" ? p.tipo === "E" || (p.tipo === "T" && p.valor < 0) : p.tipo === "I" || p.tipo === "J" || (p.tipo === "T" && p.valor > 0));
        const todos = [...a.items, ...b.items].filter((p) => q.trim() || sentidoOk(p));
        todos.sort((x, y) => Math.abs(Math.abs(x.valor) - valorMov) - Math.abs(Math.abs(y.valor) - valorMov));
        if (vivo) { setCands(todos.slice(0, 25)); setPag(1); }
      } catch { if (vivo) setCands([]); } finally { if (vivo) setCargando(false); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, fecha, movimiento.tipo, valorMov]);

  const repartido = lista.reduce((s, a) => s + num(a.valor), 0);
  const resto = valorMov - repartido;
  const agregar = (p) => {
    if (lista.some((a) => a.pagoId === p.id)) return;
    const falta = Math.max(0, valorMov - repartido);
    onCambio([...lista, { pagoId: p.id, valor: String(Math.min(falta || Math.abs(p.valor), Math.abs(p.valor) || falta)), pago: p }]);
  };
  const ya = new Set(lista.map((a) => a.pagoId));
  const paginas = Math.max(1, Math.ceil(cands.length / CANDS_POR_PAGINA));
  const visibles = cands.slice((pag - 1) * CANDS_POR_PAGINA, pag * CANDS_POR_PAGINA);
  const mesTexto = MESES[Number(fecha.slice(5, 7)) - 1]?.toLowerCase() || "este mes";
  return (
    <div className="mv-asoc">
      <BarraCuadre valor={valorMov} repartido={repartido} />
      {resto < -0.5 && <p className="modal-error" style={{ margin: 0 }}>Repartes más de lo que vale el movimiento: baja el valor de algún pago.</p>}

      {lista.length > 0 && (
        <div className="mv-bloque">
          <h5>Pagos elegidos · {lista.length}</h5>
          {lista.map((a) => {
            const prog = Math.abs(a.pago?.valor || 0);
            const dif = prog - num(a.valor);
            return (
              <div key={a.pagoId} className="mv-elegido">
                <div className="mv-elegido-txt">
                  <strong>{a.pago?.concepto || `Pago #${a.pagoId}`}</strong>
                  <small>{[a.pago?.item, a.pago ? `${MESES[a.pago.mes - 1]} ${a.pago.anio}` : null, a.pago ? `programado ${fmtMoneda(prog, "COP")}` : null].filter(Boolean).join(" · ")}</small>
                  {a.pago && <span className={`pill ${Math.abs(dif) < 0.5 ? "good" : "warning"}`}>{Math.abs(dif) < 0.5 ? "Cuadra exacto" : dif > 0 ? `Faltan ${fmtMoneda(dif, "COP")} para completarlo` : `Sobran ${fmtMoneda(-dif, "COP")}`}</span>}
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`asoc-${a.pagoId}`}>Va a este pago</label>
                  <MoneyInput id={`asoc-${a.pagoId}`} value={a.valor} onChange={(v) => onCambio(lista.map((x) => (x.pagoId === a.pagoId ? { ...x, valor: v } : x)))} prefix="COP" decimales={2} />
                </div>
                <button type="button" className="btn small btn-ghost" onClick={() => onCambio(lista.filter((x) => x.pagoId !== a.pagoId))}>Quitar</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mv-bloque">
        <h5>{lista.length ? "Agregar otro pago" : "Elige el pago que se pagó con este movimiento"}</h5>
        <div className="mv-buscar">
          <div className="maestros-search-wrap" style={{ maxWidth: "none", flex: 1 }}>
            <input id="asoc-buscar" type="search" aria-label="Buscar un pago" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por concepto u observación…" />
            <span className="ic"><IconSearch size={14} /></span>
          </div>
          <button type="button" className="btn mv-btn-crear" onClick={() => setCreando(true)} disabled={!cat} title="Si el pago no existe, créalo con los datos de este movimiento"><IconPlus size={13} /> Crear un pago nuevo</button>
        </div>
        <small className="mv-pista">{q.trim() ? "Resultados de la búsqueda." : `Sugeridos: pagos de ${mesTexto} y el mes anterior que esperan movimiento, del valor más parecido al más distinto.`} ¿No está? Créalo con «Crear un pago nuevo».</small>
        {cargando && !cands.length && <span className="muted"><span className="spinner" /> Buscando pagos…</span>}
        {!cargando && !cands.length && (
          <div className="mv-vacio">
            <strong>No hay pagos que esperen movimiento {q.trim() ? "con esa búsqueda" : `en ${mesTexto}`}.</strong>
            <span>Prueba con otra palabra o crea el pago aquí mismo: queda elegido y pasa a pagado al guardar.</span>
            <button type="button" className="btn btn-primary small" onClick={() => setCreando(true)} disabled={!cat}><IconPlus size={12} /> Crear un pago nuevo</button>
          </div>
        )}
        {visibles.map((p) => {
          const igual = Math.abs(Math.abs(p.valor) - valorMov) < 0.5;
          return (
            <div key={p.id} className={`mv-cand${ya.has(p.id) ? " elegido" : ""}`}>
              <div className="mv-cand-txt">
                <strong>{p.concepto}</strong>
                <small>{[p.item, `${MESES[p.mes - 1]} ${p.anio}`, p.medioPago && `medio ${p.medioPago}`].filter(Boolean).join(" · ")}</small>
              </div>
              {igual && <span className="pill good">Mismo valor</span>}
              <EstadoPago estado={p.estado} />
              <span className="tes-num mv-cand-valor">{p.valorTexto}</span>
              <button type="button" className={`btn small${ya.has(p.id) ? "" : " btn-primary"}`} onClick={() => agregar(p)} disabled={ya.has(p.id)}>{ya.has(p.id) ? "✓ Elegido" : "Elegir"}</button>
            </div>
          );
        })}
        {cands.length > CANDS_POR_PAGINA && (
          <div className="mv-pager">
            <button type="button" className="btn small" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>Anterior</button>
            <span className="count-note">Página {pag} de {paginas} · {cands.length} pago(s)</span>
            <button type="button" className="btn small" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Siguiente</button>
          </div>
        )}
      </div>
      {creando && cat && (
        <PagoFormModal
          cat={cat}
          paraAsociar
          inicial={{
            tipo: movimiento.tipo === "credito" ? "I" : "E", sentido: movimiento.tipo === "credito" ? "entra" : "sale", fecha: fecha,
            valor: String(resto > 0.5 ? Math.round(resto * 100) / 100 : valorMov || ""), observacion: [movimiento.descripcion, movimiento.tercero].filter(Boolean).join(" · ").slice(0, 300),
          }}
          onClose={() => setCreando(false)}
          onSaved={(p) => { setCreando(false); if (p) agregar(p); }}
        />
      )}
    </div>
  );
}

// ---------- Registrar / editar ----------
// Tres pasos con un resumen arriba: 1 Datos (lo que dice el banco) · 2 Soporte (comprobante, Nova lo lee) · 3 Pago (a qué
// pago corresponde, o crear uno). Se puede guardar desde cualquier paso cuando lo obligatorio está completo.
// conSoporte: «Registrar con soporte» — empieza pidiendo el comprobante; Nova lo lee, llena el formulario y, si ese pago ya
// está registrado (por ejemplo vino en el extracto), ofrece adjuntar el soporte a ese movimiento en vez de crear otro.
// inicial: valores con que arranca un movimiento nuevo. pagoInicial: { pagoId, valor, pago } — se abre desde un pago que no
// encontró su movimiento; el movimiento nuevo queda asociado a ese pago al guardarlo.
// archivoInicial + lecturaInicial: el comprobante ya leído por Nova (p. ej. el que llegó al correo de soportes); se
// muestra igual que si se acabara de subir, sin volver a leerlo. lecturaInicial sin archivo = vino en el texto del correo.
export function FormMovimientoModal({ cat, movimiento, conSoporte = false, inicial = null, pagoInicial = null, archivoInicial = null, lecturaInicial = null, onClose, onSaved }) {
  const editando = !!movimiento?.id;
  const [v, set] = useState(() => (movimiento ? { ...VACIO, ...Object.fromEntries(Object.entries(movimiento).map(([k, x]) => [k, x ?? ""])), valor: String(movimiento.valor ?? "") } : { ...VACIO, fecha: hoyCO(), bancoId: cat.bancos.filter((b) => b.activo)[0]?.id || "", ...(inicial || {}) }));
  const [asoc, setAsoc] = useState(() => (pagoInicial ? [pagoInicial] : (movimiento?.listaPagos || []).map((a) => ({ pagoId: a.pagoId, valor: String(a.valor), pago: { concepto: a.concepto, item: a.item, mes: a.mes, anio: a.anio, valor: a.valorPago } }))));
  const [archivo, setArchivo] = useState(archivoInicial);
  const [leyendo, setLeyendo] = useState(false);
  const [coincidencias, setCoincidencias] = useState([]);
  const [nuevoDeTodasFormas, setNuevoDeTodasFormas] = useState(false);
  const [pagosPos, setPagosPos] = useState([]); // pagos a los que puede corresponder el comprobante
  const [verTodosPos, setVerTodosPos] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [masCampos, setMasCampos] = useState(!!(movimiento?.referencia || movimiento?.observacion || movimiento?.tipoCarga || movimiento?.tipoSolicitud || movimiento?.preparador || movimiento?.formato || inicial?.observacion));
  const [paso, setPaso] = useState(conSoporte ? "soporte" : "datos");
  const fileRef = useRef(null);
  const bancos = cat.bancos.filter((b) => b.activo || b.id === Number(v.bancoId));
  const campo = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ ...v, [k]: e.target.value }) });

  async function leerConNova(a = archivo) {
    if (!a) return;
    setLeyendo(true); setError(""); setAviso(""); setCoincidencias([]); setPagosPos([]); setNuevoDeTodasFormas(false);
    try {
      aplicarLectura(await tesLeerSoporte(a));
    } catch (e) { setError(e.message); } finally { setLeyendo(false); }
  }

  // Llena el formulario con lo que Nova leyó y deja marcado el pago que sugiere (si la confianza es alta o media):
  // la persona lo confirma al guardar o lo quita. Si el pago ya parece registrado se queda en el paso Soporte para
  // decidirlo; si no, pasa a Datos para revisar lo leído.
  function aplicarLectura(r) {
    const l = r.leido;
    const sinT = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const bancoLeido = l.banco ? cat.bancos.find((b) => b.activo && (sinT(l.banco).includes(sinT(b.nombre)) || sinT(b.nombre).split(" ").some((w) => w.length > 3 && sinT(l.banco).includes(w)))) : null;
    setCoincidencias(r.coincidencias || []);
    setPagosPos(r.pagosPosibles || []);
    set((x) => ({ ...x, bancoId: bancoLeido?.id || x.bancoId, tipo: l.tipo || x.tipo, fecha: l.fecha || x.fecha, valor: l.valor ? String(l.valor) : x.valor, tercero: l.tercero || x.tercero, referencia: l.referencia || x.referencia, descripcion: x.descripcion || l.descripcion || "" }));
    if (l.referencia) setMasCampos(true);
    const sugerido = (r.pagosPosibles || []).find((p) => p.nova && p.nova.confianza !== "baja");
    if (sugerido) setAsoc([{ pagoId: sugerido.id, valor: String(l.valor || Math.abs(sugerido.valor)), pago: { concepto: sugerido.concepto, item: sugerido.item, mes: sugerido.mes, anio: sugerido.anio, valor: sugerido.valor } }]);
    const nova = [r.sugerencia?.movimiento ? "cree que este pago ya está registrado" : null, sugerido ? `dejó marcado el pago «${sugerido.concepto}»` : null].filter(Boolean);
    setAviso(r.duplicado || (nova.length ? `Nova llenó lo que leyó del comprobante y ${nova.join(" y ")}: revísalo antes de guardar.` : "Nova llenó lo que pudo leer del comprobante: revísalo antes de guardar."));
    setPaso((r.coincidencias || []).length ? "soporte" : "datos");
  }
  useEffect(() => { if (lecturaInicial) aplicarLectura(lecturaInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const conComprobante = !!(archivo || lecturaInicial);

  // Adjunta el soporte al movimiento que ya existía y, si la persona confirmó el pago y ese movimiento no tenía pagos,
  // lo asocia también (el pago queda en E).
  async function adjuntarA(c) {
    setGuardando(true); setError("");
    try {
      if (archivo) await tesAgregarSoporte(c.id, archivo);
      let asociado = "";
      if (asoc.length && !c.pagos) { await tesAsociarMovimiento(c.id, asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor }))); asociado = ` y asociado a «${asoc[0].pago?.concepto}»: el pago quedó en E (pagado)`; }
      onSaved({ id: c.id }, `${archivo ? "Soporte adjuntado al" : "Comprobante relacionado con el"} movimiento #${c.id}${asociado}. No se creó otro movimiento.`);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  // «Sí, es este pago»: queda en la asociación (paso Pago) con el valor del comprobante; al guardar pasa a E.
  const elegirPago = (p) => {
    if (asoc.some((a) => a.pagoId === p.id)) { setAsoc(asoc.filter((a) => a.pagoId !== p.id)); return; }
    setAsoc([{ pagoId: p.id, valor: String(num(v.valor) || Math.abs(p.valor)), pago: { concepto: p.concepto, item: p.item, mes: p.mes, anio: p.anio, valor: p.valor } }]);
  };
  const elegirArchivo = (a) => { setArchivo(a); if (a) leerConNova(a); };

  async function guardar(otro = false) {
    setGuardando(true); setError("");
    try {
      const datos = { ...v, valor: v.valor, asociaciones: asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor })) };
      const m = editando ? await tesEditarMovimiento(movimiento.id, datos) : await tesCrearMovimiento(datos);
      if (archivo) await tesAgregarSoporte(m.id, archivo).catch((e) => setError(`Se guardó, pero el soporte no: ${e.message}`));
      const msg = m.avisoAsociacion ? `Guardado, pero no se pudo asociar: ${m.avisoAsociacion}` : asoc.length ? "Movimiento guardado y asociado: sus pagos quedaron en E." : "Movimiento guardado (sin asociar).";
      if (otro) {
        set({ ...VACIO, fecha: v.fecha, bancoId: v.bancoId, tipo: v.tipo });
        setAsoc([]); setArchivo(null); setAviso(msg); setPaso("datos");
        onSaved(m, null, true);
      } else onSaved(m, msg);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }

  const banco = cat.bancos.find((b) => b.id === Number(v.bancoId));
  // El comprobante ya parece registrado: hay que decidir (adjuntar a ese o «es otro») antes de seguir.
  const porDecidir = !leyendo && coincidencias.length > 0 && !nuevoDeTodasFormas;
  const mostrarForm = !(conSoporte && !conComprobante) && !leyendo && !porDecidir;
  const faltan = [!v.bancoId && "el banco", !v.fecha && "la fecha", !(num(v.valor) > 0) && "el valor", !v.descripcion.trim() && "la descripción"].filter(Boolean);
  const listo = faltan.length === 0;
  const pasoActual = mostrarForm ? paso : "soporte";
  const repartido = asoc.reduce((s, a) => s + num(a.valor), 0);
  const PASOS = [
    { k: "datos", titulo: "Datos del banco", nota: listo ? "Completo" : `Falta ${faltan[0]}${faltan.length > 1 ? ` y ${faltan.length - 1} más` : ""}`, ok: listo },
    { k: "soporte", titulo: "Soporte", nota: archivo ? archivo.name : lecturaInicial ? "Llegó en el texto del correo" : "Opcional · foto o PDF", ok: conComprobante },
    { k: "pago", titulo: "Pago que corresponde", nota: asoc.length ? `${asoc.length} pago(s) · ${fmtMoneda(repartido, "COP")}` : "Opcional · se puede después", ok: asoc.length > 0 },
  ];
  const siguiente = pasoActual === "datos" ? "soporte" : pasoActual === "soporte" ? "pago" : null;

  const pagosPosibles = () => {
    const lista = verTodosPos ? pagosPos : pagosPos.slice(0, 2);
    return (
      <div className="mv-bloque">
        <h5>Pagos a los que puede corresponder el comprobante <span className="muted">· opcional</span></h5>
        {lista.map((p) => {
          const elegido = asoc.some((a) => a.pagoId === p.id);
          const conf = p.nova?.confianza || p.confianza;
          return (
            <div key={p.id} className={`tes-posible conf-${conf}${elegido ? " elegido" : ""}`}>
              <div><strong>{p.nova && <span className="tes-nova-chip">Nova sugiere</span>}{p.concepto}</strong><small>{[p.item, `${MESES[p.mes - 1]} ${p.anio}`, `vence ${fechaCorta(p.fecha)}`, p.estado === "E" ? "E sin movimiento" : "P pendiente"].filter(Boolean).join(" · ")}</small><small className="tes-posible-motivo">{p.nova?.motivo ? `Nova: ${p.nova.motivo} · ` : ""}{p.motivo}</small></div>
              <span className={`agente-conf ${conf}`}>Confianza {conf}</span>
              <span className="tes-num">{p.valorTexto}</span>
              <button type="button" className={`btn small${elegido ? "" : " btn-primary"}`} onClick={() => elegirPago(p)}>{elegido ? "✓ Es este · quitar" : "Sí, es este pago"}</button>
            </div>
          );
        })}
        {pagosPos.length > 2 && <button type="button" className="btn small btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setVerTodosPos((x) => !x)}>{verTodosPos ? "Ver menos" : `Ver los otros ${pagosPos.length - 2} posibles`}</button>}
        {asoc.length > 0 && <small className="mv-pista">Al {porDecidir ? "adjuntar" : "guardar"}, «{asoc[0].pago?.concepto}» queda asociado y pasa a E (pagado). Si el valor no coincide verás la diferencia en el pago.</small>}
      </div>
    );
  };

  return (
    <Modal titulo={editando ? "Editar movimiento del banco" : conSoporte ? "Registrar con soporte" : "Registrar movimiento del banco"} sub={conSoporte && !conComprobante ? "Sube la foto o el PDF del comprobante: Nova lo lee y llena los datos por ti." : "Tres pasos: los datos del banco, el soporte y el pago al que corresponde. Solo el primero es obligatorio."} onClose={onClose} ancho={960}
      pie={!mostrarForm ? <button type="button" className="btn" onClick={onClose}>Cancelar</button> : <>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        {!listo && <span className="mv-falta">Para guardar falta {faltan.join(", ")}.</span>}
        <div className="spacer" />
        {siguiente && <button type="button" className="btn" onClick={() => setPaso(siguiente)}>Siguiente: {PASOS.find((p) => p.k === siguiente).titulo.toLowerCase()} <IconArrowRight size={12} /></button>}
        {!editando && <button type="button" className="btn" disabled={!listo || guardando} onClick={() => guardar(true)}>Guardar y registrar otro</button>}
        <button type="button" className="btn btn-primary" disabled={!listo || guardando} onClick={() => guardar(false)}>{guardando ? <span className="spinner" /> : null} Guardar movimiento</button>
      </>}>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const a = e.target.files?.[0] || null; e.target.value = ""; if (conSoporte) elegirArchivo(a); else setArchivo(a); }} />

      <HeroMovimiento tipo={v.tipo} valor={num(v.valor)} moneda={banco?.moneda || "COP"}
        titulo={v.descripcion.trim() || (editando ? "Movimiento" : "Movimiento nuevo")}
        sub={[banco?.nombre || "Sin banco", v.fecha ? fechaCorta(v.fecha) : "sin fecha", v.tercero].filter(Boolean).join(" · ")}>
        <span className={`pill ${conComprobante ? "good" : "muted"}`}>{archivo ? "Con soporte" : lecturaInicial ? "Soporte en el correo" : "Sin soporte"}</span>
        <span className={`pill ${asoc.length ? "good" : "warning"}`}>{asoc.length ? `${asoc.length} pago(s) elegido(s)` : "Sin pago asociado"}</span>
      </HeroMovimiento>

      <div className="mv-pasos" role="tablist" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <button key={p.k} type="button" role="tab" aria-selected={pasoActual === p.k} disabled={!mostrarForm && p.k !== "soporte"} className={`mv-paso${p.ok ? " ok" : ""}`} onClick={() => setPaso(p.k)}>
            <span className="mv-paso-n">{p.ok ? <IconCheck size={13} /> : i + 1}</span>
            <span className="mv-paso-txt"><strong>{p.titulo}</strong><small title={p.nota}>{p.nota}</small></span>
          </button>
        ))}
      </div>

      {aviso && mostrarForm && <div className="tes-ayuda"><div><IconSpark size={13} /> {aviso}</div><button type="button" className="btn small btn-ghost" onClick={() => setAviso("")}>Entendido</button></div>}
      {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}

      {/* ---------- Paso 1: datos del banco ---------- */}
      {pasoActual === "datos" && (
        <div className="mv-panel">
          <div className="mv-tipos" role="group" aria-label="¿La plata salió o entró?">
            <button type="button" className={`mv-tipo debito${v.tipo === "debito" ? " on" : ""}`} aria-pressed={v.tipo === "debito"} onClick={() => set({ ...v, tipo: "debito" })}>
              <span className="mv-tipo-i" aria-hidden="true">−</span><span><strong>Salió plata</strong><small>Débito: un pago, una compra, una comisión</small></span>
            </button>
            <button type="button" className={`mv-tipo credito${v.tipo === "credito" ? " on" : ""}`} aria-pressed={v.tipo === "credito"} onClick={() => set({ ...v, tipo: "credito" })}>
              <span className="mv-tipo-i" aria-hidden="true">+</span><span><strong>Entró plata</strong><small>Crédito: una consignación, un abono, un rendimiento</small></span>
            </button>
          </div>
          <div className="mv-form3">
            <div className="field"><label htmlFor="mv-banco">Banco *</label><select id="mv-banco" {...campo("bancoId")}><option value="">Elige…</option>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
            <div className="field"><label htmlFor="mv-fecha">Fecha *</label><input id="mv-fecha" type="date" {...campo("fecha")} /></div>
            <div className="field"><label htmlFor="mv-valor">Valor * ({banco?.moneda || "COP"})</label><MoneyInput id="mv-valor" value={v.valor} onChange={(x) => set({ ...v, valor: x })} prefix={banco?.moneda || "COP"} decimales={2} /></div>
          </div>
          <div className="field"><label htmlFor="mv-desc">Descripción del banco *</label><input id="mv-desc" maxLength={300} {...campo("descripcion")} placeholder="Cópiala como sale en el extracto, por ejemplo: COMPRA PSE INTERNET" /><small className="mv-pista">Igual que en el extracto: así no se duplica si luego lo subes.</small></div>
          <div className="tes-form">
            <div className="field"><label htmlFor="mv-concepto">Concepto <span className="muted">· opcional</span></label><input id="mv-concepto" maxLength={200} {...campo("concepto")} placeholder="Cómo lo llamas tú, como en el Excel" /></div>
            <div className="field"><label htmlFor="mv-tercero">Tercero <span className="muted">· opcional</span></label><input id="mv-tercero" maxLength={200} {...campo("tercero")} placeholder="A quién se pagó o quién consignó" /></div>
          </div>
          <button type="button" className="mv-mas" aria-expanded={masCampos} onClick={() => setMasCampos((x) => !x)}>{masCampos ? "Ocultar" : "Agregar"} más detalles: referencia, observación y datos del banco</button>
          {masCampos && (
            <div className="tes-form">
              <div className="field"><label htmlFor="mv-ref">Referencia</label><input id="mv-ref" maxLength={120} {...campo("referencia")} placeholder="CUS, aprobación, factura" /></div>
              <div className="field"><label htmlFor="mv-obs">Observación</label><input id="mv-obs" maxLength={1000} {...campo("observacion")} /></div>
              <div className="field"><label htmlFor="mv-tc">Tipo de carga</label><input id="mv-tc" maxLength={80} {...campo("tipoCarga")} /></div>
              <div className="field"><label htmlFor="mv-ts">Tipo de solicitud</label><input id="mv-ts" maxLength={80} {...campo("tipoSolicitud")} /></div>
              <div className="field"><label htmlFor="mv-prep">Preparador</label><input id="mv-prep" maxLength={120} {...campo("preparador")} /></div>
              <div className="field"><label htmlFor="mv-fmt">Formato</label><input id="mv-fmt" maxLength={120} {...campo("formato")} /></div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Paso 2: soporte ---------- */}
      {pasoActual === "soporte" && (
        <div className="mv-panel">
          {!archivo && !leyendo && !lecturaInicial && (
            <div className="tes-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
              <span className="mv-drop-i" aria-hidden="true"><IconFile size={22} /></span>
              <strong>Sube la foto o el PDF del comprobante</strong>
              <span>{conSoporte ? "Transferencia, PSE, consignación o factura pagada. Nova lee la fecha, el valor, el tercero y la referencia; tú revisas antes de guardar." : "Haz clic para elegirlo. Es opcional: también lo puedes subir después desde el movimiento."}</span>
            </div>
          )}
          {!archivo && !leyendo && lecturaInicial && (
            <div className="mv-archivo">
              <span className="mv-archivo-i" aria-hidden="true"><IconFile size={20} /></span>
              <div><strong>El comprobante llegó en el texto del correo</strong><small>Nova ya lo leyó. No hay archivo que adjuntar; si lo tienes, súbelo.</small></div>
              <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Subir un archivo</button>
            </div>
          )}
          {archivo && (
            <div className="mv-archivo">
              <span className="mv-archivo-i" aria-hidden="true"><IconFile size={20} /></span>
              <div><strong title={archivo.name}>{archivo.name}</strong><small>{Math.max(1, Math.round(archivo.size / 1024))} KB · se adjunta al movimiento al guardar</small></div>
              {!conSoporte && <button type="button" className="btn small btn-primary" onClick={() => leerConNova()} disabled={leyendo}>{leyendo ? <span className="spinner" /> : <IconSpark size={12} />} Leer con Nova</button>}
              <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={leyendo}>Cambiar</button>
              {!conSoporte && <button type="button" className="btn small btn-ghost" onClick={() => setArchivo(null)} disabled={leyendo}>Quitar</button>}
            </div>
          )}
          {archivo && !conSoporte && !leyendo && <small className="mv-pista">«Leer con Nova» llena la fecha, el valor, el tercero y la referencia por ti, y busca si el pago ya está registrado.</small>}
          {leyendo && <div className="tes-ayuda"><div><span className="spinner" /> Nova está leyendo «{archivo?.name}»…</div></div>}
          {porDecidir && (
            <>
              <div className="mv-ya">
                <strong>Este pago ya parece registrado</strong>
                <span>{coincidencias[0]?.nova ? "Nova cree que es un movimiento que ya existe" : `Hay ${coincidencias.length === 1 ? "un movimiento" : `${coincidencias.length} movimientos`} con el mismo valor y fecha cercana`} (por ejemplo, del extracto). {archivo ? "Adjunta el soporte a ese movimiento para no duplicarlo." : "Confírmalo para no duplicarlo."}</span>
              </div>
              {coincidencias.map((c) => (
                <div key={c.id} className={`tes-cand${c.nova ? ` tes-cand-nova conf-${c.nova.confianza}` : ""}`}>
                  <div><strong>{c.nova && <span className="tes-nova-chip">Nova sugiere</span>}{c.descripcion}</strong><small>{c.banco} · {fechaCorta(c.fecha)} · {c.tipo === "debito" ? "Débito" : "Crédito"}{c.concepto ? ` · «${c.concepto}»` : ""}{c.soportes ? ` · ya tiene ${c.soportes} soporte(s)` : ""}</small>{c.nova?.motivo && <small className="tes-posible-motivo">Nova (confianza {c.nova.confianza}): {c.nova.motivo}</small>}</div>
                  <span className="tes-num">{c.valorTexto}</span>
                  <button type="button" className="btn small btn-primary" disabled={guardando} onClick={() => adjuntarA(c)}>{!archivo ? (asoc.length && !c.pagos ? "Es este · asociar el pago" : "Es este movimiento") : asoc.length && !c.pagos ? "Adjuntar el soporte y asociar el pago" : "Adjuntar el soporte a este"}</button>
                </div>
              ))}
              {pagosPos.length > 0 && pagosPosibles()}
              <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => { setNuevoDeTodasFormas(true); setPaso("datos"); }}>No, es otro pago: registrarlo como movimiento nuevo</button>
            </>
          )}
        </div>
      )}

      {/* ---------- Paso 3: pago ---------- */}
      {pasoActual === "pago" && (
        <div className="mv-panel">
          {pagosPos.length > 0 && pagosPosibles()}
          {conComprobante && !pagosPos.length && <small className="mv-pista">No encontré un pago programado con un valor parecido cerca de esa fecha. Búscalo abajo, créalo o guarda sin asociar.</small>}
          <AsociadorPagos movimiento={v} lista={asoc} onCambio={setAsoc} />
        </div>
      )}
    </Modal>
  );
}

// ---------- Detalle ----------
// Encabezado con el resumen y tres pestañas: Pagos (asociar o cambiar), Soportes (subir o quitar) y Datos (ver y editar).
export function DetalleMovimientoModal({ id, cat, puedeRegistrar, onClose, onCambio, onEditar }) {
  const { confirmar } = useConfirmar();
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pagos");
  const [asociando, setAsociando] = useState(false);
  const [asoc, setAsoc] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const fileRef = useRef(null);
  const cargar = () => tesMovimiento(id).then((x) => { setM(x); setAsoc(x.listaPagos.map((a) => ({ pagoId: a.pagoId, valor: String(a.valor), pago: { concepto: a.concepto, item: a.item, mes: a.mes, anio: a.anio, valor: a.valorPago } }))); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarAsoc() {
    setOcupado(true); setError("");
    try { await tesAsociarMovimiento(id, asoc.map((a) => ({ pagoId: a.pagoId, valor: a.valor }))); await cargar(); setAsociando(false); onCambio("Asociaciones guardadas."); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function subir(f) {
    if (!f) return;
    setOcupado(true); setError("");
    try { await tesAgregarSoporte(id, f); await cargar(); onCambio(); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function quitarSoporte(s) {
    if (!(await confirmar({ titulo: "Quitar el soporte", mensaje: `¿Quitar «${s.nombre}» de este movimiento?`, detalle: "El archivo se borra del movimiento. Queda en Auditoría que se quitó.", boton: "Sí, quitar", peligro: true }))) return;
    setOcupado(true); setError("");
    try { await tesBorrarSoporte(s.id); await cargar(); onCambio(); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function eliminar() {
    const detalle = [m.pagos ? `Sus ${m.pagos} pago(s) asociados vuelven a quedar pendientes (si pasaron a pagado por esta asociación).` : null, m.listaSoportes.length ? `Se borran sus ${m.listaSoportes.length} soporte(s).` : null, "No se puede deshacer."].filter(Boolean).join(" ");
    if (!(await confirmar({ titulo: "Eliminar el movimiento", mensaje: `¿Eliminar «${m.descripcion}» por ${m.valorTexto}?`, detalle, boton: "Sí, eliminar", peligro: true }))) return;
    setOcupado(true); setError("");
    try { await tesBorrarMovimiento(id); onCambio("Movimiento eliminado."); onClose(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  if (!m) return <Modal titulo="Movimiento del banco" onClose={onClose}>{error ? <p className="modal-error">{error}</p> : <span className="spinner" />}</Modal>;

  const asignado = m.asignado ?? m.valor - m.sinAsignar;
  const estadoAsoc = m.pagos === 0 ? ["warning", "Sin pago asociado"] : Math.abs(m.sinAsignar) > 0.5 ? ["secondary", `Asociado en parte · faltan ${m.sinAsignarTexto}`] : ["good", `Asociado a ${m.pagos} pago(s)`];
  const origen = m.origen === "importacion" ? "con la plantilla de Excel" : m.origen === "extracto" ? "con el extracto del banco" : "a mano";
  const TABS = [["pagos", "Pagos", m.listaPagos.length], ["soportes", "Soportes", m.listaSoportes.length], ["datos", "Datos", null]];
  const dato = (etiqueta, valor) => (<div><span>{etiqueta}</span><strong>{valor || "—"}</strong></div>);
  return (
    <Modal titulo="Movimiento del banco" sub={`#${m.id} · registrado ${origen}${m.creadoPorNombre ? ` por ${m.creadoPorNombre}` : ""}`} onClose={onClose} ancho={920}
      pie={asociando ? <>
        <button type="button" className="btn" onClick={() => { setAsociando(false); cargar(); }} disabled={ocupado}>Cancelar</button>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={guardarAsoc} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Guardar asociaciones</button>
      </> : <>
        {puedeRegistrar && <button type="button" className="btn btn-ghost btn-danger-text" onClick={eliminar} disabled={ocupado}><IconTrash size={13} /> Eliminar</button>}
        <div className="spacer" />
        {puedeRegistrar && <button type="button" className="btn" onClick={() => onEditar(m)} disabled={ocupado}><IconEdit size={13} /> Editar datos</button>}
        <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button>
      </>}>
      <HeroMovimiento tipo={m.tipo} valor={m.valor} moneda={m.moneda} titulo={m.descripcion}
        sub={[m.banco, `${fechaCorta(m.fecha)}${m.fechaAproximada ? " (fecha aproximada)" : ""}`, m.tercero].filter(Boolean).join(" · ")}>
        <span className={`pill ${estadoAsoc[0]}`}>{estadoAsoc[1]}</span>
        <span className={`pill ${m.listaSoportes.length ? "good" : "muted"}`}>{m.listaSoportes.length ? `${m.listaSoportes.length} soporte(s)` : "Sin soporte"}</span>
      </HeroMovimiento>

      <div className="dash-tabs mv-tabs" role="tablist" aria-label="Secciones del movimiento">
        {TABS.map(([k, t, n]) => (
          <button key={k} type="button" role="tab" className="dash-tab" aria-selected={tab === k} disabled={asociando && k !== "pagos"} onClick={() => setTab(k)}>{t}{n != null && <span className="ag-num">{n}</span>}</button>
        ))}
      </div>
      {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}

      {/* ---------- Pagos ---------- */}
      {tab === "pagos" && (asociando ? (
        <div className="mv-panel"><AsociadorPagos movimiento={m} lista={asoc} onCambio={setAsoc} /></div>
      ) : (
        <div className="mv-panel">
          <BarraCuadre valor={m.valor} repartido={asignado} moneda={m.moneda} />
          {m.listaPagos.length ? m.listaPagos.map((a) => (
            <a key={a.asociacionId} className="mv-pago" href={`/tesoreria/pagos?id=${a.pagoId}`} title="Abrir el pago">
              <div className="mv-cand-txt">
                <strong>{a.concepto}</strong>
                <small>{[a.item, `${MESES[a.mes - 1]} ${a.anio}`, `programado ${a.valorPagoTexto}`, a.origen === "agente" ? "lo propuso el agente" : null].filter(Boolean).join(" · ")}</small>
              </div>
              <TipoPago tipo={a.tipo} />
              <EstadoPago estado={a.estado} />
              <span className="mv-pago-valor"><small>Va a este pago</small><strong className="tes-num">{a.valorTexto}</strong></span>
              <IconArrowRight size={14} />
            </a>
          )) : (
            <div className="mv-vacio">
              <strong>Este movimiento todavía no tiene pago</strong>
              <span>Asócialo al pago programado que se pagó con él: el pago pasa a pagado. Si el pago no existe, lo puedes crear ahí mismo.</span>
            </div>
          )}
          {puedeRegistrar && <button type="button" className={`btn${m.listaPagos.length ? "" : " btn-primary"}`} style={{ alignSelf: "flex-start" }} onClick={() => setAsociando(true)}>{m.listaPagos.length ? "Cambiar los pagos asociados" : "Asociar a un pago"}</button>}
        </div>
      ))}

      {/* ---------- Soportes ---------- */}
      {tab === "soportes" && (
        <div className="mv-panel">
          {m.listaSoportes.map((s) => (
            <div key={s.id} className="mv-archivo">
              <span className="mv-archivo-i" aria-hidden="true"><IconFile size={20} /></span>
              <div><strong title={s.nombre}>{s.nombre}</strong><small>{Math.max(1, Math.round(s.tamano / 1024))} KB · subido por {s.creadoPorNombre || "—"} el {fechaSinAnio(String(s.createdAt).slice(0, 10))}</small></div>
              <a className="btn small" href={urlSoporte(s.id)} target="_blank" rel="noreferrer">Ver</a>
              {puedeRegistrar && <button type="button" className="btn small btn-ghost btn-danger-text" onClick={() => quitarSoporte(s)} disabled={ocupado}>Quitar</button>}
            </div>
          ))}
          {!m.listaSoportes.length && !puedeRegistrar && <div className="mv-vacio"><strong>Sin soporte</strong><span>Nadie ha subido el comprobante de este movimiento.</span></div>}
          {puedeRegistrar && (
            <>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; subir(f); }} />
              <div className={`tes-drop mv-drop-chico${ocupado ? " ocupado" : ""}`} role="button" tabIndex={0} onClick={() => !ocupado && fileRef.current?.click()} onKeyDown={(e) => e.key === "Enter" && !ocupado && fileRef.current?.click()}>
                <span className="mv-drop-i" aria-hidden="true">{ocupado ? <span className="spinner" /> : <IconPlus size={18} />}</span>
                <strong>{m.listaSoportes.length ? "Subir otro soporte" : "Sube el comprobante de este movimiento"}</strong>
                <span>Foto o PDF, hasta 10 MB.</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- Datos ---------- */}
      {tab === "datos" && (
        <div className="mv-panel">
          <div className="tes-detalle mv-datos">
            {dato("Banco", m.banco)}
            {dato("Fecha", `${fechaCorta(m.fecha)}${m.fechaAproximada ? " (aproximada)" : ""}`)}
            {dato("Tipo", m.tipoTexto)}
            {dato("Valor", m.valorTexto)}
            <div className="ancho"><span>Descripción del banco</span><strong>{m.descripcion}</strong></div>
            {dato("Concepto", m.concepto)}
            {dato("Tercero", m.tercero)}
            {dato("Referencia", m.referencia)}
            {dato("Sin asignar a pagos", m.sinAsignarTexto)}
            {m.observacion && <div className="ancho"><span>Observación</span><strong>{m.observacion}</strong></div>}
            {(m.tipoCarga || m.tipoSolicitud || m.preparador || m.formato) && <div className="ancho"><span>Datos del banco</span><strong>{[m.tipoCarga, m.tipoSolicitud, m.preparador, m.formato].filter(Boolean).join(" · ")}</strong></div>}
            {dato("Registró", `${m.creadoPorNombre || "—"} · ${origen}`)}
          </div>
          {puedeRegistrar && <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => onEditar(m)}><IconEdit size={13} /> Editar estos datos</button>}
        </div>
      )}
    </Modal>
  );
}

// ---------- Subir extracto ----------
export function ExtractoModal({ cat, bancoId: bancoInicial, onClose, onListo }) {
  const [bancoId, setBancoId] = useState(bancoInicial || cat.bancos.filter((b) => b.activo)[0]?.id || "");
  const [archivo, setArchivo] = useState(null);
  const [a, setA] = useState(null); // análisis
  const [aprobados, setAprobados] = useState(new Set());
  const [guardarSaldos, setGuardarSaldos] = useState(true);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [ver, setVer] = useState("nuevos");
  const [hecho, setHecho] = useState(null);
  const [agente, setAgente] = useState(null);
  const fileRef = useRef(null);
  const COP = (v) => fmtMoneda(v, a?.moneda || "COP");
  async function analizar() {
    setOcupado(true); setError("");
    try {
      const r = await tesAnalizarExtracto(bancoId, archivo);
      setA(r); setAprobados(new Set(r.nuevos.map((m) => m.clave)));
      setVer(r.nuevos.length ? "nuevos" : r.soloEnSistema.length ? "sistema" : "confirmados");
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }
  async function aplicar() {
    setOcupado(true); setError("");
    try {
      const r = await tesAplicarExtracto(a.token, [...aprobados], guardarSaldos);
      setHecho({ ...r, mensaje: `Extracto de ${r.banco}: ${r.creados} movimiento(s) registrados${r.noAprobados ? `, ${r.noAprobados} no aprobados` : ""}${r.verificados ? `, ${r.verificados} verificados` : ""}${r.saldosGuardados ? " y saldos del banco guardados" : ""}.` });
      setOcupado(false);
    } catch (e) { setError(e.message); setOcupado(false); }
  }
  const alternar = (clave) => setAprobados((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  async function correrAgentes() {
    setAgente({ estado: "corriendo" });
    try {
      const [mov, pag] = await Promise.all([tesBuscarPropuestas({}), tesBuscarPropuestas({ agente: "pagos", alcance: "todos", anio: Number(a.hasta.slice(0, 4)), mes: Number(a.hasta.slice(5, 7)) })]);
      setAgente({ estado: "listo", propuestas: (mov.propuestas || 0) + (pag.propuestas || 0), alta: (mov.porConfianza?.alta || 0) + (pag.porConfianza?.alta || 0) });
    } catch (e) { setAgente({ estado: "error", error: e.message }); }
  }
  // Paso siguiente a aprobar: el flujo del mes (extracto → asociar con el agente → conciliar).
  if (hecho) {
    const anioEx = Number(a.hasta.slice(0, 4));
    const mesEx = Number(a.hasta.slice(5, 7));
    return (
      <Modal titulo="Extracto registrado" sub={hecho.mensaje} onClose={() => onListo(hecho.mensaje)} ancho={720}
        pie={<><div className="spacer" /><button type="button" className="btn" onClick={() => onListo(hecho.mensaje)}>Listo, lo hago después</button></>}>
        <div className="tes-flujo">
          <div className="tes-flujo-paso ok"><span>1</span><div><strong>Extracto subido</strong><small>{hecho.creados} nuevo(s) · {hecho.verificados} confirmado(s) por el banco{hecho.noAprobados ? ` · ${hecho.noAprobados} sin aprobar (quedan en Por resolver)` : ""}</small></div></div>
          <div className={`tes-flujo-paso${agente?.estado === "listo" ? " ok" : ""}`}><span>2</span>
            <div><strong>Asociar cada movimiento con su pago</strong>
              <small>{!agente ? "Los agentes buscan el pago de los movimientos nuevos y el movimiento de los pagos que ya debían estar pagados. Solo proponen: tú apruebas." : agente.estado === "corriendo" ? "Buscando…" : agente.estado === "error" ? agente.error : `${agente.propuestas} propuesta(s), ${agente.alta} de confianza alta.`}</small>
            </div>
            {!agente || agente.estado === "error" ? <button type="button" className="btn btn-primary small" onClick={correrAgentes}><IconSpark size={12} /> Buscar ahora</button>
              : agente.estado === "corriendo" ? <span className="spinner" />
                : <a className="btn small btn-primary" href="/tesoreria/agentes">Revisar propuestas</a>}
          </div>
          <div className="tes-flujo-paso"><span>3</span><div><strong>Conciliar {MESES[mesEx - 1].toLowerCase()}</strong><small>Ver si lo registrado da el saldo del banco y resolver lo que falte.</small></div>
            <a className="btn small" href={`/tesoreria/conciliacion?anio=${anioEx}&mes=${mesEx}&bancoId=${a.bancoId}`}>Ir a conciliar</a>
          </div>
          <div className="tes-flujo-paso"><span>4</span><div><strong>Subir los soportes</strong><small>Los comprobantes de los pagos del mes, varios a la vez.</small></div>
            <a className="btn small" href="/tesoreria/por-resolver">Ir a Por resolver</a>
          </div>
        </div>
      </Modal>
    );
  }
  // Cómo queda el saldo final con lo que está marcado.
  const netoMarcado = a ? a.nuevos.filter((m) => aprobados.has(m.clave)).reduce((x, m) => x + (m.tipo === "credito" ? m.valor : -m.valor), 0) : 0;
  const finalMarcado = a?.saldos.sistemaFinal != null ? a.saldos.sistemaFinal + netoMarcado : null;
  const difMarcado = finalMarcado != null && a?.saldoFinal != null ? Math.round((finalMarcado - a.saldoFinal) * 100) / 100 : null;
  const cuadra = (v) => v != null && Math.abs(v) < 1;

  return (
    <Modal titulo={a ? `Revisa el extracto de ${a.banco}` : "Subir extracto del banco"}
      sub={a ? `${a.archivo} · ${fechaCorta(a.desde)} a ${fechaCorta(a.hasta)} · ${a.lineas} línea(s). Nada se registra hasta que apruebes.` : "PDF, Excel (.xlsx, .xls) o CSV, del mes completo o parcial. Primero se analiza y te muestra las diferencias; tú apruebas qué se registra."}
      onClose={onClose} ancho={a ? 1080 : 620}
      pie={a ? <>
        <button type="button" className="btn" onClick={() => { setA(null); setError(""); }} disabled={ocupado}>← Otro archivo</button><div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={aplicar} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Aprobar: registrar {aprobados.size} movimiento(s){guardarSaldos && (a.saldoInicial != null || a.saldoFinal != null) ? " y guardar saldos" : ""}</button>
      </> : <>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button><div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={analizar} disabled={!bancoId || !archivo || ocupado}>{ocupado ? <span className="spinner" /> : null} Analizar extracto</button>
      </>}>
      {!a && <>
        <div className="field"><label htmlFor="ex-banco">Banco</label><select id="ex-banco" value={bancoId} onChange={(e) => setBancoId(e.target.value)}>{cat.bancos.filter((b) => b.activo).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
        <div className="tes-cand">
          <div><strong>{archivo ? archivo.name : "Ningún archivo elegido"}</strong><small>Se revisa el contenido (sin macros, JavaScript ni archivos incrustados). Analizar no registra nada.</small></div>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf,text/csv" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Elegir archivo</button>
        </div>
      </>}
      {a && <>
        {/* Saldos: lo del sistema contra lo del extracto. */}
        <div className="tes-ex-saldos">
          <div className={`tes-ex-saldo ${a.saldos.difInicial == null ? "" : cuadra(a.saldos.difInicial) ? "ok" : "mal"}`}>
            <span>Saldo inicial · {fechaCorta(a.desde)}</span>
            <strong className="tes-num">{a.saldoInicial == null ? "El archivo no lo trae" : COP(a.saldoInicial)}</strong>
            <small>{a.saldos.sistemaInicial == null ? "El sistema aún no tiene saldo para ese día" : cuadra(a.saldos.difInicial) ? `Cuadra con el sistema (${COP(a.saldos.sistemaInicial)})` : a.saldos.difInicial == null ? `Sistema: ${COP(a.saldos.sistemaInicial)}` : `Sistema: ${COP(a.saldos.sistemaInicial)} · diferencia ${COP(a.saldos.difInicial)} (viene de meses anteriores)`}</small>
          </div>
          <div className={`tes-ex-saldo ${difMarcado == null ? "" : cuadra(difMarcado) ? "ok" : "mal"}`}>
            <span>Saldo final · {fechaCorta(a.hasta)}</span>
            <strong className="tes-num">{a.saldoFinal == null ? "El archivo no lo trae" : COP(a.saldoFinal)}</strong>
            <small>{finalMarcado == null ? "El sistema aún no tiene saldo: se tomará el del extracto" : difMarcado == null ? `Sistema con lo marcado: ${COP(finalMarcado)}` : cuadra(difMarcado) ? `Con lo marcado, el sistema cuadra (${COP(finalMarcado)})` : `Con lo marcado el sistema queda en ${COP(finalMarcado)}: diferencia ${COP(difMarcado)}`}</small>
          </div>
          <div className="tes-ex-saldo">
            <span>Resumen</span>
            <strong className="tes-num">{a.nuevos.length} nuevas · {a.yaCargados + a.aMano.length} ya están</strong>
            <small>{a.soloEnSistema.length ? `${a.soloEnSistema.length} en el sistema que el banco no trae` : "Todo lo del sistema en esas fechas está en el extracto"}</small>
          </div>
        </div>
        {a.aviso && <div className="tes-ayuda tes-ayuda-alerta"><div>{a.aviso}</div></div>}
        {/* Conciliación bancaria contable: qué tengo que el banco no, qué trae el banco que no tengo y lo que queda sin explicar. */}
        {a.conciliacion?.saldoBanco != null && a.conciliacion?.saldoLibros != null && (
          <>
            <ConciliacionContable moneda={a.moneda} saldoBanco={a.conciliacion.saldoBanco} saldoLibros={a.conciliacion.saldoLibros} contable={a.conciliacion} sinExplicar={a.conciliacion.sinExplicar} alTexto={` al ${fechaCorta(a.hasta)}`} />
            <PistasDiferencia pistas={a.conciliacion.pistas} moneda={a.moneda} puede={false} />
          </>
        )}
        <div className="dash-tabs" role="tablist" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "nuevos"} onClick={() => setVer("nuevos")}>El banco trae y no tengo · {a.nuevos.length}</button>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "sistema"} onClick={() => setVer("sistema")}>Tengo y el banco no trae · {a.soloEnSistema.length}</button>
          <button type="button" role="tab" className="dash-tab" aria-selected={ver === "confirmados"} onClick={() => setVer("confirmados")}>Confirmados · {a.yaCargados + a.aMano.length}</button>
        </div>
        {ver === "nuevos" && (a.nuevos.length ? (
          <div className="table-scroll tes-ex-lista">
            <table className="records tes-tabla">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Aprobar todas" checked={aprobados.size === a.nuevos.length} onChange={(e) => setAprobados(e.target.checked ? new Set(a.nuevos.map((m) => m.clave)) : new Set())} /></th><th>Fecha</th><th>Descripción del banco</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
              <tbody>
                {a.nuevos.map((m) => (
                  <tr key={m.clave} className={aprobados.has(m.clave) ? "" : "tes-ex-no"} onClick={() => alternar(m.clave)} style={{ cursor: "pointer" }}>
                    <td><input type="checkbox" checked={aprobados.has(m.clave)} onChange={() => alternar(m.clave)} onClick={(e) => e.stopPropagation()} aria-label={`Aprobar ${m.descripcion}`} /></td>
                    <td>{fechaSinAnio(m.fecha)}</td>
                    <td><span className="desc-tooltip-wrap"><span className="desc-text desc-text-ancha">{m.descripcion}</span><span className="desc-tooltip-bubble">{m.descripcion}</span></span></td>
                    <td style={{ textAlign: "right" }} className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COP(m.tipo === "debito" ? -m.valor : m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty compacta">El extracto no trae nada nuevo: todo ya estaba registrado.</div>)}
        {ver === "sistema" && (a.soloEnSistema.length ? (
          <>
            <div className="tes-ayuda tes-ayuda-alerta"><div>Estos movimientos están registrados en esas fechas pero <strong>el banco no los trae</strong>. Puede ser un error de registro, un duplicado o algo que aún no pasó por el banco. No se borran solos: ábrelos en Movimientos si hay que corregirlos.</div></div>
            <div className="table-scroll tes-ex-lista">
              <table className="records tes-tabla">
                <thead><tr><th>Fecha</th><th>Descripción</th><th>Origen</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
                <tbody>{a.soloEnSistema.map((m) => (
                  <tr key={m.id}><td>{fechaSinAnio(m.fecha)}</td><td><span className="desc-tooltip-wrap"><span className="desc-text desc-text-ancha">{m.descripcion}</span><span className="desc-tooltip-bubble">{m.descripcion}</span></span></td><td><span className="pill muted">{m.origen}</span></td><td style={{ textAlign: "right" }} className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COP(m.tipo === "debito" ? -m.valor : m.valor)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <div className="empty compacta">Todo lo registrado en esas fechas está en el extracto.</div>)}
        {ver === "confirmados" && <div className="empty compacta">{a.yaCargados} línea(s) ya estaban cargadas{a.deOtroArchivo ? ` (${a.deOtroArchivo} desde otro archivo del banco)` : ""}{a.aMano.length ? ` y ${a.aMano.length} coinciden con movimientos registrados a mano: quedarán verificados por el banco` : ""}.</div>}
        {(a.saldoInicial != null || a.saldoFinal != null) && (
          <label className="tes-check"><span>Guardar los saldos del extracto como saldo del banco (el mes siguiente arranca con el saldo final de este)</span><input type="checkbox" checked={guardarSaldos} onChange={(e) => setGuardarSaldos(e.target.checked)} /></label>
        )}
      </>}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}

// «Subir varios soportes»: se eligen varios comprobantes (PDF o fotos) y Nova lee cada uno; para cada recibo se propone
// el movimiento del banco que corresponde (mismo valor, ±3 días, mismo sentido). La persona revisa y adjunta los que
// quiera de una vez; los que no tienen movimiento se registran después con «Registrar con soporte».
export function SoportesLoteModal({ onClose, onListo }) {
  const [filas, setFilas] = useState([]); // { archivo, estado, leido, opciones, elegido, duplicado, error }
  const [leyendo, setLeyendo] = useState(false);
  const [adjuntando, setAdjuntando] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  async function elegir(lista) {
    const nuevos = [...lista].filter((f) => /pdf|image/.test(f.type) || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)).slice(0, 25);
    if (!nuevos.length) { setError("Elige comprobantes en PDF o fotos (JPG, PNG)."); return; }
    setError("");
    const base = filas.length;
    setFilas((x) => [...x, ...nuevos.map((archivo) => ({ archivo, estado: "pendiente" }))]);
    setLeyendo(true);
    for (let i = 0; i < nuevos.length; i++) {
      setFilas((x) => x.map((r, k) => (k === base + i ? { ...r, estado: "leyendo" } : r)));
      try {
        const r = await tesLeerSoporte(nuevos[i]);
        const opciones = (r.coincidencias || []).filter((c) => !c.soportes);
        setFilas((x) => x.map((f, k) => (k === base + i ? { ...f, estado: "leido", leido: r.leido, opciones, todas: r.coincidencias || [], elegido: !r.duplicado && opciones.length === 1 ? opciones[0].id : "", duplicado: r.duplicado } : f)));
      } catch (e) {
        setFilas((x) => x.map((f, k) => (k === base + i ? { ...f, estado: "error", error: e.message } : f)));
      }
    }
    setLeyendo(false);
  }
  const listos = filas.filter((f) => f.estado === "leido" && f.elegido && !f.duplicado);
  async function adjuntar() {
    setAdjuntando(true); setError("");
    let ok = 0;
    for (const f of listos) {
      try { await tesAgregarSoporte(Number(f.elegido), f.archivo); ok++; setFilas((x) => x.map((r) => (r === f ? { ...r, estado: "adjuntado" } : r))); }
      catch (e) { setFilas((x) => x.map((r) => (r === f ? { ...r, estado: "error", error: e.message } : r))); }
    }
    setAdjuntando(false);
    if (ok === listos.length) onListo(`${ok} soporte(s) adjuntados a su movimiento.`);
  }
  return (
    <Modal titulo="Subir varios soportes" sub="Elige los comprobantes (PDF o fotos, hasta 25). Nova lee cada uno y te propone su movimiento del banco; nada se adjunta hasta que confirmes." onClose={onClose} ancho={980}
      pie={<><button type="button" className="btn" onClick={onClose}>Cerrar</button><div className="spacer" /><button type="button" className="btn btn-primary" onClick={adjuntar} disabled={!listos.length || leyendo || adjuntando}>{adjuntando ? <span className="spinner" /> : null} Adjuntar {listos.length} soporte(s)</button></>}>
      <div className="tes-lote-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files); }}>
        <strong>Arrastra aquí los comprobantes o haz clic para elegirlos</strong>
        <small>Recibos PSE, transferencias, pagos de facturas, consignaciones. Se revisa cada archivo antes de leerlo.</small>
        <input ref={fileRef} type="file" multiple accept=".pdf,image/*" hidden onChange={(e) => { elegir(e.target.files || []); e.target.value = ""; }} />
      </div>
      {filas.length > 0 && (
        <div className="tes-lote-lista">
          {filas.map((f, i) => (
            <div key={i} className={`tes-lote-fila ${f.estado}${f.duplicado ? " dup" : ""}`}>
              <div className="tes-lote-arch"><strong>{f.archivo.name}</strong>
                <small>{f.estado === "pendiente" ? "En cola…" : f.estado === "leyendo" ? "Nova está leyendo…" : f.estado === "error" ? f.error : f.estado === "adjuntado" ? "Adjuntado ✓" : f.leido ? [f.leido.fecha, f.leido.valor ? fmtMoneda(f.leido.valor, "COP") : null, f.leido.tercero].filter(Boolean).join(" · ") || "No se pudo leer el valor" : ""}</small>
              </div>
              <div className="tes-lote-mov">
                {f.estado === "leyendo" && <span className="spinner" />}
                {f.duplicado && <span className="pill muted">{f.duplicado}</span>}
                {f.estado === "leido" && !f.duplicado && (f.opciones.length ? (
                  <select value={f.elegido} onChange={(e) => setFilas((x) => x.map((r, k) => (k === i ? { ...r, elegido: e.target.value } : r)))} aria-label={`Movimiento para ${f.archivo.name}`}>
                    <option value="">No adjuntar</option>
                    {f.opciones.map((c) => <option key={c.id} value={c.id}>{c.fecha} · {c.banco} · {c.descripcion} · {c.valorTexto}</option>)}
                  </select>
                ) : <span className="pill warning">{f.todas?.length ? "Su movimiento ya tiene soporte" : "No hay movimiento con ese valor y fecha: regístralo con «Registrar con soporte»"}</span>)}
                {f.estado === "leido" && !f.duplicado && f.opciones.length === 1 && <span className="pill good">Coincide</span>}
                {f.estado === "leido" && !f.duplicado && f.opciones.length > 1 && <span className="pill accent">{f.opciones.length} posibles: elige</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  );
}
