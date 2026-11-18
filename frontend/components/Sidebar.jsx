"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { canViewDashboard, canViewUsuarios, canViewAgenteIA, canViewAuditoria, canViewMaestros, canViewProveedores, canViewPresupuesto, canViewReportes, canViewAlertas, canViewRegistros, canViewNotificaciones, canViewBienestar, canEditBienestar, canViewAgentesCompras, canVincularCorreo, ROLE_LABELS } from "@/lib/roles";
import { EVENTO_NO_LEIDAS, EVENTO_SOLICITUDES } from "@/lib/notificacionesApi";
import { MODULOS } from "@/lib/modulos";
import { useModulo } from "@/components/ModuloShell";
import {
  IconDashboard, IconTable, IconSpark, IconUsers, IconHistory, IconLayers, IconLogout, IconKey, IconMoney, IconMail,
  IconBell, IconBuilding, IconEye, IconCalendar, IconBag, IconHeart, IconList, IconCheck, IconClock, IconSearch, IconPanel, IconSun, IconMoon, IconBox, IconGauge, IconAlert } from "@/components/icons";
import { fetchCompartidosApi } from "@/lib/api";
import { crossfade } from "@/lib/crossfade";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import CommandPalette from "@/components/CommandPalette";
import { MarcaAnimada, FormasCayendo } from "@/components/MarcaYFormas";

