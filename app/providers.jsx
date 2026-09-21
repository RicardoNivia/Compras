"use client";

import { ThemeProvider } from "@mui/material/styles";
import { SincoTheme } from "componentes-sinco";

// Mismo provider de tema que usa Libro de Obra (Front). No incluye
// CssBaseline a propósito: este panel tiene su propio sistema de diseño
// en globals.css y CssBaseline pisaría esos estilos. El ThemeProvider solo
// alimenta los componentes de MUI que se agreguen (loaders, skeletons, etc.)
// con la paleta y tipografía de Sinco.
export default function Providers({ children }) {
  return <ThemeProvider theme={SincoTheme}>{children}</ThemeProvider>;
}
