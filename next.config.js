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
};

module.exports = nextConfig;
