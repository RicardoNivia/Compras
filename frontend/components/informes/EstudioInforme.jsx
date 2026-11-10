"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createReportApi, updateReportApi, previewEstudioApi, novaInformeApi } from "@/lib/api";
import { IconEye, IconCheck, IconAlert, IconEdit } from "@/components/icons";
import EditorDiseno from "@/components/informes/EditorDiseno";
import ProgramacionWizard from "@/components/informes/ProgramacionWizard";
import EdicionesPanel from "@/components/informes/EdicionesPanel";
import VistaPreviaPdf from "@/components/informes/VistaPreviaPdf";
import GenerandoNova from "@/components/informes/GenerandoNova";
import VistaConsulta from "@/components/informes/VistaConsulta";
import AccesoPanel from "@/components/informes/AccesoPanel";
import FotosPanel from "@/components/informes/FotosPanel";
import { informeBase, soloGuardable } from "@/components/informes/estudioUtils";
import { crossfade } from "@/lib/crossfade";

// Un informe del Estudio: crea el borrador (desde el pedido a Nova, una plantilla o en blanco), lo guarda solo a
// medida que se edita, mantiene el contenido calculado con los datos reales para el documento y reparte el trabajo
// en tres pestañas: Diseño (editor con Nova), Programación (cuándo, a quién y cómo) y Historial de envíos.

// Propósito del informe (contexto.proposito): "enviar" (programación, envíos, Mi día) o "consulta" (solo para verlo en
// la app, con los datos recalculados cada vez que se abre).
const TABS_ENVIAR = [{ id: "diseno", label: "Diseño" }, { id: "programacion", label: "Programación" }, { id: "ediciones", label: "Historial de envíos" }];
const TABS_CONSULTA = [{ id: "ver", label: "Ver informe" }, { id: "fotos", label: "Fotos guardadas" }, { id: "fotosAuto", label: "Fotos automáticas" }, { id: "diseno", label: "Diseño" }, { id: "acceso", label: "Acceso" }];
const esConsulta = (inf) => inf?.contexto?.proposito === "consulta";