// Menú en dos piezas, las dos fijas a todo el alto (nunca se desplazan con el contenido): un riel oscuro con los
// módulos que la persona puede usar (cada uno con su color; Alt+1/2/3 cambian directo) y, al lado, el panel con el
// menú del módulo activo más el grupo "General". En el riel van también el buscador (Ctrl+K), el tema claro/oscuro
// (cookie "tema", ver app/layout.js) y el botón que pliega el panel (cookie "menu"; plegado —lo normal— el panel se abre
// al hacer clic en un módulo y se oculta cuando el mouse sale del menú). "feature" referencia la Matriz de permisos (si el usuario trae user.permissions, que siempre
// debería, se usa eso; "show" es el respaldo de lib/roles.js).
const GRUPOS = {
  compras: [
    {
      titulo: "Operación",
      items: [
        { key: "dashboard", href: "/dashboard", label: "Dashboard de compras", Icon: IconDashboard, feature: "viewDashboard", show: canViewDashboard },
        { key: "registros", href: "/registros", label: "Registros", Icon: IconTable, feature: "viewRegistros", show: canViewRegistros },
        { key: "proveedores", href: "/proveedores", label: "Proveedores", Icon: IconBuilding, feature: "viewProveedores", show: canViewProveedores },
        { key: "agentes", href: "/agentes", label: "Agentes", Icon: IconSpark, feature: "viewAgentesCompras", show: canViewAgentesCompras },
      ],
    },
    {
      titulo: "Planeación",
      items: [
        { key: "presupuesto", href: "/presupuesto", label: "Presupuesto", Icon: IconMoney, feature: "viewPresupuesto", show: canViewPresupuesto },
        { key: "informes", href: "/informes", label: "Informes", Icon: IconMail, feature: "viewReportes", show: canViewReportes },
        { key: "maestros", href: "/maestros", label: "Maestros", Icon: IconLayers, feature: "viewMaestros", show: canViewMaestros },
      ],
    },
  ],
  // Bienestar y la Fundación (en el menú se llama "Conectando Corazones", el nombre del programa) van muy aparte: cada línea con su resumen, sus actividades y su cronograma.
  bienestar: [
    {
      titulo: "Bienestar",
      items: [
        { key: "bienestar", href: "/bienestar", label: "Resumen", Icon: IconDashboard, feature: "viewDashboardBienestar", show: canViewBienestar },
        { key: "bienestar-actividades", href: "/bienestar/actividades", label: "Actividades", Icon: IconList, feature: "viewBienestar", show: canViewBienestar },
        { key: "bienestar-cronograma", href: "/bienestar/cronograma", label: "Cronograma", Icon: IconCalendar, feature: "viewBienestar", show: canViewBienestar },
        { key: "bienestar-agentes", href: "/bienestar/agentes", label: "Agentes", Icon: IconSpark, feature: "editBienestar", show: canEditBienestar },
        { key: "bienestar-inventario", href: "/bienestar/inventario", label: "Inventario", Icon: IconBox, feature: "viewInventarioBienestar", show: canViewBienestar },
        { key: "bienestar-maestros", href: "/bienestar/maestros", label: "Maestros", Icon: IconLayers, feature: "viewMaestrosBienestar", show: canViewBienestar },
      ],
    },
    {
      titulo: "Conectando Corazones",
      items: [
        { key: "fundacion", href: "/bienestar/fundacion", label: "Resumen", buscar: "Resumen · Conectando Corazones", Icon: IconDashboard, feature: "viewDashboardFundacion", show: canViewBienestar },
        { key: "fundacion-actividades", href: "/bienestar/fundacion/actividades", label: "Actividades", buscar: "Actividades · Conectando Corazones", Icon: IconList, feature: "viewFundacion", show: canViewBienestar },
        { key: "fundacion-cronograma", href: "/bienestar/fundacion/cronograma", label: "Cronograma", buscar: "Cronograma · Conectando Corazones", Icon: IconCalendar, feature: "viewFundacion", show: canViewBienestar },
        { key: "fundacion-historias", href: "/bienestar/fundacion/historias", label: "Historias", buscar: "Historias · Conectando Corazones", Icon: IconHeart, feature: "viewFundacion", show: canViewBienestar },
      ],
    },
  ],
  // Tesorería: el acceso viene de la Matriz (user.tesoreria, de /api/auth/me: verTesoreria / registrarTesoreria / firmarTesoreria).
  tesoreria: [
    {
      titulo: "Día a día",
      items: [
        { key: "tesoreria", href: "/tesoreria", label: "Dashboard", buscar: "Dashboard · Resumen · Tesorería", Icon: IconDashboard, permite: (u) => !!u.tesoreria },
        // «Por resolver» salió del menú (noviembre 2026): la página /tesoreria/por-resolver sigue y se llega por enlaces (Mi día, avisos).
        { key: "tesoreria-movimientos", href: "/tesoreria/movimientos", label: "Movimientos", buscar: "Movimientos del banco · Tesorería", Icon: IconTable, permite: (u) => !!u.tesoreria },
        { key: "tesoreria-pagos", href: "/tesoreria/pagos", label: "Pagos programados", buscar: "Pagos programados · Tesorería", Icon: IconCalendar, permite: (u) => !!u.tesoreria },
        { key: "tesoreria-periodicos", href: "/tesoreria/periodicos", label: "Gastos periódicos", buscar: "Gastos periódicos · Tesorería", Icon: IconHistory, permite: (u) => !!u.tesoreria },
      ],
    },
    {
      titulo: "Herramientas",
      items: [
        { key: "tesoreria-importar", href: "/tesoreria/importar", label: "Importar plantilla", buscar: "Importar plantilla de Excel · Tesorería", Icon: IconLayers, permite: (u) => !!u.tesoreria?.puedeRegistrar },
        { key: "tesoreria-agentes", href: "/tesoreria/agentes", label: "Agentes", buscar: "Agente de asociación · Tesorería", Icon: IconSpark, permite: (u) => !!u.tesoreria },
        { key: "tesoreria-conciliacion", href: "/tesoreria/conciliacion", label: "Conciliación", buscar: "Conciliación y cierre de mes · Tesorería", Icon: IconCheck, permite: (u) => !!u.tesoreria },
      ],
    },
    {
      titulo: "Consultas",
      items: [
        { key: "tesoreria-saldos", href: "/tesoreria/saldos", label: "Saldos de bancos", buscar: "Saldos de bancos · Tesorería", Icon: IconBuilding, permite: (u) => !!u.tesoreria },
        { key: "tesoreria-reportes", href: "/tesoreria/reportes", label: "Reportes", buscar: "Reportes · Tesorería", Icon: IconList, permite: (u) => !!u.tesoreria },
      ],
    },
    {
      titulo: "Configuración",
      items: [
        { key: "tesoreria-maestros", href: "/tesoreria/maestros", label: "Maestros", buscar: "Maestros de Tesorería", Icon: IconMoney, permite: (u) => !!u.tesoreria },
      ],
    },
  ],
  // Consumo (servicios públicos por sede): el acceso viene de la Matriz (user.consumo, de /api/auth/me:
  // verConsumo / registrarConsumo / administrarConsumo). Las páginas se van sumando por fases.
  consumo: [
    {
      titulo: "Operación",
      items: [
        { key: "consumo", href: "/consumo", label: "Dashboard", buscar: "Dashboard · Consumo", Icon: IconDashboard, permite: (u) => !!u.consumo },
        { key: "consumo-subir", href: "/consumo/subir", label: "Subir recibos", buscar: "Subir recibos con Nova · Consumo", Icon: IconSpark, permite: (u) => !!u.consumo?.puedeRegistrar },
        { key: "consumo-recibos", href: "/consumo/recibos", label: "Recibos", buscar: "Recibos de servicios públicos · Consumo", Icon: IconTable, permite: (u) => !!u.consumo },
        { key: "consumo-sedes", href: "/consumo/sedes", label: "Sedes y cuentas", buscar: "Sedes y cuentas de servicio · Consumo", Icon: IconBuilding, permite: (u) => !!u.consumo },
      ],
    },
    {
      titulo: "Análisis",
      items: [
        { key: "consumo-auditoria", href: "/consumo/auditoria", label: "Auditoría y hallazgos", buscar: "Auditoría y hallazgos · Consumo", Icon: IconAlert, permite: (u) => !!u.consumo },
        { key: "consumo-agentes", href: "/consumo/agentes", label: "Agentes", buscar: "Agentes de Nova · Recibos faltantes · Hallazgos · Reclamaciones · Consumo", Icon: IconSpark, permite: (u) => !!u.consumo },
      ],
    },
    {
      titulo: "Configuración",
      items: [
        { key: "consumo-maestros", href: "/consumo/maestros", label: "Maestros", buscar: "Maestros de Consumo · Empresas de servicio", Icon: IconLayers, permite: (u) => !!u.consumo },
      ],
    },
  ],
};

