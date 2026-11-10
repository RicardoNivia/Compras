// Piezas compartidas de Historias de Fundación (página, reproductor y PDF).

export const LOGO = "/bienestar/conectando-corazones.png";

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const partes = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return { y, m, d }; };

// "23 abr"
export function fechaCorta(iso) {
  if (!iso) return "";
  const { m, d } = partes(iso);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

// "Jueves 23 de abril de 2026" (el día de la semana sale de la fecha en UTC, sin zona: es una fecha de calendario).
export function fechaLarga(iso) {
  if (!iso) return "";
  const { y, m, d } = partes(iso);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d} de ${MESES_LARGOS[m - 1]} de ${y}`;
}

export function Corazon({ size = 20, className, style }) {
  return (
    <svg className={className} style={style} width={size} height={Math.round(size * 0.94)} viewBox="0 0 32 30" aria-hidden="true">
      <path d="M16 29C7 22 1 17 1 9.5 1 4.8 4.7 1 9.2 1 12 1 14.6 2.5 16 4.8 17.4 2.5 20 1 22.8 1 27.3 1 31 4.8 31 9.5 31 17 25 22 16 29Z" fill="currentColor" />
    </svg>
  );
}

export function IconoFoto({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.5-2h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
