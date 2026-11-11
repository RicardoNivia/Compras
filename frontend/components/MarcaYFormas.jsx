// Piezas animadas de la marca, compartidas por el menú (Sidebar.jsx) y el inicio de sesión (LoginForm.jsx).
// Los estilos están en globals.css ("Marca animada del riel" y "Formas que caen por el menú").

// La marca, animada (misma idea que las hojitas del logo de Selvana, con la S de Sinco): la ficha brota, la S se dibuja
// en dos trazos, cae una chispa que late con su onda y todo se mece despacio. Toma el color del módulo y se vuelve a
// dibujar al cambiar de módulo (key en quien la usa).
export function MarcaAnimada({ tamano = 42 }) {
  return (
    <span className="marca-animada" aria-hidden="true">
      <svg viewBox="0 0 48 48" width={tamano} height={tamano}>
        <g className="marca-ficha">
          <rect x="5" y="5" width="38" height="38" rx="12" />
          <path className="marca-trazo" d="M32 15H21.5a5.5 5.5 0 0 0 0 11H24" />
          <path className="marca-trazo marca-trazo-2" d="M24 26h2.5a5.5 5.5 0 0 1 0 11H16" />
        </g>
        <circle className="marca-chispa-halo" cx="39" cy="9" r="4.5" />
        <circle className="marca-chispa" cx="39" cy="9" r="4.5" />
      </svg>
    </span>
  );
}

// Fondo vivo: formas pequeñas que caen despacio en diagonal, girando (la misma idea de las hojas que caen en Selvana,
// con formas propias de cada módulo: cajitas en Compras, corazones en Bienestar, monedas en Tesorería). Posiciones y
// ritmos fijos (sin azar) para que el servidor y el navegador pinten lo mismo. Solo decoración.
const FORMAS = {
  compras: <rect x="4" y="4" width="16" height="16" rx="4.5" />,
  bienestar: <path d="M12 20.5s-7.5-4.6-7.5-10A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10z" />,
  tesoreria: <><circle cx="12" cy="12" r="8.5" /><circle className="hueco" cx="12" cy="12" r="4" /></>,
};
const ORDEN = ["compras", "bienestar", "tesoreria"];
// [posición horizontal %, tamaño px, duración s, retraso s, giro grados]
const CAIDAS = [[20, 12, 11, -2, 200], [70, 9, 14, -8, -240], [45, 14, 17, -12, 160], [10, 10, 13, -5, 260], [85, 8, 10, -9, -180], [58, 11, 15, -4, 220]];
// Para un fondo grande (el panel izquierdo del inicio de sesión): más formas, más grandes y más lentas.
const CAIDAS_GRANDE = [[6, 26, 19, -3, 220], [30, 16, 25, -11, -260], [52, 34, 31, -17, 170], [74, 20, 22, -6, 300], [90, 14, 17, -13, -200], [18, 18, 27, -21, 240], [62, 24, 29, -9, -150], [40, 12, 15, -1, 280], [84, 30, 34, -25, -230], [12, 22, 23, -15, -210], [68, 15, 20, -19, 250]];

// modulo: la forma de ese módulo; sin módulo (inicio de sesión) se mezclan las tres. grande: usa CAIDAS_GRANDE.
export function FormasCayendo({ modulo, cantidad = 5, grande = false, className = "" }) {
  return (
    <span className={`nav2-caen ${className}`} aria-hidden="true">
      {(grande ? CAIDAS_GRANDE : CAIDAS).slice(0, cantidad).map(([x, tam, dur, retraso, giro], i) => (
        <span key={i} className={`cae${i % 3 === 1 ? " clara" : ""}`} style={{ "--x": `${x}%`, "--tam": `${tam}px`, "--dur": `${dur}s`, "--retraso": `${retraso}s`, "--giro": `${giro}deg` }}>
          <svg viewBox="0 0 24 24">{FORMAS[modulo || ORDEN[i % 3]]}</svg>
        </span>
      ))}
    </span>
  );
}