const GENERALES = [
  { key: "alertas", href: "/alertas", label: "Alertas y notificaciones", corto: "Alertas", Icon: IconBell, feature: "viewAlertas", show: canViewAlertas, alt: { feature: "viewNotificaciones", show: canViewNotificaciones } },
  { key: "agente-ia", href: "/agente-ia", label: "Nova", Icon: IconSpark, feature: "viewAgenteIA", show: canViewAgenteIA },
  // Mi correo: el correo de soportes de pago (Gmail compartido, lo conecta un administrador).
  { key: "mi-correo", href: "/mi-correo", label: "Mi correo", corto: "Correo", Icon: IconMail, feature: "vincularCorreo", show: canVincularCorreo },
  { key: "usuarios", href: "/usuarios", label: "Usuarios y roles", corto: "Usuarios", Icon: IconUsers, feature: "viewUsuarios", show: canViewUsuarios },
  { key: "auditoria", href: "/auditoria", label: "Auditoría", Icon: IconHistory, feature: "viewAuditoria", show: canViewAuditoria },
  // Solo para administradores (no es un permiso de la Matriz: se valida el rol).
  { key: "conectar-claude", href: "/conectar-claude", label: "Conectar con Claude", corto: "Claude", Icon: IconKey, feature: null, show: (role) => role === "admin" },
];

