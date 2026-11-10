"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconKey, IconPlus, IconCopy, IconCheck, IconBell, IconTable, IconBuilding, IconMoney,
  IconHistory, IconFile, IconSearch, IconAlert, IconClock, IconEye, IconInfo,
} from "@/components/icons";

const PAGE_SIZES = [10, 25, 50, 100];
const MAX_ACTIVOS = 5; // mismo tope que backend/lib/mcpTokens.js
const VIGENCIAS = [
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días", hint: "Recomendado" },
  { dias: 180, label: "6 meses" },
  { dias: 365, label: "1 año" },
];
const ESTADOS = { activo: { label: "Activo", cls: "good" }, expirado: { label: "Vencido", cls: "muted" }, revocado: { label: "Revocado", cls: "critical" } };

// Qué puede preguntar la persona; "feature" ata la tarjeta a la Matriz de permisos (igual que las herramientas del backend).
const CAPACIDADES = [
  { clave: "pendientes", Icon: IconBell, titulo: "Mi día", detalle: "Lo que te toca hoy según tu rol, por urgencia.", ejemplo: "¿Qué tengo pendiente hoy?", feature: null },
  { clave: "compras", Icon: IconTable, titulo: "Compras", detalle: "Totales exactos, búsquedas y valoraciones de Nova.", ejemplo: "¿Cuánto se compró en Mercadeo este año?", feature: null },
  { clave: "proveedores", Icon: IconBuilding, titulo: "Proveedores", detalle: "Fichas, ciclo de actualización y checklist.", ejemplo: "¿Qué proveedores críticos siguen desactualizados?", feature: "viewProveedores" },
  { clave: "presupuesto", Icon: IconMoney, titulo: "Presupuesto", detalle: "Presupuestado vs. gastado por área.", ejemplo: "¿Qué áreas superaron su presupuesto?", feature: "viewPresupuesto" },
  { clave: "auditoria", Icon: IconHistory, titulo: "Auditoría", detalle: "Quién hizo qué y cuándo.", ejemplo: "¿Qué cambios hizo Carolina esta semana?", feature: "viewAuditoria" },
  { clave: "guia", Icon: IconFile, titulo: "Procedimiento y guía", detalle: "Reglas de compras y uso de la aplicación.", ejemplo: "¿Qué documentos pide el procedimiento para radicar?", feature: null },
];

// ---------- utilidades ----------

function fmtFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function hace(iso) {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "ayer" : d < 30 ? `hace ${d} días` : fmtFecha(iso);
}

