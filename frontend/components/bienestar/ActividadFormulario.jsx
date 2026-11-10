"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtCOP, fmtDateTime } from "@/lib/format";
import {
  createActividadApi, updateActividadApi, deleteActividadApi, fetchActividadApi,
  fetchComprasDisponiblesApi, asociarCompraApi, desasociarCompraApi,
} from "@/lib/api";
import MoneyInput from "@/components/MoneyInput";
import { EsqueletoLista } from "@/components/bienestar/Esqueletos";
import CerrarActividadModal, { razonParaNoCerrar } from "@/components/bienestar/CerrarActividadModal";
import PiePagina, { usePagina, PAGE_SIZES_MODAL } from "@/components/bienestar/PiePagina";
import { ModalSolicitar } from "@/components/bienestar/SolicitudesActividad";
import { IconTrash, IconSearch, IconPlus, IconCheck, IconHeart, IconUsers, IconAlert } from "@/components/icons";
import { ESTADOS_ACTIVIDAD, LINEAS_ACTIVIDAD, estadoActividad, pctClase, rangoHumano, diasDeActividad } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";

const vacio = {
  nombre: "",
  fecha: "",
  fechaFin: "",
  linea: "Bienestar",
  estado: "creada",
  responsableUserId: "",
  presupuesto: "",
  inscritos: "",
  asistentes: "",
  enCronograma: true,
  aplicaParticipantes: true,
  descripcion: "",
  observaciones: "",
};

const LEGALIZADO = "Legalizado";

const PASOS = [
  { id: "actividad", label: "La actividad", ayuda: "Nombre, fechas y responsable" },
  { id: "presupuesto", label: "Presupuesto", ayuda: "Cuánto se asigna y qué va de gasto" },
  { id: "asistencia", label: "Asistencia", ayuda: "Inscritos y quiénes fueron" },
  { id: "compras", label: "Compras", ayuda: "Lo que se compra para ella" },
];

const AYUDA_ESTADO = {
  creada: "Es una idea: aún no tiene fecha confirmada.",
  programada: "Ya tiene fecha y se está preparando.",
  ejecutada: "Ya se realizó. Cuando todo esté listo, ciérrala con el botón Cerrar actividad.",
};

