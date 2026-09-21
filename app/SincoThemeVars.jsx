"use client";

import { SincoTheme } from "componentes-sinco";

// Traduce la paleta y tipografía reales de SincoTheme (el mismo theme
// que usa Libro de Obra) a las variables CSS que ya consume el
// maquetado propio del panel (globals.css / app-logic.js), que no está
// hecho con componentes de MUI y por lo tanto no recibe el theme por
// ThemeProvider. Se lee siempre del objeto SincoTheme importado, así
// que si el theme de Sinco cambia, el panel lo hereda automáticamente
// sin tocar este archivo.
export default function SincoThemeVars() {
  const { palette, shadows, typography } = SincoTheme;

  const css = `:root{
  --page: ${palette.background.default};
  --surface: ${palette.background.paper};
  --surface-2: ${palette.grey[100]};
  --ink: ${palette.text.primary};
  --ink-2: ${palette.text.secondary};
  --muted: ${palette.text.disabled};
  --grid: ${palette.grey[200]};
  --baseline: ${palette.grey[400]};
  --border: ${palette.divider};
  --accent: ${palette.primary.main};
  --accent-ink: ${palette.primary.contrastText};
  --accent-wash: ${palette.primary[50]};
  --good: ${palette.success.dark};
  --warning: ${palette.warning.main};
  --serious: ${palette.warning.light};
  --critical: ${palette.error.main};
  --s1: ${palette.primary.main};
  --s2: ${palette.warning.main};
  --s3: ${palette.success.dark};
  --s4: ${palette.secondary.main};
  --s5: ${palette.error.light};
  --sOther: ${palette.grey[500]};
  --shadow: ${shadows[1]};
  --font-heading: ${typography.h3.fontFamily}, sans-serif;
  --font-body: ${typography.body1.fontFamily}, sans-serif;
}`;

  return <style>{css}</style>;
}