function diasPara(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

async function api(url, options) {
  const res = await fetch(url, { cache: "no-store", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function comandoClaudeCode(url, token) {
  return `claude mcp add --transport http --scope user panel-compras ${url} --header "Authorization: Bearer ${token}"`;
}

function configDesktop(url, token) {
  return JSON.stringify(
    { mcpServers: { "panel-compras": { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${PANEL_AUTH}"], env: { PANEL_AUTH: `Bearer ${token}` } } } },
    null,
    2
  );
}

// ---------- piezas ----------

function BotonCopiar({ texto, etiqueta = "Copiar", className = "" }) {
  const [ok, setOk] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {
      // el navegador bloqueó el portapapeles: la persona puede seleccionar el texto a mano
    }
  }
  return (
    <button type="button" className={`btn small mcp-copy ${ok ? "ok" : ""} ${className}`} onClick={copiar} aria-live="polite">
      {ok ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {ok ? "Copiado" : etiqueta}
    </button>
  );
}

// El botón de copiar vive en su propia barra, fuera del área con scroll, para no taparle la barra de desplazamiento.
function Codigo({ texto, copiable = texto, etiqueta, caption }) {
  return (
    <div className="mcp-code">
      <div className="mcp-code-bar">
        <span>{caption}</span>
        <BotonCopiar texto={copiable} etiqueta={etiqueta} />
      </div>
      <pre tabIndex={0}>{texto}</pre>
    </div>
  );
}

function PestanasCliente({ valor, onChange }) {
  return (
    <div className="dash-tabs mcp-tabs" role="tablist" aria-label="Cliente de Claude">
      {[["code", "Claude Code"], ["desktop", "Claude Desktop"]].map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={valor === k} className="dash-tab" onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

function Hero({ activos, usos, ultimoUso, onCrear, llenos }) {
  return (
    <header className="mcp-hero">
      <div className="mcp-hero-txt">
        <small>Integración · solo lectura · solo administradores</small>
        <h1>Lleva el panel a tu Claude</h1>
        <p>Pregunta por tus pendientes, compras, proveedores y presupuesto en lenguaje natural. El consumo de IA va a tu cuenta de Claude y cada consulta respeta tus permisos.</p>
      </div>
      <div className="mcp-hero-side">
        <dl className="mcp-stats">
          <div>
            <dt>Tokens activos</dt>
            <dd>{activos}<span> / {MAX_ACTIVOS}</span></dd>
            <i className="mcp-meter" aria-hidden="true"><b style={{ width: `${(activos / MAX_ACTIVOS) * 100}%` }} /></i>
          </div>
          <div>
            <dt>Consultas hechas</dt>
            <dd>{usos.toLocaleString("es-CO")}</dd>
          </div>
          <div>
            <dt>Último uso</dt>
            <dd className="sm">{ultimoUso ? hace(ultimoUso) : "Nunca"}</dd>
          </div>
        </dl>
        <button type="button" className="btn btn-primary mcp-cta" onClick={onCrear} disabled={llenos} title={llenos ? `Ya tienes ${MAX_ACTIVOS} tokens activos: revoca uno para crear otro.` : undefined}>
          <IconPlus size={15} /> Crear token
        </button>
      </div>
    </header>
  );
}

function Guia({ mcpUrl }) {
  const [cliente, setCliente] = useState("code");
  const pasos = [
    { n: 1, t: "Crea tu token", d: "Es una llave personal y secreta. Se muestra una sola vez." },
    { n: 2, t: "Conéctalo a tu Claude", d: "Copia el comando o la configuración de tu cliente." },
    { n: 3, t: "Pregunta", d: "Claude pedirá permiso la primera vez que use una herramienta del panel." },
  ];
  return (
    <section className="mcp-card" aria-labelledby="mcp-guia-t">
      <div className="mcp-card-head">
        <h2 id="mcp-guia-t">Cómo conectarlo</h2>
        <PestanasCliente valor={cliente} onChange={setCliente} />
      </div>
      <ol className="mcp-pasos">
        {pasos.map((p) => (
          <li key={p.n}><span className="mcp-paso-n">{p.n}</span><div><strong>{p.t}</strong><p>{p.d}</p></div></li>
        ))}
      </ol>
      {cliente === "code" ? (
        <>
          <Codigo caption="Terminal" texto={comandoClaudeCode(mcpUrl, "<tu-token>")} />
          <p className="mcp-nota">Ejecútalo una vez en una terminal; queda para todos tus proyectos. Verifica con <code>claude mcp list</code> o escribiendo <code>/mcp</code> en una sesión.</p>
        </>
      ) : (
        <>
          <Codigo caption="claude_desktop_config.json" texto={configDesktop(mcpUrl, "<tu-token>")} />
          <p className="mcp-nota">Pégalo en <b>Configuración → Desarrollador → Editar configuración</b> y reinicia Claude Desktop por completo. Requiere Node.js. Debe aparecer <b>panel-compras</b> como <i>running</i>.</p>
        </>
      )}
      <p className="mcp-nota sutil"><IconInfo size={14} /> Claude en el navegador (claude.ai) todavía no admite este tipo de token.</p>
    </section>
  );
}

function Capacidades({ user }) {
  return (
    <section className="mcp-card" aria-labelledby="mcp-cap-t">
      <div className="mcp-card-head">
        <h2 id="mcp-cap-t">Qué podrás preguntar</h2>
        <span className="mcp-chip"><IconEye size={13} /> Solo lectura</span>
      </div>
      <ul className="mcp-caps">
        {CAPACIDADES.map((c) => {
          const permitido = c.feature ? (user.permissions?.[c.feature] ?? user.role === "admin") : true;
          return (
            <li key={c.clave} className={permitido ? "" : "off"}>
              <span className="mcp-cap-ic"><c.Icon size={17} /></span>
              <div>
                <strong>{c.titulo}{!permitido && <em> · sin permiso en tu rol</em>}</strong>
                <p>{c.detalle}</p>
                {permitido && <q>{c.ejemplo}</q>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Seguridad() {
  const items = [
    ["Secreto como una contraseña", "Solo guardamos una huella del token; si lo pierdes, se revoca y se crea otro."],
    ["Todo queda auditado", "Cada consulta que Claude hace a tu nombre aparece en Auditoría."],
    ["Revocable al instante", "Un token revocado, vencido o de un usuario desactivado deja de funcionar de inmediato."],
  ];
  return (
    <ul className="mcp-seguridad" aria-label="Seguridad">
      {items.map(([t, d]) => (<li key={t}><strong>{t}</strong><span>{d}</span></li>))}
    </ul>
  );
}

function Vence({ t }) {
  if (t.estado !== "activo") return <span className="mcp-sub">{fmtFecha(t.expiraAt)}</span>;
  const d = diasPara(t.expiraAt);
  const pronto = d != null && d <= 14;
  return (
    <span className={pronto ? "mcp-vence pronto" : ""}>
      {fmtFecha(t.expiraAt)}
      {d != null && <span className="mcp-sub">{pronto ? <><IconClock size={11} /> en {d} {d === 1 ? "día" : "días"}</> : `en ${d} días`}</span>}
    </span>
  );
}

function Estado({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.expirado;
  return <span className={`pill ${e.cls}`}>{e.label}</span>;
}

// ---------- modal de creación (2 pasos: datos → token creado) ----------

function CrearTokenModal({ mcpUrl, onClose, onCreated }) {
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState(90);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [creado, setCreado] = useState(null);
  const [cliente, setCliente] = useState("code");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !creado) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creado, onClose]);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setError("");
    setSaving(true);
    try {
      const { token } = await api("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, diasVigencia: dias }) });
      setCreado(token);
      onCreated(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !creado) onClose(); }}>
      <div className="modal mcp-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-modal-t">
        <div className="modal-head">
          <h3 id="mcp-modal-t">{creado ? "Tu token está listo" : "Crear token personal"}</h3>
          {!creado && <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>}
        </div>

        {creado ? (
          <>
            <div className="mcp-modal-body">
              <div className="mcp-aviso" role="alert">
                <IconAlert size={16} />
                <span><b>Cópialo ahora.</b> Por seguridad no se vuelve a mostrar. Si lo pierdes, revócalo y crea otro.</span>
              </div>
              <label className="mcp-label">Token</label>
              <Codigo caption="Token" texto={creado.token} etiqueta="Copiar token" />
              <div className="mcp-sep" />
              <div className="mcp-card-head tight">
                <label className="mcp-label">Conéctalo a</label>
                <PestanasCliente valor={cliente} onChange={setCliente} />
              </div>
              {cliente === "code" ? (
                <Codigo caption="Terminal" texto={comandoClaudeCode(mcpUrl, creado.token)} etiqueta="Copiar comando" />
              ) : (
                <Codigo caption="claude_desktop_config.json" texto={configDesktop(mcpUrl, creado.token)} etiqueta="Copiar configuración" />
              )}
              <p className="mcp-nota">{cliente === "code" ? "Pégalo en una terminal y listo." : "Agrégalo a claude_desktop_config.json y reinicia Claude Desktop (requiere Node.js)."}</p>
            </div>
            <div className="modal-foot">
              <span className="mcp-sub">Vence el {fmtFecha(creado.expiraAt)}</span>
              <div className="spacer" />
              <button type="button" className="btn btn-primary" onClick={onClose}>Ya lo guardé</button>
            </div>
          </>
        ) : (
          <form onSubmit={crear}>
            <div className="mcp-modal-body">
              <div className="field">
                <label htmlFor="tk-nombre">Nombre del token</label>
                <input id="tk-nombre" value={nombre} maxLength={80} placeholder="Ej.: Claude Desktop del portátil" onChange={(e) => setNombre(e.target.value)} autoFocus autoComplete="off" />
                <span className="mcp-sub">Te ayuda a reconocer dónde lo usas y a revocar el correcto.</span>
              </div>
              <div className="field">
                <label id="tk-vig-l">Vigencia</label>
                <div className="mcp-seg" role="radiogroup" aria-labelledby="tk-vig-l">
                  {VIGENCIAS.map((v) => (
                    <button key={v.dias} type="button" role="radio" aria-checked={dias === v.dias} className={dias === v.dias ? "on" : ""} onClick={() => setDias(v.dias)}>
                      <span>{v.label}</span>
                      {v.hint && <small>{v.hint}</small>}
                    </button>
                  ))}
                </div>
                <span className="mcp-sub">Después de ese plazo el token deja de funcionar y creas uno nuevo.</span>
              </div>
              {error && <p className="mcp-error" role="alert">{error}</p>}
            </div>
            <div className="modal-foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !nombre.trim()}>{saving ? <span className="spinner" /> : "Crear token"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- vista ----------

export default function ConectarClaudeView({ initialTokens, user }) {
  const esAdmin = user.role === "admin";
  const [tokens, setTokens] = useState(initialTokens || []);
  const [todos, setTodos] = useState(false);
  const [modal, setModal] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("activo"); // activo | todos
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [mcpUrl, setMcpUrl] = useState("/api/mcp");

  useEffect(() => { setMcpUrl(`${window.location.origin}/api/mcp`); }, []);

  const propios = useMemo(() => tokens.filter((t) => t.userId === user.id), [tokens, user.id]);
  const activos = propios.filter((t) => t.estado === "activo").length;
  const usos = propios.reduce((s, t) => s + (t.usos || 0), 0);
  const ultimoUso = propios.map((t) => t.ultimoUsoAt).filter(Boolean).sort().pop() || null;

  async function recargar(verTodos) {
    try {
      setTokens((await api(`/api/tokens${verTodos ? "?todos=1" : ""}`)).tokens);
    } catch (err) {
      setError(err.message);
    }
  }

  function cambiarTodos(v) {
    setTodos(v);
    setPage(1);
    recargar(v);
  }

  async function revocar(id) {
    setBusyId(id);
    setError("");
    try {
      const { token } = await api(`/api/tokens/${id}`, { method: "DELETE" });
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...token, dueno: t.dueno } : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tokens.filter((t) => {
      if (filtro === "activo" && t.estado !== "activo") return false;
      if (needle && !`${t.nombre} ${t.dueno?.nombre || ""} ${t.prefijo}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tokens, filtro, q]);

  useEffect(() => { setPage(1); }, [filtro, q, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibles = useMemo(() => filtrados.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtrados, currentPage, pageSize]);

  const tabla = (
    <section className="mcp-card flush" aria-labelledby="mcp-tok-t">
      <div className="mcp-card-head pad">
        <div>
          <h2 id="mcp-tok-t">{todos ? "Tokens de todos los usuarios" : "Mis tokens"}</h2>
          <span className="mcp-sub">{activos} de {MAX_ACTIVOS} tokens activos propios</span>
        </div>
        <div className="mcp-tools">
          <div className="dash-tabs" role="tablist" aria-label="Filtrar por estado">
            <button type="button" role="tab" aria-selected={filtro === "activo"} className="dash-tab" onClick={() => setFiltro("activo")}>Activos</button>
            <button type="button" role="tab" aria-selected={filtro === "todos"} className="dash-tab" onClick={() => setFiltro("todos")}>Todos</button>
          </div>
          <div className="mcp-search">
            <IconSearch size={14} />
            <input type="search" placeholder="Buscar…" aria-label="Buscar tokens" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {esAdmin && (
            <label className="est-switch" style={{ marginLeft: 4 }}>
              <span>Ver todos los usuarios</span>
              <input type="checkbox" role="switch" checked={todos} onChange={(e) => cambiarTodos(e.target.checked)} />
            </label>
          )}
        </div>
      </div>

      {error && <p className="mcp-error pad" role="alert">{error}</p>}

      {filtrados.length === 0 ? (
        <div className="mcp-vacio">
          <span className="mcp-vacio-ic"><IconKey size={22} /></span>
          <strong>{tokens.length === 0 ? "Aún no tienes tokens" : "Nada con ese filtro"}</strong>
          <p>{tokens.length === 0 ? "Crea tu primer token para conectar tu Claude al panel." : "Prueba con “Todos” o cambia la búsqueda."}</p>
          {tokens.length === 0 && <button type="button" className="btn btn-primary" onClick={() => setModal(true)}><IconPlus size={14} /> Crear token</button>}
        </div>
      ) : (
        <div className="mcp-tabla-wrap">
          <table className="audit-log mcp-tabla">
            <thead>
              <tr>
                <th className="mcp-col-token">Token</th>
                {todos && <th>Usuario</th>}
                <th>Estado</th>
                <th>Último uso</th>
                <th className="num">Consultas</th>
                <th>Vence</th>
                <th>Creado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr key={t.id} className={t.estado !== "activo" ? "inactivo" : ""}>
                  <td className="mcp-col-token">
                    <div className="mcp-tok">
                      <span className="mcp-tok-ic"><IconKey size={15} /></span>
                      <div>
                        <span className="desc-tooltip-wrap">
                          <span className="desc-text mcp-tok-n">{t.nombre}</span>
                          <span className="desc-tooltip-bubble">{t.nombre}</span>
                        </span>
                        <code className="mcp-pref">{t.prefijo}••••••••</code>
                      </div>
                    </div>
                  </td>
                  {todos && <td>{t.dueno?.nombre || "—"}</td>}
                  <td><Estado estado={t.estado} /></td>
                  <td>{t.ultimoUsoAt ? hace(t.ultimoUsoAt) : <span className="mcp-sub">Sin usar</span>}</td>
                  <td className="num">{(t.usos || 0).toLocaleString("es-CO")}</td>
                  <td><Vence t={t} /></td>
                  <td>{fmtFecha(t.createdAt)}</td>
                  <td className="mcp-acc">
                    {t.estado === "activo" && (confirmId === t.id ? (
                      <span className="confirm-del">
                        <span>¿Revocar?</span>
                        <button type="button" className="btn btn-danger-solid small" disabled={busyId === t.id} onClick={() => revocar(t.id)}>{busyId === t.id ? <span className="spinner" /> : "Sí"}</button>
                        <button type="button" className="btn small" onClick={() => setConfirmId(null)}>No</button>
                      </span>
                    ) : (
                      <button type="button" className="btn small mcp-revocar" onClick={() => setConfirmId(t.id)}>Revocar</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <label htmlFor="tk-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
          <select id="tk-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="page-btns">
          <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
        <span className="count-note">Página {currentPage} de {totalPages}</span>
        <div className="spacer" />
        <span className="count-note">{filtrados.length} token(s) (de {tokens.length})</span>
      </div>
    </section>
  );

  return (
    <div className="mcp-page">
      <Hero activos={activos} usos={usos} ultimoUso={ultimoUso} onCrear={() => setModal(true)} llenos={activos >= MAX_ACTIVOS} />

      {/* La tabla de tokens va siempre primero; la guía y las capacidades quedan debajo. */}
      {tabla}
      <div className="mcp-dos"><Guia mcpUrl={mcpUrl} /><Capacidades user={user} /></div>

      <Seguridad />

      {modal && (
        <CrearTokenModal
          mcpUrl={mcpUrl}
          onClose={() => setModal(false)}
          onCreated={(t) => { const { token: _omit, ...resto } = t; setTokens((prev) => [resto, ...prev]); setFiltro("activo"); setPage(1); }}
        />
      )}
    </div>
  );
}
