"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { SincoTheme } from "componentes-sinco";
import "dayjs/locale/es";
import SincoThemeVars from "./SincoThemeVars";

// Mismo setup que usa Libro de Obra (Front): ThemeProvider + CssBaseline
// con el theme oficial de Sinco, más el LocalizationProvider en español
// para los selectores de fecha de MUI. SincoThemeVars vuelca la paleta y
// tipografía reales de SincoTheme a variables CSS (--accent, --good,
// --font-heading, etc.) para que el maquetado propio del panel (que no
// usa componentes de MUI) también se pinte con los colores de Sinco.
//
// AppRouterCacheProvider es el envoltorio oficial de MUI para el App
// Router de Next.js: sin él, los estilos de Emotion que inserta
// CssBaseline no coinciden entre el HTML del servidor y el del cliente,
// y React descarta y vuelve a montar todo el árbol al hidratar. Eso
// dejaba huérfanos los event listeners que app-logic.js engancha al
// cargar (el panel quedaba visible pero los botones de navegación no
// respondían).
export default function Providers({ children }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={SincoTheme}>
        <CssBaseline />
        <SincoThemeVars />
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
