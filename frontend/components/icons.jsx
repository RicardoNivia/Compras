// Set de iconos SVG livianos (trazo simple) usados en toda la app,
// en reemplazo de emojis, siguiendo la propuesta de rediseño.

function Svg({ children, size = 16, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 17" fill="none" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export function IconDashboard(props) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="1.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="1.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="9.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
    </Svg>
  );
}

export function IconTable(props) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6.7h14M6 2.5v12" stroke="currentColor" strokeWidth="1.3" />
    </Svg>
  );
}

export function IconSpark(props) {
  return (
    <Svg {...props}>
      <path d="M8.5 1.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M13.6 11l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconUsers(props) {
  return (
    <Svg {...props}>
      <circle cx="6.3" cy="5.3" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 14.3c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12.3" cy="6" r="1.9" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <path d="M11 14c.4-1.9 1.7-3 3.3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </Svg>
  );
}

export function IconLogout(props) {
  return (
    <Svg {...props}>
      <path d="M7 2H3.5A1.5 1.5 0 0 0 2 3.5v10A1.5 1.5 0 0 0 3.5 15H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 5.2L14.5 8.5 11 11.8M14.2 8.5H6.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconKey(props) {
  return (
    <Svg {...props}>
      <circle cx="5.3" cy="11.3" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.4 9.2L13.5 3.1M11.3 5.3l1.7 1.7M13.3 3.3l1.7 1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSearch(props) {
  return (
    <Svg {...props} viewBox="0 0 15 15">
      <circle cx="6.5" cy="6.5" r="4.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 10l3.2 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function IconBell(props) {
  return (
    <Svg {...props}>
      <path d="M8 1.6c-2.1 0-3.5 1.6-3.5 3.9 0 3.5-1.3 4.2-1.3 5h9.6c0-.8-1.3-1.5-1.3-5 0-2.3-1.4-3.9-3.5-3.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.4 13a1.6 1.6 0 0 0 3.2 0" stroke="currentColor" strokeWidth="1.2" />
    </Svg>
  );
}

export function IconPlus(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

// Manito: arriba (positivo), al medio (neutro, de lado) o abajo (negativo).
export function IconMano({ sentido = "arriba", ...props }) {
  const giro = { arriba: 0, medio: 90, abajo: 180 }[sentido] ?? 0;
  return (
    <Svg {...props}>
      <g transform={`rotate(${giro} 8.5 8.5)`}>
        <path d="M5.2 7.6v7H3a.9.9 0 0 1-.9-.9V8.5a.9.9 0 0 1 .9-.9h2.2Zm0 0 2.7-5.2a1.5 1.5 0 0 1 2.8.9l-.6 3.1h3.6a1.4 1.4 0 0 1 1.4 1.7l-1.1 5.3a1.4 1.4 0 0 1-1.4 1.2H5.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity=".14" />
      </g>
    </Svg>
  );
}

export function IconDownload(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M2 8.5V11h9V8.5M6.5 2v6.5M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconEdit(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M9.8 2.7a1.6 1.6 0 0 1 2.3 2.3L4.9 12.2l-2.9.8.8-2.9 7-7.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconTrash(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M2.2 3.6h8.6M5 3.6V2.4a.9.9 0 0 1 .9-.9h1.2a.9.9 0 0 1 .9.9v1.2m-4.9 0 .5 7.1a1.1 1.1 0 0 0 1.1 1H8.2a1.1 1.1 0 0 0 1.1-1l.5-7.1" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M3 7l2.8 2.8L10.5 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronDown(props) {
  return (
    <Svg {...props} viewBox="0 0 10 10">
      <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconArrowRight(props) {
  return (
    <Svg {...props} viewBox="0 0 16 16">
      <path d="M2 8h9.5M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSend(props) {
  return (
    <Svg {...props} viewBox="0 0 15 15">
      <path d="M2 7.5h10.5M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconTrendUp(props) {
  return (
    <Svg {...props} viewBox="0 0 11 11">
      <path d="M1.5 8L5 4l2 2 2.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMoney(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <path d="M2 12V2M2 12h10M4.5 9l2.3-2.3L8.5 8.5 12 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function IconFile(props) {
  return (
    <Svg {...props} viewBox="0 0 13 13">
      <path d="M3 1.5h4.5L10.5 4.5v7A1 1 0 0 1 9.5 12.5h-6A1 1 0 0 1 2.5 11.5v-9A1 1 0 0 1 3 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M7.3 1.5v3h3.2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconHistory(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <path d="M2.3 7A4.7 4.7 0 1 1 3.8 10.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2.3 4v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4.3v3l2.2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconAlert(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.6v3M7 9.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconCopy(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <rect x="5" y="5" width="7.5" height="7.5" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 9.5h-1A1 1 0 0 1 1.5 8.5v-6A1 1 0 0 1 2.5 1.5h6a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconInfo(props) {
  return (
    <Svg {...props} viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6.3v3.4M7 4.3h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconLayers(props) {
  return (
    <Svg {...props}>
      <path d="M8.5 1.8 15 5.3l-6.5 3.5L2 5.3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2 9 8.5 12.5 15 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12.5 8.5 16l6.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconBuilding(props) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="1.8" width="7.5" height="13.4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 6.5h4.5v8.7H10" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4.7 4.5h1.6M4.7 7.2h1.6M4.7 9.9h1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.7 15.2v-2.3H5.3v2.3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMail(props) {
  return (
    <Svg {...props} viewBox="0 0 16 16">
      <rect x="1.5" y="3" width="13" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 4l6 5 6-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconStar({ filled, ...props }) {
  return (
    <Svg {...props}>
      <path
        d="M8.5 1.8l2 4.1 4.5.6-3.3 3.2.8 4.5-4-2.1-4 2.1.8-4.5-3.3-3.2 4.5-.6z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  );
}

export function IconFlag(props) {
  return (
    <Svg {...props}>
      <path d="M3 1.5v13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3 2.2c2-1 4 1 6 0s4-1 4 0v6c-2-1-4 1-6 0s-4-1-4 0Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconEye(props) {
  return (
    <Svg {...props} viewBox="0 0 16 16">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
    </Svg>
  );
}

export function IconCalendar(props) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="3" width="13.4" height="12.2" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 7h13.4M5.3 1.5v3M11.7 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function IconBag(props) {
  return (
    <Svg {...props}>
      <path d="M3.2 5.5h10.6l-.8 9.2a1 1 0 0 1-1 .9H5a1 1 0 0 1-1-.9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 7.5V4.6a2.5 2.5 0 0 1 5 0v2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function IconHeart(props) {
  return (
    <Svg {...props}>
      <path d="M8.5 14.6S2 10.8 2 6.4A3.4 3.4 0 0 1 8.5 4.9a3.4 3.4 0 0 1 6.5 1.5c0 4.4-6.5 8.2-6.5 8.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPanel(props) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.5" width="13.4" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.3 2.5v12" stroke="currentColor" strokeWidth="1.3" />
    </Svg>
  );
}

export function IconList(props) {
  return (
    <Svg {...props}>
      <path d="M6 4.5h8.5M6 8.5h8.5M6 12.5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="3" cy="4.5" r="0.9" fill="currentColor" />
      <circle cx="3" cy="8.5" r="0.9" fill="currentColor" />
      <circle cx="3" cy="12.5" r="0.9" fill="currentColor" />
    </Svg>
  );
}

// Bandeja de entrada (Mi correo / agente de correo).
export function IconInbox(props) {
  return (
    <Svg {...props} viewBox="0 0 16 16">
      <path d="M2 9.5l1.6-5.2A1.4 1.4 0 0 1 4.9 3.3h6.2a1.4 1.4 0 0 1 1.3 1L14 9.5V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2 9.5h3.2l.9 1.6h3.8l.9-1.6H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
