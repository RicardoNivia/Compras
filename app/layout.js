import "./fonts.css";
import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Panel de Compras",
  description: "Panel de Compras · Sinco",
};

export default function RootLayout({ children }) {
  // suppressHydrationWarning: algunas extensiones del navegador (traductores,
  // gestores de contraseñas, etc.) inyectan atributos en <html> antes de que
  // React hidrate. React ya ignora ese caso ("won't be patched up"); esto solo
  // silencia la advertencia en consola, no desactiva la detección de otros
  // problemas de hidratación reales.
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Nunito/Roboto (títulos/cuerpo, design system de Sinco) se
            auto-hospedan vía ./fonts.css; IBM Plex Mono (cifras
            tabulares) sigue viniendo de Google Fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
