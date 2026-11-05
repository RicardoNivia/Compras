"use client";

import { useEffect, useRef, useState } from "react";
import { novaInformeApi } from "@/lib/api";
import { IconSpark, IconArrowRight, IconAlert } from "@/components/icons";
import DocumentoA4 from "@/components/informes/DocumentoA4";
import CifraDrawer from "@/components/informes/CifraDrawer";
import { AGRUPAR, METRICAS, PERIODOS, TIPOS_SECCION, bloqueNuevo, SECCIONES_LISTAS, SECCION_LISTA_POR_CLAVE } from "@/components/informes/estudioUtils";
import AlcanceInforme from "@/components/informes/AlcanceInforme";

// Editor del Estudio de informes: a la izquierda Nova (cambios en lenguaje natural sobre todo el informe o sobre la
// sección seleccionada), en el centro el documento tal como saldrá en el PDF y a la derecha la estructura (arrastrar
// para ordenar), las secciones para agregar a mano, las propiedades de la sección seleccionada y los datos del informe.

const SUGERENCIAS_GENERALES = ["Hazlo más corto", "Tono más formal", "Agrega el top 5 de proveedores", "Explica la variación frente al mes anterior"];
const SUGERENCIAS_SECCION = ["Hazla más corta", "Cámbiala a dona", "Explícala mejor", "Quita esta sección"];