// Título del informe: se muestra con un lápiz; al editarlo, el cambio solo se aplica con "Guardar" (o Enter).
function TituloEditable({ valor, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const inputRef = useRef(null);
  useEffect(() => { if (!editando) setTexto(valor); }, [valor, editando]);
  useEffect(() => { if (editando) inputRef.current?.select(); }, [editando]);

  function guardar() {
    const t = texto.trim();
    if (t && t !== valor) onGuardar(t);
    setEditando(false);
  }

  if (!editando) {
    return (
      <span className="est-titulo-ver">
        <span className="est-titulo-txt" title={valor}>{valor}</span>
        <button type="button" className="btn btn-ghost est-ghost est-lapiz" onClick={() => setEditando(true)} aria-label="Cambiar el nombre del informe" title="Cambiar el nombre">
          <IconEdit size={15} />
        </button>
      </span>
    );
  }
  return (
    <span className="est-titulo-edit">
      <label htmlFor="titulo-inf" style={{ position: "absolute", left: -9999 }}>Nombre del informe</label>
      <input
        id="titulo-inf" ref={inputRef} className="est-titulo" value={texto} maxLength={120}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") setEditando(false); }}
      />
      <button type="button" className="btn btn-primary small" onClick={guardar} disabled={!texto.trim()}><IconCheck size={12} /> Guardar</button>
      <button type="button" className="btn small" onClick={() => setEditando(false)}>Cancelar</button>
    </span>
  );
}

function normalizar(r) {
  const base = informeBase();
  return {
    ...base,
    ...r,
    tipo: "estudio",
    contexto: { ...base.contexto, ...(r.contexto || {}) },
    destinatarios: r.destinatarios || [],
    cc: r.cc || [],
    responsables: r.responsables || [],
    asunto: r.asunto || base.asunto,
    mensaje: r.mensaje || base.mensaje,
    frecuencia: r.frecuencia || base.frecuencia,
    hora: r.hora || base.hora,
    entrega: r.entrega === "correo" ? "correo" : "yo",
  };
}

export default function EstudioInforme({ initialReport, plantilla, pedido, nombre, proposito, initialTab }) {
  const router = useRouter();
  const [informe, setInforme] = useState(initialReport ? normalizar(initialReport) : null);
  const [servidor, setServidor] = useState(initialReport || null);
  const [errorCrear, setErrorCrear] = useState("");
  const tabsIniciales = esConsulta(initialReport) ? TABS_CONSULTA : TABS_ENVIAR;
  const [tab, setTab] = useState(tabsIniciales.some((t) => t.id === initialTab) ? initialTab : tabsIniciales[0].id);
  const [actualizadoAt, setActualizadoAt] = useState(null);
  const [refresco, setRefresco] = useState(0);
  const [content, setContent] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorVista, setErrorVista] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState("guardado"); // "guardado" | "pendiente" | "guardando" | "error"
  const [errorGuardado, setErrorGuardado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState(false);
  const [chat, setChat] = useState([]);
  const [entendido, setEntendido] = useState([]);
  const creado = useRef(false);
  const ultimoGuardado = useRef(initialReport ? JSON.stringify(soloGuardable(normalizar(initialReport))) : "");
  const reqVista = useRef(0);

  // ---- Creación (solo en /informes/nuevo) ----
  const crear = useCallback(async () => {
    setErrorCrear("");
    try {
      let datos;
      let entendidoNova = [];
      if (pedido) {
        const armado = await novaInformeApi("armar", { pedido });
        entendidoNova = armado.entendido || [];
        datos = informeBase({ nombre: armado.nombre, periodoGeneral: armado.periodoGeneral, contexto: armado.contexto, bloques: armado.bloques, pedido });
      } else if (plantilla) {
        datos = informeBase({ nombre: nombre || plantilla.nombre, periodoGeneral: plantilla.periodoGeneral, contexto: { ...plantilla.contexto, excluirAnulados: true }, bloques: plantilla.bloques });
      } else {
        datos = informeBase(nombre ? { nombre } : {});
      }
      datos.contexto = { ...datos.contexto, proposito: proposito === "consulta" ? "consulta" : "enviar" };
      // El nombre de una plantilla ya lo validó el usuario en el modal; los de Nova o en blanco se ajustan solos si se repiten.
      const nuevo = await createReportApi({ ...soloGuardable(datos), ajustarNombre: !nombre });
      if (entendidoNova.length) {
        try { sessionStorage.setItem(`estudio-entendido-${nuevo.id}`, JSON.stringify(entendidoNova)); } catch { /* sin sessionStorage solo no se muestran los chips */ }
      }
      router.replace(`/informes/${nuevo.id}${proposito === "consulta" ? "?tab=diseno" : ""}`);
    } catch (e) {
      setErrorCrear(e.message || "No se pudo crear el informe.");
    }
  }, [pedido, plantilla, nombre, proposito, router]);

  useEffect(() => {
    if (initialReport || creado.current) return;
    creado.current = true;
    crear();
  }, [initialReport, crear]);

  useEffect(() => {
    if (!informe?.id) return;
    try {
      const k = `estudio-entendido-${informe.id}`;
      const v = sessionStorage.getItem(k);
      if (v) { setEntendido(JSON.parse(v)); sessionStorage.removeItem(k); }
    } catch { /* sessionStorage no disponible */ }
  }, [informe?.id]);

  // ---- Contenido con los datos reales (lo que se dibuja en el documento) ----
  const claveVista = informe ? JSON.stringify([(informe.bloques || []).map(({ textoGuardado, ...b }) => b), informe.periodoGeneral, informe.contexto?.excluirAnulados, informe.nombre, refresco, informe.contexto?.proposito === "consulta" && tab !== "diseno" ? "sin-vista" : "vista"]) : "";
  useEffect(() => {
    if (!informe) return undefined;
    // Informes solo para consultar: la vista con IA solo se calcula en la pestaña Diseño (en "Ver informe" se usa la
    // vista sin IA, ver VistaConsulta.jsx).
    if (informe.contexto?.proposito === "consulta" && tab !== "diseno") return undefined;
    const id = ++reqVista.current;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await previewEstudioApi({ nombre: informe.nombre, bloques: informe.bloques, periodoGeneral: informe.periodoGeneral, contexto: informe.contexto });
        if (id !== reqVista.current) return;
        setContent(r.content);
        setActualizadoAt(new Date().toISOString());
        // Informes solo para consultar: el texto de Nova se guarda en cada bloque para que quienes lo ven lo abran y
        // lo actualicen SIN volver a llamar a la IA (las cifras, gráficas y tablas sí se recalculan siempre).
        if (informe.contexto?.proposito === "consulta") {
          const secs = r.content?.secciones || [];
          let cambio = false;
          const bloques = (informe.bloques || []).map((b, i) => {
            if (b.tipo !== "ia" || !secs[i]?.contenido || secs[i].contenido.startsWith("(")) return b;
            if (b.textoGuardado === secs[i].contenido) return b;
            cambio = true;
            return { ...b, textoGuardado: secs[i].contenido, destacadoGuardado: secs[i].destacado || null };
          });
          if (cambio) setInforme((x) => ({ ...x, bloques }));
        }
        setErrorVista("");
      } catch (e) {
        if (id === reqVista.current) setErrorVista(e.message || "No se pudo actualizar la vista.");
      } finally {
        if (id === reqVista.current) setCargando(false);
      }
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVista]);

  // ---- Guardado automático ----
  const guardarAhora = useCallback(async (extra = {}) => {
    const datos = { ...soloGuardable(informe), ...extra };
    setGuardando(true);
    setEstadoGuardado("guardando");
    try {
      const res = await updateReportApi(informe.id, datos);
      setServidor(res);
      setInforme((x) => ({ ...x, ...extra }));
      ultimoGuardado.current = JSON.stringify(soloGuardable({ ...informe, ...extra }));
      setEstadoGuardado("guardado");
      setErrorGuardado("");
      return res;
    } catch (e) {
      setEstadoGuardado("error");
      setErrorGuardado(e.message || "No se pudo guardar.");
      // Un nombre repetido se devuelve al último guardado para no quedar reintentando.
      if (/Ya existe un informe llamado/.test(e.message || "") && servidor?.nombre) setInforme((x) => ({ ...x, nombre: servidor.nombre }));
      throw e;
    } finally {
      setGuardando(false);
    }
  }, [informe, servidor]);

  useEffect(() => {
    if (!informe?.id) return undefined;
    const actual = JSON.stringify(soloGuardable(informe));
    if (actual === ultimoGuardado.current) return undefined;
    setEstadoGuardado("pendiente");
    const t = setTimeout(() => { guardarAhora().catch(() => {}); }, 1100);
    return () => clearTimeout(t);
  }, [informe, guardarAhora]);

  const onCambio = useCallback((patch) => setInforme((x) => ({ ...x, ...patch })), []);

  if (!informe) {
    return (
      <GenerandoNova
        pedido={pedido || (plantilla ? `Plantilla: ${plantilla.nombre}` : "Informe en blanco")}
        error={errorCrear}
        onReintentar={crear}
        onVolver={() => router.push("/informes")}
      />
    );
  }

  const consulta = esConsulta(informe);
  const TABS = consulta ? TABS_CONSULTA : TABS_ENVIAR;
  const estado = consulta ? (!informe.esBorrador && informe.activo ? { label: "Para consultar · fotos automáticas", cls: "ok" } : { label: "Para consultar", cls: "" }) : informe.esBorrador ? { label: "Borrador", cls: "off" } : informe.activo ? { label: "Activo", cls: "ok" } : { label: "En pausa", cls: "warn" };
  // Cambiar el propósito: a "consulta" deja de generarse (se desactiva); a "enviar" pasa a programación.
  function cambiarProposito(nuevo) {
    onCambio({ contexto: { ...informe.contexto, proposito: nuevo }, ...(nuevo === "consulta" ? { activo: false } : {}) });
    setTab(nuevo === "consulta" ? "ver" : "programacion");
  }
  const textoGuardado = estadoGuardado === "error" && errorGuardado ? errorGuardado : { guardado: "Guardado", pendiente: "Cambios sin guardar…", guardando: "Guardando…", error: "No se pudo guardar" }[estadoGuardado];

  return (
    <div className="est">
      <header className="est-head">
        <button type="button" className="btn btn-ghost est-ghost" onClick={() => router.push("/informes")} aria-label="Volver al Estudio">← Estudio</button>
        <TituloEditable valor={informe.nombre} onGuardar={(nombre) => onCambio({ nombre })} />
        <span className={`est-chip ${estado.cls}`}>{estado.label}</span>
        <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5, color: estadoGuardado === "error" ? "var(--critical)" : undefined }}>
          {estadoGuardado === "guardado" ? <IconCheck size={12} /> : estadoGuardado === "error" ? <IconAlert size={12} /> : <span className="spinner" style={{ width: 10, height: 10 }} />}
          {textoGuardado}
        </span>
        <div className="spacer" />
        <nav className="est-tabs" role="tablist" aria-label="Secciones del informe">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => crossfade(() => setTab(t.id))}>{t.label}</button>
          ))}
        </nav>
        <button type="button" className="btn" onClick={() => setVista(true)} disabled={!content}><IconEye size={14} /> Vista previa</button>
        {consulta ? (
          <button type="button" className="btn" onClick={() => cambiarProposito("enviar")} title="Pasar a un informe que se programa y se envía">Convertir en informe para enviar</button>
        ) : (
          <>
            {tab !== "programacion" && <button type="button" className="btn btn-primary" onClick={() => crossfade(() => setTab("programacion"))}>{informe.esBorrador ? "Programar envío" : "Programación"}</button>}
            {informe.esBorrador && <button type="button" className="btn btn-ghost est-ghost" onClick={() => cambiarProposito("consulta")} title="Dejarlo solo para verlo en la app">Usar solo para consultar</button>}
          </>
        )}
      </header>

      {tab === "ver" && consulta && (
        <VistaConsulta informe={informe} onContenido={setContent} onVistaPrevia={() => setVista(true)} onFotoGuardada={() => {}} onVerFotos={() => setTab("fotos")} />
      )}
      {tab === "diseno" && (
        <EditorDiseno
          informe={informe} onCambio={onCambio} content={content} cargando={cargando} errorVista={errorVista}
          chat={chat} setChat={setChat} entendido={entendido}
        />
      )}
      {tab === "fotos" && consulta && <FotosPanel reportId={informe.id} />}
      {tab === "fotosAuto" && consulta && (
        <ProgramacionWizard informe={informe} onCambio={onCambio} onGuardar={guardarAhora} onVistaPrevia={() => setVista(true)} guardando={guardando} modo="foto" onVerFotos={() => setTab("fotos")} />
      )}
      {tab === "acceso" && consulta && <AccesoPanel informe={{ ...informe, createdBy: servidor?.createdBy, createdByNombre: servidor?.createdByNombre }} onCambio={onCambio} />}
      {tab === "programacion" && !consulta && (
        <ProgramacionWizard informe={informe} onCambio={onCambio} onGuardar={guardarAhora} onVistaPrevia={() => setVista(true)} guardando={guardando} servidor={servidor} />
      )}
      {tab === "ediciones" && !consulta && <EdicionesPanel reportId={informe.id} puedeGenerar />}

      {vista && content && (
        <VistaPreviaPdf informe={informe} content={content} onClose={() => setVista(false)} onProgramar={() => { setVista(false); setTab("programacion"); }} />
      )}
    </div>
  );
}
