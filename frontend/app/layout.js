import "./globals.css";

export const metadata = {
  title: "Panel de Compras",
  description: "Sinco · Compras — Panel de compras (Next.js + SQLite)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
