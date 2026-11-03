import "./globals.css";

export const metadata = {
  title: "Panel de Compras y Bienestar",
  description: "Sinco · Panel de Compras y Bienestar: compras, proveedores y presupuesto; actividades de Bienestar y Fundación",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