function PropsSeccion({ b, onChange }) {
  if (!b) return null;
  const set = (patch) => onChange({ ...b, ...patch });
  return (
    <div className="est-props">
      <span className="est-eyebrow">Sección: {TIPOS_SECCION[b.tipo] || b.tipo}</span>
      <div className="field"><label htmlFor="p-titulo">Título</label><input id="p-titulo" value={b.titulo || ""} onChange={(e) => set({ titulo: e.target.value })} /></div>
      {b.tipo === "kpi" && (
        <>
          <div className="field"><label htmlFor="p-met">Cifra</label>
            <select id="p-met" value={b.metrica || "totalValorConIva"} onChange={(e) => set({ metrica: e.target.value })}>
              {Object.entries(METRICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="est-switch"><input type="checkbox" className="prov-switch" role="switch" checked={b.comparar !== false} onChange={(e) => set({ comparar: e.target.checked })} />Comparar con el período anterior</label>
        </>
      )}
      {(b.tipo === "grafico" || b.tipo === "tabla") && (
        <div className="field"><label htmlFor="p-agr">Agrupar por</label>
          <select id="p-agr" value={b.agruparPor || "area"} onChange={(e) => set({ agruparPor: e.target.value })}>
            {Object.entries(AGRUPAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
      {b.tipo === "grafico" && (
        <>
          <div className="field"><label htmlFor="p-mag">Mostrar</label>
            <select id="p-mag" value={b.metricaAgrupada || "valorConIva"} onChange={(e) => set({ metricaAgrupada: e.target.value })}>
              <option value="valorConIva">Valor comprado</option>
              <option value="cantidad">Cantidad de compras</option>
              <option value="valoracionProveedor">Valoración del proveedor (Nova)</option>
              <option value="valoracionCompra">Valoración de la compra (Nova)</option>
            </select>
          </div>
          {!["mes", "dia"].includes(b.agruparPor) && (
            <div className="field"><label htmlFor="p-ord">Orden del ranking</label>
              <select id="p-ord" value={b.orden || (String(b.metricaAgrupada || "").startsWith("valoracion") ? "menor" : "mayor")} onChange={(e) => set({ orden: e.target.value })}>
                <option value="mayor">De mayor a menor</option>
                <option value="menor">De menor a mayor</option>
              </select>
            </div>
          )}
          <div className="field"><label htmlFor="p-lim">Cuántos mostrar</label>
            <input id="p-lim" type="number" min="1" max="15" placeholder="Todos (hasta 8)" value={b.limite || ""} onChange={(e) => set({ limite: e.target.value ? Math.min(15, Math.max(1, Number(e.target.value))) : undefined })} />
          </div>
          <div className="field"><label htmlFor="p-est">Tipo de gráfica</label>
            <select id="p-est" value={b.estilo || "barras"} onChange={(e) => set({ estilo: e.target.value })}>
              <option value="barras">Barras horizontales (ranking)</option>
              <option value="columnas">Columnas (ideal por mes o día)</option>
              <option value="linea">Línea en el tiempo</option>
              <option value="apiladas">Columnas apiladas (tiempo × otro campo)</option>
              <option value="dona">Dona (participación)</option>
            </select>
          </div>
          {b.estilo === "apiladas" && (
            <div className="field"><label htmlFor="p-serie">Dividir cada columna por</label>
              <select id="p-serie" value={b.serie || "area"} onChange={(e) => set({ serie: e.target.value })}>
                {Object.entries(AGRUPAR).filter(([k]) => k !== "mes" && k !== "dia").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {!["mes", "dia"].includes(b.agruparPor) && <span className="muted" style={{ fontSize: 11.5 }}>Para apilar, agrupa por mes o por día.</span>}
            </div>
          )}
          {["columnas", "linea", "apiladas"].includes(b.estilo) && (
            <label className="est-switch"><input type="checkbox" className="prov-switch" role="switch" checked={b.promedio !== false} onChange={(e) => set({ promedio: e.target.checked })} />Línea de promedio</label>
          )}
        </>
      )}
      {(b.tipo === "grafico" || b.tipo === "tabla") && (
        <div className="field"><label htmlFor="p-ult">Solo los últimos días</label>
          <select id="p-ult" value={b.ultimosDias || ""} onChange={(e) => set({ ultimosDias: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Usar el período del informe</option>
            {[5, 7, 10, 15, 30, 60, 90].map((n) => <option key={n} value={n}>Últimos {n} días</option>)}
          </select>
        </div>
      )}
      {b.tipo === "ia" && (
        <div className="field"><label htmlFor="p-preg">Qué debe escribir Nova</label>
          <textarea id="p-preg" rows={4} value={b.pregunta || ""} onChange={(e) => set({ pregunta: e.target.value })} />
          <span className="muted" style={{ fontSize: 11.5 }}>Nova lo redacta en cada envío con las cifras exactas del período.</span>
        </div>
      )}
      {b.tipo === "texto" && (
        <div className="field"><label htmlFor="p-txt">Texto</label><textarea id="p-txt" rows={4} value={b.contenido || ""} onChange={(e) => set({ contenido: e.target.value })} /></div>
      )}
      {b.tipo === "proveedoresValoracion" && (
        <div className="field"><label htmlFor="p-umb">Mostrar proveedores con valoración de hasta</label>
          <select id="p-umb" value={b.umbral || 3} onChange={(e) => set({ umbral: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export default function EditorDiseno({ informe, onCambio, content, cargando, errorVista, chat, setChat, entendido }) {
  const [seleccion, setSeleccion] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [pensando, setPensando] = useState(false);
  const [cifra, setCifra] = useState(null);
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [masTipo, setMasTipo] = useState("");
  const composerRef = useRef(null);
  const chatRef = useRef(null);
  const bloques = informe.bloques || [];

  useEffect(() => { if (seleccion != null && seleccion >= bloques.length) setSeleccion(null); }, [bloques.length, seleccion]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [chat.length, pensando]);

  function setBloques(nuevos, extra = {}) {
    onCambio({ bloques: nuevos, ...extra });
  }

  function accion(tipo) {
    const i = seleccion;
    if (i == null) return;
    const bs = [...bloques];
    if (tipo === "nova") { composerRef.current?.focus(); return; }
    if (tipo === "tipo") {
      const b = bs[i];
      bs[i] = { ...b, estilo: b.estilo === "dona" || (b.tipo === "cicloProveedores" && b.estilo !== "barras") ? "barras" : "dona" };
    }
    if (tipo === "subir" && i > 0) { [bs[i - 1], bs[i]] = [bs[i], bs[i - 1]]; setSeleccion(i - 1); }
    if (tipo === "bajar" && i < bs.length - 1) { [bs[i + 1], bs[i]] = [bs[i], bs[i + 1]]; setSeleccion(i + 1); }
    if (tipo === "duplicar") { bs.splice(i + 1, 0, { ...bs[i] }); setSeleccion(i + 1); }
    if (tipo === "eliminar") { bs.splice(i, 1); setSeleccion(null); }
    setBloques(bs);
  }

  // tipo: una sección vacía ("texto", "kpi"…) o la clave de una sección lista del catálogo (SECCIONES_LISTAS).
  function agregar(tipo) {
    if (!tipo) return;
    const nuevos = SECCION_LISTA_POR_CLAVE[tipo] ? SECCION_LISTA_POR_CLAVE[tipo].bloques.map((b) => ({ ...b })) : [bloqueNuevo(tipo)];
    const bs = [...bloques];
    const pos = seleccion != null ? seleccion + 1 : bs.length;
    bs.splice(pos, 0, ...nuevos);
    setBloques(bs);
    setSeleccion(pos);
    setMasTipo("");
  }

  function soltar(destino) {
    if (arrastrando == null || arrastrando === destino) { setArrastrando(null); setSobre(null); return; }
    const bs = [...bloques];
    const [movido] = bs.splice(arrastrando, 1);
    bs.splice(destino, 0, movido);
    setBloques(bs);
    setSeleccion(destino);
    setArrastrando(null);
    setSobre(null);
  }

  // Órdenes cortas y claras sobre la sección seleccionada se aplican al instante, sin llamar a la IA.
  function atajo(instruccion) {
    const t = instruccion.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const i = seleccion;
    if (i == null || !bloques[i] || t.length > 45) return null;
    const b = bloques[i];
    const esGrafica = b.tipo === "grafico" || b.tipo === "cicloProveedores";
    const bs = [...bloques];
    if (/\b(quita|quitala|elimina|eliminala|borra|borrala)\b/.test(t)) { bs.splice(i, 1); setSeleccion(null); return { bs, texto: `Quité la sección «${b.titulo}».` }; }
    if (/\b(duplica|duplicala|copia)\b/.test(t)) { bs.splice(i + 1, 0, { ...b }); setSeleccion(i + 1); return { bs, texto: `Dupliqué «${b.titulo}».` }; }
    if (/\b(sube|subela|arriba)\b/.test(t) && i > 0) { [bs[i - 1], bs[i]] = [bs[i], bs[i - 1]]; setSeleccion(i - 1); return { bs, texto: `Subí «${b.titulo}».` }; }
    if (/\b(baja|bajala|abajo)\b/.test(t) && i < bs.length - 1) { [bs[i + 1], bs[i]] = [bs[i], bs[i + 1]]; setSeleccion(i + 1); return { bs, texto: `Bajé «${b.titulo}».` }; }
    if (esGrafica) {
      const estilos = [[/\b(dona|torta|pastel|pie)\b/, "dona"], [/\bcolumnas?\b/, "columnas"], [/\blineas?\b/, "linea"], [/\bbarras?\b/, "barras"]];
      for (const [re, estilo] of estilos) {
        if (re.test(t) && !(estilo === "dona" && b.estilo === "apiladas")) {
          bs[i] = { ...b, estilo };
          if (estilo !== "apiladas") delete bs[i].serie;
          return { bs, texto: `Listo: «${b.titulo}» ahora es una gráfica de ${{ dona: "dona", columnas: "columnas", linea: "línea", barras: "barras" }[estilo]}.` };
        }
      }
    }
    return null;
  }

  async function enviarANova(texto) {
    const instruccion = (texto ?? mensaje).trim();
    if (!instruccion || pensando) return;
    const rapido = atajo(instruccion);
    if (rapido) {
      const previoRapido = { bloques, nombre: informe.nombre, periodoGeneral: informe.periodoGeneral };
      setChat((c) => [...c, { rol: "usuario", texto: instruccion, seccion: bloques[seleccion]?.titulo }, { rol: "nova", texto: rapido.texto, deshacer: previoRapido }]);
      setMensaje("");
      setBloques(rapido.bs);
      return;
    }
    const previo = { bloques, nombre: informe.nombre, periodoGeneral: informe.periodoGeneral, contexto: informe.contexto };
    const sel = seleccion;
    setChat((c) => [...c, { rol: "usuario", texto: instruccion, seccion: sel != null ? bloques[sel]?.titulo : null }]);
    setMensaje("");
    setPensando(true);
    try {
      const res = await novaInformeApi("editar", {
        nombre: informe.nombre, periodoGeneral: informe.periodoGeneral, contexto: informe.contexto, bloques, seleccion: sel, instruccion,
        historial: chat.slice(-6).map((m) => ({ rol: m.rol, texto: m.texto })),
      });
      const extra = {};
      if (res.nombre) extra.nombre = res.nombre;
      if (res.periodoGeneral) extra.periodoGeneral = res.periodoGeneral;
      // Nova cambió el alcance (filtro por categoría o área) porque el pedido lo pedía.
      if ("filtros" in res) extra.contexto = { ...informe.contexto, filtros: res.filtros || null };
      const cambio = JSON.stringify(res.bloques) !== JSON.stringify(bloques) || Object.keys(extra).length > 0;
      if (cambio) setBloques(res.bloques, extra);
      setChat((c) => [...c, { rol: "nova", texto: res.respuesta, deshacer: cambio ? previo : null }]);
    } catch (e) {
      setChat((c) => [...c, { rol: "nova", texto: e.message || "No pude hacer el cambio. Intenta de nuevo.", error: true }]);
    } finally {
      setPensando(false);
    }
  }

  function deshacer(idx) {
    const m = chat[idx];
    if (!m?.deshacer) return;
    onCambio({ bloques: m.deshacer.bloques, nombre: m.deshacer.nombre, periodoGeneral: m.deshacer.periodoGeneral, ...(m.deshacer.contexto ? { contexto: m.deshacer.contexto } : {}) });
    setChat((c) => c.map((x, i) => (i === idx ? { ...x, deshacer: null, deshecho: true } : x)));
  }

  const sugerencias = seleccion != null ? SUGERENCIAS_SECCION : SUGERENCIAS_GENERALES;

  return (
    <div className="est-editor">
      {/* Nova */}
      <section className="est-nova" aria-label="Nova">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="est-nova-ic"><IconSpark size={16} /></span>
          <div><strong style={{ fontFamily: "Nunito, sans-serif", fontSize: 15 }}>Nova</strong><br /><span className="muted" style={{ fontSize: 12 }}>Edita el informe conversando</span></div>
        </div>
        <div className="est-chat" ref={chatRef} aria-live="polite">
          {entendido?.length > 0 && (
            <div className="est-msg-n" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>Esto es lo que entendí</strong>
              <div className="est-chips">{entendido.map((t) => <span key={t} className="est-chip">{t}</span>)}</div>
              <span className="muted" style={{ fontSize: 12 }}>Selecciona cualquier sección del documento y dime qué cambiar.</span>
            </div>
          )}
          {!entendido?.length && chat.length === 0 && (
            <div className="est-msg-n">Selecciona una sección del documento y dime qué cambiar, o pídeme un cambio para todo el informe. Las cifras las calcula el sistema; yo solo cambio la estructura y los textos.</div>
          )}
          {chat.map((m, i) => (m.rol === "usuario" ? (
            <div key={i} className="est-msg-u">{m.seccion ? <span style={{ opacity: .8, fontSize: 11.5, display: "block" }}>Sobre «{m.seccion}»</span> : null}{m.texto}</div>
          ) : (
            <div key={i} className="est-msg-n" style={m.error ? { borderColor: "var(--critical)" } : undefined}>
              {m.texto}
              {m.deshacer && <div style={{ marginTop: 8 }}><button type="button" className="btn small" onClick={() => deshacer(i)}>Deshacer</button></div>}
              {m.deshecho && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Cambio deshecho.</div>}
            </div>
          )))}
          {pensando && <div className="est-msg-n" style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="spinner" /> Nova está ajustando el informe…</div>}
        </div>
        <div className="est-sug">
          {sugerencias.map((t) => <button key={t} type="button" className="btn" disabled={pensando} onClick={() => enviarANova(t)}>{t}</button>)}
        </div>
        {seleccion != null && bloques[seleccion] && (
          <span className="est-chip" style={{ alignSelf: "flex-start" }}>
            Editando: {bloques[seleccion].titulo || TIPOS_SECCION[bloques[seleccion].tipo]}
            <button type="button" aria-label="Quitar selección" onClick={() => setSeleccion(null)}>✕</button>
          </span>
        )}
        <form className="est-composer small" onSubmit={(e) => { e.preventDefault(); enviarANova(); }}>
          <label htmlFor="msg-nova" style={{ position: "absolute", left: -9999 }}>Mensaje para Nova</label>
          <textarea
            id="msg-nova" ref={composerRef} rows={2} value={mensaje} placeholder="Dile a Nova qué cambiar…"
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarANova(); } }}
          />
          <button type="submit" className="btn btn-primary" aria-label="Enviar a Nova" disabled={pensando || !mensaje.trim()} style={{ padding: "8px 10px" }}><IconArrowRight size={14} /></button>
        </form>
      </section>

      {/* Documento */}
      <section className="est-desk" aria-label="Documento" onClick={() => setSeleccion(null)}>
        {(cargando || errorVista) && (
          <span className="est-doc-estado" onClick={(e) => e.stopPropagation()}>
            {cargando ? <><span className="spinner" /> Actualizando con los datos reales…</> : <><IconAlert size={13} /> {errorVista}</>}
          </span>
        )}
        <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
          <DocumentoA4
            informe={informe} content={content} cargando={cargando}
            seleccion={seleccion} onSeleccion={setSeleccion} onAccion={accion}
            onCifra={(p) => setCifra({ ...p, periodo: informe.periodoGeneral, excluirAnulados: informe.contexto?.excluirAnulados !== false, filtros: informe.contexto?.filtros || null })}
          />
        </div>
      </section>

      {/* Estructura */}
      <aside className="est-rail" aria-label="Estructura y datos">
        {/* Tarjeta 1: el orden de las secciones */}
        <section className="est-rail-card" aria-label="Secciones del informe">
          <span className="est-eyebrow">Secciones · arrastra para ordenar</span>
          <ol className="est-outline">
            {bloques.map((b, i) => (
              <li
                key={i}
                className={`${seleccion === i ? "on" : ""}${arrastrando === i ? " drag" : ""}${sobre === i && arrastrando !== i ? " over" : ""}`}
                draggable
                onDragStart={() => setArrastrando(i)}
                onDragOver={(e) => { e.preventDefault(); setSobre(i); }}
                onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                onDrop={(e) => { e.preventDefault(); soltar(i); }}
                onClick={() => setSeleccion(i)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSeleccion(i); } }}
              >
                <span className="grip" aria-hidden="true">⋮⋮</span>
                <span className="truncate" style={{ maxWidth: 260 }}>{b.titulo || TIPOS_SECCION[b.tipo]}</span>
                <span className="tipo">{TIPOS_SECCION[b.tipo] || b.tipo}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Tarjeta 2: agregar secciones, propiedades de la seleccionada y datos del informe */}
        <section className="est-rail-card" aria-label="Agregar y configurar">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="est-eyebrow">Agregar sección{seleccion != null ? " debajo de la seleccionada" : ""}</span>
          <div className="est-add">
            <button type="button" className="btn" onClick={() => agregar("texto")}>Texto</button>
            <button type="button" className="btn" onClick={() => agregar("kpi")}>Cifra clave</button>
            <button type="button" className="btn" onClick={() => agregar("grafico")}>Gráfica</button>
            <button type="button" className="btn" onClick={() => agregar("tabla")}>Tabla</button>
            <button type="button" className="btn btn-nova" style={{ gridColumn: "span 2" }} onClick={() => agregar("ia")}><IconSpark size={13} /> Análisis de Nova</button>
          </div>
          <select value={masTipo} onChange={(e) => agregar(e.target.value)} aria-label="Más secciones">
            <option value="">Secciones listas (como el Dashboard)…</option>
            {SECCIONES_LISTAS.map((g) => (
              <optgroup key={g.grupo} label={g.grupo}>
                {g.items.map((it) => <option key={it.clave} value={it.clave}>{it.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {seleccion != null && bloques[seleccion] && (
          <PropsSeccion b={bloques[seleccion]} onChange={(nb) => setBloques(bloques.map((x, i) => (i === seleccion ? nb : x)))} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="est-eyebrow">Datos del informe</span>
          <div className="field"><label htmlFor="d-per">Período</label>
            <select id="d-per" value={informe.periodoGeneral} onChange={(e) => onCambio({ periodoGeneral: e.target.value })}>
              {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="d-aud">Para quién es</label>
            <input id="d-aud" placeholder="Ej. Gerencia" value={informe.contexto?.audiencia || ""} onChange={(e) => onCambio({ contexto: { ...informe.contexto, audiencia: e.target.value || null } })} />
          </div>
          <AlcanceInforme filtros={informe.contexto?.filtros} onChange={(f) => onCambio({ contexto: { ...informe.contexto, filtros: f } })} />
          <label className="est-switch">
            <input type="checkbox" className="prov-switch" role="switch" checked={informe.contexto?.excluirAnulados !== false} onChange={(e) => onCambio({ contexto: { ...informe.contexto, excluirAnulados: e.target.checked } })} />
            Excluir compras anuladas
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>{PERIODOS.find((p) => p.value === informe.periodoGeneral)?.ayuda} Se recalcula en cada envío.</p>
        </div>
        </section>
      </aside>

      {cifra && <CifraDrawer params={cifra} onClose={() => setCifra(null)} />}
    </div>
  );
}