// Todos los destinos (los usa la paleta de comandos y el chat flotante para saber en qué página está la persona).
export const ALL_NAV_ITEMS = [...Object.values(GRUPOS).flat().flatMap((g) => g.items), ...GENERALES].map((it) => (it.buscar ? { ...it, label: it.buscar } : it));

const permiteA = (user, it) => (it.permite ? it.permite(user) : it.feature ? (user.permissions?.[it.feature] ?? it.show(user.role)) : it.show(user.role))
  || (it.alt && (user.permissions?.[it.alt.feature] ?? it.alt.show(user.role)));

// Módulos que la persona puede usar: los que tienen al menos una opción permitida por su rol (Matriz de permisos).
// { compras: "/dashboard", bienestar: "/bienestar" } — el valor es el primer destino al cambiar a ese módulo.
// Lo usa el selector de módulo del menú.
export function modulosDelUsuario(user) {
  const out = {};
  for (const [key, grupos] of Object.entries(GRUPOS)) {
    const primero = grupos.flatMap((g) => g.items).find((it) => permiteA(user, it));
    if (primero) out[key] = primero.href;
  }
  return out;
}

export const ICONOS_MODULO = { compras: IconBag, bienestar: IconHeart, tesoreria: IconMoney, consumo: IconGauge };

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const UN_ANIO = 31536000;
const guardarCookie = (nombre, valor) => { document.cookie = `${nombre}=${valor}; path=/; max-age=${UN_ANIO}; samesite=lax`; };