// Formulario de una actividad de Bienestar en su propia página, para crear (/actividades/nueva) y editar
// (/actividades/[id]/editar). A la izquierda los pasos, que se recorren en cualquier orden porque solo el primero es
// obligatorio; a la derecha, fijo, cómo va quedando la actividad y qué le falta. Las compras se asocian aquí (entre las
// que aún no tienen actividad) o desde el formulario de Compras; "Solicitar compra" le avisa a Compras, que la gestiona.
export default function ActividadFormulario({ actividad, lineaPorDefecto = "Bienestar", lineasPermitidas = LINEAS_ACTIVIDAD, fechaInicial, responsables = [], puedeEditar, basePath = "/bienestar" }) {
  const router = useRouter();
  const isEdit = !!actividad;
  // ?paso=compras (botón "Asociar compras" de la ficha) abre directo en esa pestaña.
  const pasoPedido = useSearchParams().get("paso");
  const [paso, setPaso] = useState(PASOS.some((p) => p.id === pasoPedido) ? pasoPedido : "actividad");
  const primerosDatos = useMemo(() => {
    if (!actividad) return { ...vacio, linea: lineaPorDefecto, fecha: fechaInicial || "", estado: fechaInicial ? "programada" : "creada" };
    const out = { ...vacio };
    for (const k of Object.keys(vacio)) out[k] = actividad[k] ?? vacio[k];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [form, setForm] = useState(primerosDatos);
  const [inicial, setInicial] = useState(primerosDatos); // lo último guardado
  const [guardada, setGuardada] = useState(actividad); // la actividad con lo último que se guardó
  const [avisoGuardado, setAvisoGuardado] = useState(false);
  const [variosDias, setVariosDias] = useState(!!actividad?.fechaFin);
  const [compras, setCompras] = useState(null); // asociadas (edición); null = cargando
  const [porAsociar, setPorAsociar] = useState([]); // elegidas al crear: se asocian al guardar
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const [solicitar, setSolicitar] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [buscarCompra, setBuscarCompra] = useState("");
  const guardado = useRef(false);

  useEffect(() => {
    if (!isEdit) { setCompras([]); return; }
    fetchActividadApi(actividad.id).then((r) => setCompras(r.actividad.detalleCompras || [])).catch(() => setCompras([]));
  }, [isEdit, actividad?.id]);

  useEffect(() => {
    if (!avisoGuardado) return undefined;
    const t = setTimeout(() => setAvisoGuardado(false), 3500);
    return () => clearTimeout(t);
  }, [avisoGuardado]);

  // Salir con cambios sin guardar pide confirmación del navegador.
  const sucio = JSON.stringify(form) !== JSON.stringify(inicial) || porAsociar.length > 0;
  useEffect(() => {
    const avisar = (e) => { if (sucio && !guardado.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const update = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrores((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const ro = !puedeEditar;
  const cerrada = actividad?.estado === "cerrada";
  const baseDe = (linea) => (linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar");
  const urlVolver = isEdit ? `${basePath}/actividades/${actividad.id}` : `${basePath}/actividades`;

  // El responsable actual se conserva aunque ya no esté en el maestro.
  const opcionesResponsable = useMemo(() => {
    const yaEsta = responsables.some((r) => r.userId === actividad?.responsableUserId);
    return actividad?.responsableUserId && !yaEsta ? [...responsables, { userId: actividad.responsableUserId, nombre: actividad.responsableNombre || "Responsable actual" }] : responsables;
  }, [responsables, actividad]);

  // Presupuesto y costo: ejecutado = compras legalizadas; en trámite = el resto de las asociadas.
  const lista = isEdit ? compras || [] : porAsociar;
  const ejecutado = lista.filter((c) => c.estadoLegalizacion === LEGALIZADO).reduce((s, c) => s + (c.valorConIva || 0), 0);
  const total = lista.reduce((s, c) => s + (c.valorConIva || 0), 0);
  const enTramite = total - ejecutado;
  const presupuestoNum = form.presupuesto === "" || form.presupuesto === null ? null : Number(form.presupuesto);
  const pct = presupuestoNum ? total / presupuestoNum : null;
  const inscritos = form.inscritos === "" || form.inscritos === null ? null : Number(form.inscritos);
  const asistentes = form.asistentes === "" || form.asistentes === null ? null : Number(form.asistentes);
  const pctAsistencia = inscritos && asistentes != null ? asistentes / inscritos : null;
  const comprasVisibles = lista.filter((c) => {
    const q = buscarCompra.trim().toLowerCase();
    return !q || [c.localSeq, c.descripcion, c.proveedor, c.estadoLegalizacion, c.fechaSolicitud].some((v) => String(v ?? "").toLowerCase().includes(q));
  });
  const pagCompras = usePagina(comprasVisibles, buscarCompra, PAGE_SIZES_MODAL[0]);
  const est = estadoActividad(form.estado);
  const fechaRequerida = form.estado !== "creada";

  const faltan = [
    !form.nombre.trim() && { paso: "actividad", texto: "Ponle un nombre" },
    fechaRequerida && !form.fecha && { paso: "actividad", texto: `Una actividad ${est.label.toLowerCase()} necesita fecha` },
  ].filter(Boolean);
  const sugerencias = [
    !form.fecha && !fechaRequerida && { paso: "actividad", texto: "Sin fecha: quedará por planear" },
    !form.responsableUserId && { paso: "actividad", texto: "Sin responsable" },
    presupuestoNum == null && { paso: "presupuesto", texto: "Sin presupuesto asignado" },
  ].filter(Boolean);
  const completo = { actividad: faltan.length === 0, presupuesto: presupuestoNum != null, asistencia: form.aplicaParticipantes === false || inscritos != null || asistentes != null, compras: lista.length > 0 };
  const iPaso = PASOS.findIndex((p) => p.id === paso);

  function enfocar(id) {
    setTimeout(() => document.getElementById(id)?.focus(), 30);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "Ponle un nombre a la actividad.";
    if (fechaRequerida && !form.fecha) errs.fecha = `Una actividad ${est.label.toLowerCase()} debe tener fecha.`;
    if (variosDias && form.fechaFin && form.fechaFin < form.fecha) errs.fechaFin = "No puede ser anterior a la fecha de inicio.";
    setErrores(errs);
    if (Object.keys(errs).length) {
      setPaso("actividad");
      enfocar(errs.nombre ? "act-nombre" : errs.fecha ? "act-fecha" : "act-fecha-fin");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        presupuesto: presupuestoNum,
        // Sin participantes (o recién reactivada y aún en blanco) no se tocan los conteos guardados.
        ...(form.aplicaParticipantes === false || (actividad?.aplicaParticipantes === false && inscritos == null && asistentes == null) ? { inscritos: undefined, asistentes: undefined } : { inscritos, asistentes }),
        fecha: form.fecha || null,
        fechaFin: variosDias ? form.fechaFin || null : null,
        responsableUserId: form.responsableUserId || null,
      };
      let saved;
      if (isEdit) {
        saved = (await updateActividadApi(actividad.id, payload)).actividad;
        setGuardada((g) => ({ ...g, ...saved }));
        setInicial(form);
        setAvisoGuardado(true);
        // Se queda aquí; solo si cambió de línea pasa a la misma página en la otra línea.
        if (saved.linea !== actividad.linea) router.replace(`${baseDe(saved.linea)}/actividades/${saved.id}/editar`);
        router.refresh();
      } else {
        saved = await createActividadApi(payload);
        for (const c of porAsociar) await asociarCompraApi(saved.id, c.id);
        guardado.current = true;
        // Recién creada, va a su ficha para seguir con participantes, inventario y fotos.
        router.push(`${baseDe(saved.linea)}/actividades/${saved.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err.message || "No se pudo guardar la actividad.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      await deleteActividadApi(actividad.id);
      guardado.current = true;
      router.push(`${basePath}/actividades`);
      router.refresh();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la actividad.");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  async function asociar(c) {
    setError("");
    if (!isEdit) {
      setPorAsociar((l) => (l.some((x) => x.id === c.id) ? l : [...l, c]));
      return;
    }
    try {
      await asociarCompraApi(actividad.id, c.id);
      setCompras([...(compras || []), c]);
    } catch (err) {
      setError(err.message || "No se pudo asociar la compra.");
    }
  }

  async function quitar(c) {
    setError("");
    if (!isEdit) {
      setPorAsociar((l) => l.filter((x) => x.id !== c.id));
      return;
    }
    try {
      await desasociarCompraApi(actividad.id, c.id);
      setCompras((compras || []).filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err.message || "No se pudo quitar la compra.");
    }
  }

  const vistaPrevia = { fecha: form.fecha, fechaFin: variosDias ? form.fechaFin : "" };

  return (
    <div className={`af${form.linea === "Fundación" ? " af-fundacion" : ""}`}>
      <header className="af-cabecera">
        <Link href={urlVolver} className="af-volver">‹ {isEdit ? "Volver a la actividad" : "Volver a actividades"}</Link>
        <h1>{isEdit ? form.nombre || actividad.nombre : "Registra una nueva actividad"}</h1>
        <p>{isEdit ? `Registrada por ${actividad.creadoPorNombre || "—"} el ${fmtDateTime(actividad.createdAt)}` : "Solo el nombre es obligatorio para empezar. El resto lo puedes completar cuando lo tengas."}</p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <div className="af-cuerpo">
          <div className="af-principal" data-crossfade-raiz>
            <div className="af-pasos" role="tablist" aria-label="Secciones del formulario">
              {PASOS.map((p, i) => (
                <button key={p.id} type="button" role="tab" id={`af-tab-${p.id}`} aria-selected={paso === p.id} aria-controls={`af-panel-${p.id}`} className={`af-paso${paso === p.id ? " activo" : ""}${completo[p.id] ? " listo" : ""}`} onClick={() => crossfade(() => setPaso(p.id))}>
                  <span className="af-paso-num" aria-hidden="true">{completo[p.id] ? <IconCheck size={13} /> : i + 1}</span>
                  <span className="af-paso-txt"><b>{p.label}{p.id === "compras" && lista.length ? ` (${lista.length})` : ""}</b><small>{p.ayuda}</small></span>
                </button>
              ))}
            </div>

            <section className="af-panel" data-crossfade role="tabpanel" id="af-panel-actividad" aria-labelledby="af-tab-actividad" hidden={paso !== "actividad"}>
              <div className={`af-campo af-nombre${errores.nombre ? " con-error" : ""}`}>
                <label htmlFor="act-nombre">¿Cómo se llama la actividad? *</label>
                <input id="act-nombre" type="text" autoFocus={!isEdit} value={form.nombre} onChange={(e) => update("nombre", e.target.value)} disabled={ro} maxLength={200} placeholder="Ej.: Fiesta de fin de año" aria-invalid={!!errores.nombre} />
                {errores.nombre && <span className="af-error" role="alert">{errores.nombre}</span>}
              </div>

              <fieldset className="af-grupo">
                <legend>¿Para quién es?</legend>
                <div className="af-opciones-2">
                  {LINEAS_ACTIVIDAD.filter((l) => lineasPermitidas.includes(l) || l === form.linea).map((l) => {
                    const Icono = l === "Fundación" ? IconUsers : IconHeart;
                    return (
                      <label key={l} className={`af-opcion-tarjeta${form.linea === l ? " activa" : ""}`}>
                        <input type="radio" name="act-linea" checked={form.linea === l} disabled={ro} onChange={() => update("linea", l)} />
                        <span className="af-opcion-ic"><Icono size={18} /></span>
                        <span><b>{l}</b><small>{l === "Fundación" ? "Acompañamiento a Proyecto Unión" : "Actividades para los colaboradores"}</small></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="af-grupo">
                <legend>¿En qué estado está?</legend>
                <div className="af-estados">
                  {ESTADOS_ACTIVIDAD.filter((s) => s.value !== "cerrada").map((s) => (
                    <label key={s.value} className={`af-estado est-${s.value}${form.estado === s.value ? " activo" : ""}`}>
                      <input type="radio" name="act-estado" checked={form.estado === s.value} disabled={ro} onChange={() => update("estado", s.value)} />
                      <i aria-hidden="true" /> {s.label}
                    </label>
                  ))}
                </div>
                <span className="af-ayuda">{AYUDA_ESTADO[form.estado]}</span>
              </fieldset>

              <fieldset className="af-grupo">
                <legend>¿Cuándo?</legend>
                <div className="af-fila">
                  <div className={`af-campo${errores.fecha ? " con-error" : ""}`}>
                    <label htmlFor="act-fecha">{variosDias ? "Empieza" : "Fecha"}{fechaRequerida ? " *" : ""}</label>
                    <input id="act-fecha" type="date" value={form.fecha || ""} onChange={(e) => update("fecha", e.target.value)} disabled={ro} aria-invalid={!!errores.fecha} />
                    {errores.fecha && <span className="af-error" role="alert">{errores.fecha}</span>}
                  </div>
                  {variosDias && (
                    <div className={`af-campo${errores.fechaFin ? " con-error" : ""}`}>
                      <label htmlFor="act-fecha-fin">Termina</label>
                      <input id="act-fecha-fin" type="date" value={form.fechaFin || ""} min={form.fecha || undefined} onChange={(e) => update("fechaFin", e.target.value)} disabled={ro || !form.fecha} aria-invalid={!!errores.fechaFin} />
                      {errores.fechaFin && <span className="af-error" role="alert">{errores.fechaFin}</span>}
                    </div>
                  )}
                  <label htmlFor="act-varios" className="actividad-check af-check">
                    <span>Dura varios días</span>
                    <input id="act-varios" type="checkbox" checked={variosDias} disabled={ro} onChange={(e) => { setVariosDias(e.target.checked); if (!e.target.checked) update("fechaFin", ""); }} />
                  </label>
                </div>
                <label htmlFor="act-crono" className="actividad-check af-check">
                  <span>Está en el cronograma planeado del año</span>
                  <input id="act-crono" type="checkbox" checked={!!form.enCronograma} onChange={(e) => update("enCronograma", e.target.checked)} disabled={ro} />
                </label>
              </fieldset>

              <div className="af-campo">
                <label htmlFor="act-resp">Responsable</label>
                <select id="act-resp" value={form.responsableUserId || ""} onChange={(e) => update("responsableUserId", e.target.value)} disabled={ro}>
                  <option value="">Sin responsable</option>
                  {opcionesResponsable.map((r) => <option key={r.userId} value={r.userId}>{r.nombre}</option>)}
                </select>
                {responsables.length === 0 && <span className="af-ayuda">Aún no hay responsables: agrégalos en <Link href="/bienestar/maestros">Maestros de Bienestar</Link>.</span>}
              </div>

              <div className="af-campo">
                <label htmlFor="act-desc">Descripción <small>(opcional)</small></label>
                <textarea id="act-desc" rows={3} value={form.descripcion || ""} onChange={(e) => update("descripcion", e.target.value)} disabled={ro} placeholder="Qué se va a hacer y con qué objetivo" />
              </div>
            </section>

            <section className="af-panel" data-crossfade role="tabpanel" id="af-panel-presupuesto" aria-labelledby="af-tab-presupuesto" hidden={paso !== "presupuesto"}>
              <div className="af-campo af-monto">
                <label htmlFor="act-presupuesto">¿Cuánto se le asigna?</label>
                <MoneyInput id="act-presupuesto" value={form.presupuesto ?? ""} onChange={(v) => update("presupuesto", v)} disabled={ro} placeholder="Sin asignar" />
              </div>
              <div className="af-tiles">
                <div><span>Ejecutado</span><strong>{fmtCOP(ejecutado)}</strong><small>Compras legalizadas</small></div>
                <div><span>En trámite</span><strong>{fmtCOP(enTramite)}</strong><small>Asociadas sin legalizar</small></div>
                <div className={presupuestoNum != null && presupuestoNum - total < 0 ? "negativo" : ""}><span>Disponible</span><strong>{presupuestoNum != null ? fmtCOP(presupuestoNum - total) : "—"}</strong><small>Presupuesto − compras</small></div>
              </div>
              {pct != null && (
                <div>
                  <div className="actividad-bar" role="img" aria-label={`Comprometido ${Math.round(pct * 100)} % del presupuesto`}>
                    <span className={pctClase(pct)} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                  </div>
                  <span className="af-ayuda">{Math.round(pct * 100)} % comprometido con {lista.length} compra(s) · alerta al 80 % y al 100 %</span>
                </div>
              )}
              <div className="af-tiles dos">
                <div><span>Costo por asistente</span><strong>{asistentes ? fmtCOP(total / asistentes) : "—"}</strong></div>
                <div><span>Costo por inscrito</span><strong>{inscritos ? fmtCOP(total / inscritos) : "—"}</strong></div>
              </div>
            </section>

            <section className="af-panel" data-crossfade role="tabpanel" id="af-panel-asistencia" aria-labelledby="af-tab-asistencia" hidden={paso !== "asistencia"}>
              <label htmlFor="act-aplica" className="actividad-check af-check">
                <span>Aplica participantes y listas de asistencia</span>
                <input id="act-aplica" type="checkbox" checked={form.aplicaParticipantes !== false} disabled={ro} onChange={(e) => update("aplicaParticipantes", e.target.checked)} />
              </label>
              {form.aplicaParticipantes !== false ? (
                <>
              <div className="af-fila">
                <div className="af-campo">
                  <label htmlFor="act-inscritos">Inscritos</label>
                  <input id="act-inscritos" type="number" min="0" value={form.inscritos ?? ""} onChange={(e) => update("inscritos", e.target.value)} disabled={ro} placeholder="0" />
                </div>
                <div className="af-campo">
                  <label htmlFor="act-asistentes">Asistieron</label>
                  <input id="act-asistentes" type="number" min="0" value={form.asistentes ?? ""} onChange={(e) => update("asistentes", e.target.value)} disabled={ro} placeholder="0" />
                </div>
              </div>
              <div className="af-tiles dos">
                <div><span>Asistencia</span><strong>{pctAsistencia != null ? `${Math.round(pctAsistencia * 1000) / 10} %` : "—"}</strong></div>
                <div className={inscritos && asistentes != null && inscritos - asistentes > 0 ? "aviso" : ""}><span>No asistieron</span><strong>{inscritos && asistentes != null ? Math.max(0, inscritos - asistentes) : "—"}</strong></div>
              </div>
              <p className="af-nota">{isEdit ? "¿Tienes la lista de personas? Impórtala desde Excel en la pestaña Participantes de la ficha: estos números se actualizan solos." : "Después de guardar podrás importar la lista de personas desde Excel, y estos números se actualizarán solos."}</p>
                </>
              ) : (
                <p className="af-nota">Esta actividad no maneja participantes ni asistencia. No se mostrarán esos datos, no contarán en los dashboards y Nova no los tendrá en cuenta al calificarla.</p>
              )}

              <div className="af-campo">
                <label htmlFor="act-obs">Observaciones <small>(opcional)</small></label>
                <textarea id="act-obs" rows={3} value={form.observaciones || ""} onChange={(e) => update("observaciones", e.target.value)} disabled={ro} placeholder="Motivos de inasistencia, sobrantes, satisfacción…" />
              </div>
            </section>

            <section className="af-panel" data-crossfade role="tabpanel" id="af-panel-compras" aria-labelledby="af-tab-compras" hidden={paso !== "compras"}>
              {solicitudEnviada && <div className="ficha-aviso" role="status">Solicitud enviada a Compras. Te avisaremos en tu Bandeja cuando la registren o la rechacen.</div>}
              {isEdit && puedeEditar && !cerrada && (
                <button type="button" className="btn actividad-btn-compras af-solicitar" onClick={() => setSolicitar(true)}>
                  <IconPlus size={13} /> Solicitar compra
                </button>
              )}
              {compras === null ? (
                <EsqueletoLista etiqueta="Cargando las compras" />
              ) : lista.length === 0 ? (
                <p className="af-nota">Aún no hay compras asociadas. Busca abajo las que ya existen{isEdit ? " o solicita una nueva." : "; se asocian al guardar la actividad."}</p>
              ) : (
                <>
                <div className="actividad-buscador-input">
                  <IconSearch size={13} />
                  <input type="search" aria-label="Buscar entre las compras asociadas" placeholder="Busca entre las compras asociadas" value={buscarCompra} onChange={(e) => setBuscarCompra(e.target.value)} />
                </div>
                <ul className="actividad-compras-list sin-tope">
                  {comprasVisibles.length === 0 && <li className="count-note" style={{ display: "block" }}>Ninguna compra asociada coincide con la búsqueda.</li>}
                  {pagCompras.pagina.map((c) => (
                    <li key={c.id}>
                      <span className="mono">#{c.localSeq ?? "—"}</span>
                      <span className="actividad-compra-desc">
                        <span className="desc-tooltip-wrap">
                          <span className="desc-text">{c.descripcion || "Sin descripción"}</span>
                          <span className="desc-tooltip-bubble">{c.descripcion}</span>
                        </span>
                        <span className="count-note">{[c.fechaSolicitud, c.proveedor, c.estadoLegalizacion || "Sin legalizar"].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="actividad-compra-valor">{fmtCOP(c.valorConIva || 0)}</span>
                      {!ro && <button type="button" className="btn small" onClick={() => quitar(c)}>Quitar</button>}
                    </li>
                  ))}
                </ul>
                <PiePagina id="af-compras-size" tamanos={PAGE_SIZES_MODAL} p={pagCompras} total={comprasVisibles.length} etiqueta="compra(s) asociada(s)" />
                </>
              )}
              {!ro && !cerrada && <BuscadorCompras yaElegidas={lista} onElegir={asociar} />}
              {cerrada && <span className="af-ayuda">La actividad está cerrada: no recibe compras nuevas.</span>}
            </section>

            <div className="af-navegar">
              <button type="button" className="btn" disabled={iPaso === 0} onClick={() => crossfade(() => setPaso(PASOS[iPaso - 1].id))}>‹ Anterior</button>
              <button type="button" className="btn" disabled={iPaso === PASOS.length - 1} onClick={() => crossfade(() => setPaso(PASOS[iPaso + 1].id))}>Siguiente ›</button>
            </div>

            {error && <div className="modal-error af-error-general" role="alert">{error}</div>}

            <div className="af-pie">
              {!ro && (
                <button type="submit" className="btn btn-primary af-guardar" disabled={saving}>
                  {saving && <span className="spinner" />} {isEdit ? "Guardar cambios" : "Crear actividad"}
                </button>
              )}
              <Link className="btn" href={urlVolver}>{ro ? "Volver" : "Cancelar"}</Link>
              {sucio && !saving && <span className="af-ayuda">Cambios sin guardar</span>}
              <div className="spacer" />
              {isEdit && !ro && (
                <button type="button" className="btn af-cerrar" disabled={sucio || !!razonParaNoCerrar(guardada)} title={sucio ? "Guarda los cambios antes de cerrar" : razonParaNoCerrar(guardada) || "Calificar y cerrar la actividad"} onClick={() => setCerrar(true)}>
                  <IconCheck size={13} /> Cerrar actividad
                </button>
              )}
              {isEdit && !ro && (confirmDelete ? (
                <span className="confirm-del">
                  <span>¿Eliminar?</span>
                  <button type="button" className="btn btn-danger-solid small" onClick={handleDelete} disabled={saving}>Sí</button>
                  <button type="button" className="btn small" onClick={() => setConfirmDelete(false)} disabled={saving}>No</button>
                </span>
              ) : (
                <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  <IconTrash size={13} /> Eliminar
                </button>
              ))}
            </div>
          </div>

          <aside className="af-resumen" aria-label="Así va quedando la actividad">
            <span className="af-resumen-titulo">Así va quedando</span>
            <div className={`af-tarjeta est-${form.estado}`}>
              <span className={`pill ${est.pill}`}>{est.label}</span>
              <strong className={form.nombre.trim() ? "" : "vacio"}>{form.nombre.trim() || "Nombre de la actividad"}</strong>
              <dl>
                <div><dt>Cuándo</dt><dd>{rangoHumano(vistaPrevia)}{vistaPrevia.fechaFin && vistaPrevia.fecha ? ` · ${diasDeActividad(vistaPrevia)} días` : ""}</dd></div>
                <div><dt>Línea</dt><dd>{form.linea}</dd></div>
                <div><dt>Responsable</dt><dd>{opcionesResponsable.find((r) => r.userId === form.responsableUserId)?.nombre || "Sin asignar"}</dd></div>
                <div><dt>Presupuesto</dt><dd>{presupuestoNum != null ? fmtCOP(presupuestoNum) : "Sin asignar"}</dd></div>
                <div><dt>Compras</dt><dd>{lista.length ? `${lista.length} · ${fmtCOP(total)}` : "Ninguna"}</dd></div>
                {form.aplicaParticipantes !== false && (inscritos != null || asistentes != null) && <div><dt>Personas</dt><dd>{asistentes ?? "—"} de {inscritos ?? "—"}</dd></div>}
              </dl>
            </div>
            {(faltan.length > 0 || sugerencias.length > 0) && (
              <ul className="af-pendientes">
                {faltan.map((f) => <li key={f.texto} className="falta"><button type="button" onClick={() => crossfade(() => setPaso(f.paso))}><IconAlert size={12} /> {f.texto}</button></li>)}
                {sugerencias.map((f) => <li key={f.texto}><button type="button" onClick={() => crossfade(() => setPaso(f.paso))}>{f.texto}</button></li>)}
              </ul>
            )}
          </aside>
        </div>

      </form>
        {avisoGuardado && <div className="toast toast-good" role="status"><IconCheck size={13} /> Cambios guardados.</div>}
        {solicitar && <ModalSolicitar actividadId={actividad.id} onClose={() => setSolicitar(false)} onCreada={() => { setSolicitar(false); setSolicitudEnviada(true); }} />}
        {cerrar && (
          <CerrarActividadModal
            act={guardada}
            onClose={() => setCerrar(false)}
            onCerrada={() => {
              guardado.current = true;
              router.push(`${baseDe(actividad.linea)}/actividades/${actividad.id}?tab=calificaciones`);
              router.refresh();
            }}
          />
        )}
    </div>
  );
}

// Busca compras sin actividad (número, descripción, proveedor o área) para asociarlas.
function BuscadorCompras({ yaElegidas, onElegir }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const timer = useRef(null);
  const elegidas = useMemo(() => new Set(yaElegidas.map((c) => c.id)), [yaElegidas]);

  // Un error de conexión se dice como error (no como "no hay compras que coincidan").
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBuscando(true);
      setErrorBusqueda("");
      fetchComprasDisponiblesApi(q)
        .then((r) => setResultados(r.compras || []))
        .catch((e) => { setResultados([]); setErrorBusqueda(e.message && !/^Error \d/.test(e.message) ? e.message : "No se pudo buscar: el servidor no respondió. Intenta de nuevo en un momento."); })
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const disponibles = resultados.filter((c) => !elegidas.has(c.id));
  const pag = usePagina(disponibles, q, PAGE_SIZES_MODAL[0]);

  return (
    <div className="actividad-buscador">
      <label htmlFor="act-buscar-compra" className="actividad-buscador-label">Asociar una compra existente</label>
      <div className="actividad-buscador-input">
        <IconSearch size={13} />
        <input id="act-buscar-compra" type="search" placeholder="Busca por número, descripción, proveedor o área" value={q} onChange={(e) => setQ(e.target.value)} />
        {buscando && <span className="spinner" />}
      </div>
      <ul className="actividad-compras-list sin-tope">
        {errorBusqueda && <li className="modal-error" style={{ display: "block" }}>{errorBusqueda}</li>}
        {disponibles.length === 0 && !buscando && !errorBusqueda && <li className="count-note" style={{ display: "block" }}>No hay compras sin actividad que coincidan{q.trim() ? " (las que ya tienen actividad no aparecen)" : ""}.</li>}
        {pag.pagina.map((c) => (
          <li key={c.id}>
            <span className="mono">#{c.localSeq ?? "—"}</span>
            <span className="actividad-compra-desc">
              <span className="desc-tooltip-wrap">
                <span className="desc-text">{c.descripcion || "Sin descripción"}</span>
                <span className="desc-tooltip-bubble">{c.descripcion}</span>
              </span>
              <span className="count-note">{[c.fechaSolicitud, c.area, c.proveedor].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="actividad-compra-valor">{fmtCOP(c.valorConIva || 0)}</span>
            <button type="button" className="btn small actividad-btn-compras" onClick={() => onElegir(c)}>Asociar</button>
          </li>
        ))}
      </ul>
      {disponibles.length > 0 && <PiePagina id="af-disponibles-size" tamanos={PAGE_SIZES_MODAL} p={pag} total={disponibles.length} etiqueta="compra(s) sin actividad" />}
    </div>
  );
}
