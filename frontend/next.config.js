const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sin esto, el Router Cache del cliente reutiliza el RSC payload de rutas
  // dinámicas (como /dashboard) hasta 30s al navegar con <Link>, mostrando
  // datos desactualizados. En 0, cada entrada a una ruta dinámica recarga.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  // El backend es un proyecto Next.js aparte (otro proceso/origen). Las
  // llamadas fetch("/api/...") del navegador se reenvían aquí para que
  // sigan siendo same-origin desde su perspectiva (cookie de sesión y CORS
  // no se complican).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