export default function Sidebar({ user, plegadoInicial = true }) {
  // plegado (lo normal): el panel no ocupa espacio; se descubre encima de la página al acercar el mouse al menú —la
  // misma mecánica y animación del menú de Selvana, hecha en CSS— o con clic en un módulo del riel (para pantallas
  // táctiles), y se oculta cuando el mouse sale. Con el botón del riel se puede dejar fijo (cookie "menu" = abierto).
  const [plegado, setPlegado] = useState(plegadoInicial);
  const [abierto, setAbierto] = useState(false);
  const cierre = useRef(null);
  const [tema, setTema] = useState(null); // "light" | "dark"; null hasta leerlo en el navegador
  const [loggingOut, setLoggingOut] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const modulo = useModulo();

  // "Ver informes": solo aparece si la persona tiene informes para consultar; lleva directo a la lista (/ver-informes).
  const [hayCompartidos, setHayCompartidos] = useState(false);
  useEffect(() => {
    fetchCompartidosApi().then((r) => setHayCompartidos((r.informes || []).length > 0)).catch(() => {});
  }, [pathname]);

  const permite = (it) => permiteA(user, it);

  // Módulos que la persona puede usar (con al menos una opción permitida) y sus grupos ya filtrados.
  const menu = useMemo(() => {
    const out = {};
    for (const [key, grupos] of Object.entries(GRUPOS)) {
      const visibles = grupos.map((g) => ({ ...g, items: g.items.filter(permite) })).filter((g) => g.items.length);
      if (key === "compras" && hayCompartidos) {
        const extra = { key: "ver-informes", href: "/ver-informes", label: "Ver informes", Icon: IconEye };
        const plan = visibles.find((g) => g.titulo === "Planeación");
        if (plan) plan.items = [...plan.items, extra];
        else visibles.push({ titulo: "Planeación", items: [extra] });
      }
      if (visibles.length) out[key] = visibles;
    }
    return out;
  }, [user, hayCompartidos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lo general (Alertas, Nova, Usuarios y roles, Auditoría, Conectar con Claude) va en el riel como accesos directos:
  // cada uno lleva a su página, sin abrir un menú (antes se repetía al final del menú de cada módulo).
  const generales = GENERALES.filter(permite);
  const modulosVisibles = Object.keys(menu);
  const modulosPropios = Object.entries(modulosDelUsuario(user));
  const moduloMenu = menu[modulo] ? modulo : modulosVisibles[0];
  // En el buscador (Ctrl+K) cada opción lleva su nombre completo ("Resumen · Conectando Corazones"), para no confundirla con la de Bienestar.
  const itemsPaleta = ([...Object.values(menu).flat().flatMap((g) => g.items), ...generales]).map((it) => (it.buscar ? { ...it, label: it.buscar } : it));

  // Punto rojo en "Alertas y notificaciones": notificaciones no leídas + solicitudes de compra por atender (lo publica
  // components/notificaciones/AvisosEnVivo.jsx).
  const [sinLeer, setSinLeer] = useState(0);
  const [solicitudes, setSolicitudes] = useState(0);
  const noLeidas = sinLeer + solicitudes;
  useEffect(() => {
    const alCambiar = (e) => setSinLeer(Number(e.detail) || 0);
    const alCambiarSolicitudes = (e) => setSolicitudes(Number(e.detail) || 0);
    window.addEventListener(EVENTO_NO_LEIDAS, alCambiar);
    window.addEventListener(EVENTO_SOLICITUDES, alCambiarSolicitudes);
    return () => { window.removeEventListener(EVENTO_NO_LEIDAS, alCambiar); window.removeEventListener(EVENTO_SOLICITUDES, alCambiarSolicitudes); };
  }, []);

  // Abrir la paleta de comandos con Ctrl/Cmd+K desde cualquier página — el
  // Sidebar vive en el layout persistente (app/(app)/layout.js), así que este
  // listener queda activo todo el tiempo sin tener que registrarlo por página.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Tema: el elegido (data-theme en <html>, que el servidor pone desde la cookie) o, si no ha elegido, el del sistema.
  useEffect(() => {
    setTema(document.documentElement.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  function cambiarTema() {
    const nuevo = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    guardarCookie("tema", nuevo);
    setTema(nuevo);
  }

  function alternarPanel() {
    setPlegado((p) => { guardarCookie("menu", p ? "abierto" : "plegado"); return !p; });
    setAbierto(false);
  }

  // Clic en un módulo del riel: cambia de módulo y, con el menú plegado, abre su panel (otro clic en el mismo lo cierra).
  function clicModulo(m, href) {
    if (plegado) setAbierto((a) => (m === moduloMenu ? !a : true));
    irAModulo(m, href);
  }
  // El panel abierto se oculta cuando el mouse sale del menú (con un respiro, por si solo se pasó del borde) o con Esc.
  function alSalir() { if (plegado && abierto) cierre.current = setTimeout(() => setAbierto(false), 280); }
  function alEntrar() { clearTimeout(cierre.current); }
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(cierre.current); };
  }, [abierto]);

  function irAModulo(m, href) {
    if (m === moduloMenu) return;
    crossfade(() => router.push(href));
  }

  // Alt+1/2/3: cambia directo de módulo (en el orden del riel).
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= modulosPropios.length) { e.preventDefault(); irAModulo(...modulosPropios[n - 1]); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const enlace = (item) => {
    const { key, href, label, Icon } = item;
    return (
      <Link key={key} href={href} className={`nav2-link${pathname === href ? " active" : ""}`} aria-current={pathname === href ? "page" : undefined} title={label}>
        <span className="nav2-link-ic">
          <Icon size={17} />
          {key === "alertas" && noLeidas > 0 && <span className="notif-dot" aria-label={`${noLeidas} sin leer`} />}
        </span>
        <span className="label">{label}</span>
        {key === "alertas" && noLeidas > 0 && <span className="notif-badge notif-badge-menu">{noLeidas > 99 ? "99+" : noLeidas}</span>}
      </Link>
    );
  };

  const IconoModulo = ICONOS_MODULO[moduloMenu];
  return (
    <div className={`nav2${plegado ? " plegado" : ""}${abierto ? " abierto" : ""}`} onMouseLeave={alSalir} onMouseEnter={alEntrar}>
      <div className="nav2-rail">
        <FormasCayendo modulo={moduloMenu} cantidad={4} />
        <MarcaAnimada key={moduloMenu} />
        {modulosPropios.map(([m, href], i) => {
          const Icono = ICONOS_MODULO[m];
          return (
            <button key={m} type="button" className={`nav2-mod${m === moduloMenu ? " activo" : ""}`} style={{ "--m": `var(--marca-${m})` }}
              onClick={() => clicModulo(m, href)} aria-current={m === moduloMenu ? "true" : undefined} aria-expanded={plegado ? abierto && m === moduloMenu : undefined} title={`${MODULOS[m]?.nombre} (Alt+${i + 1})`}>
              <span className="nav2-mod-chip">{Icono && <Icono size={19} />}</span>
              <span>{MODULOS[m]?.nombre}</span>
            </button>
          );
        })}
        {generales.length > 0 && <span className="nav2-rail-div" aria-hidden="true" />}
        {generales.map(({ key, href, label, corto, Icon }) => {
          const activo = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={key} href={href} className={`nav2-mod nav2-directo${activo ? " activo" : ""}`} aria-current={activo ? "page" : undefined} title={label}
              onClick={() => setAbierto(false)}>
              <span className="nav2-mod-chip">
                <Icon size={18} />
                {key === "alertas" && noLeidas > 0 && <span className="notif-dot" aria-label={`${noLeidas} sin leer`} />}
              </span>
              <span>{corto || label}</span>
            </Link>
          );
        })}
        <span className="nav2-rail-sep" />
        <button type="button" className="nav2-rail-btn" onClick={() => setPaletteOpen(true)} title="Buscar (Ctrl+K)" aria-label="Buscar">
          <IconSearch size={17} />
        </button>
        <button type="button" className="nav2-rail-btn" onClick={cambiarTema} title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
          {tema === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
        </button>
        <button type="button" className="nav2-rail-btn" onClick={alternarPanel} title={plegado ? "Dejar el menú fijo" : "Ocultar el menú (se abre al acercar el mouse)"}
          aria-label={plegado ? "Dejar el menú fijo" : "Plegar el menú"} aria-pressed={!plegado}>
          <IconPanel size={17} />
        </button>
      </div>

      <aside className="nav2-panel">
        <FormasCayendo modulo={moduloMenu} cantidad={6} />
        <div className="nav2-head">
          <span className="nav2-chip">{IconoModulo && <IconoModulo size={19} />}</span>
          <span className="nav2-head-txt">
            <strong>{MODULOS[moduloMenu]?.nombre || "Panel"}</strong>
            <small>{MODULOS[moduloMenu]?.descripcion || "Sinco"}</small>
          </span>
        </div>

        <button type="button" className="nav2-buscar" onClick={() => setPaletteOpen(true)}>
          <IconSearch size={15} />
          <span>Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav className="nav2-nav" aria-label="Navegación principal">
          {(menu[moduloMenu] || []).map((g) => (
            <div key={g.titulo} className="nav2-grupo">
              <span className="nav2-grupo-titulo">{g.titulo}</span>
              {g.items.map(enlace)}
            </div>
          ))}
        </nav>

        <div className="nav2-user">
          <div className="nav2-user-avatar">{initials(user.nombre)}</div>
          <div className="nav2-user-txt">
            <span className="nav2-user-name">{user.nombre}</span>
            <span className="nav2-user-role">{user.roleLabel || ROLE_LABELS[user.role] || user.role}</span>
          </div>
          <button type="button" className="nav2-user-btn" onClick={() => setShowChangePassword(true)} title="Cambiar contraseña" aria-label="Cambiar contraseña">
            <IconKey size={15} />
          </button>
          <button type="button" className="nav2-user-btn" onClick={handleLogout} disabled={loggingOut} title="Cerrar sesión" aria-label="Cerrar sesión">
            {loggingOut ? <span className="spinner" /> : <IconLogout size={15} />}
          </button>
        </div>
      </aside>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {paletteOpen && <CommandPalette items={itemsPaleta} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
