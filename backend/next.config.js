/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Necesario en Next 14 para que instrumentation.js (arranque del scheduler
  // de Informes automáticos) se ejecute — es estable sin este flag desde Next 15.
  experimental: {
    instrumentationHook: true,
    // pdfkit (lib/reportPdf.js) carga sus fuentes core (Helvetica, etc.)
    // desde archivos .afm junto al paquete en tiempo de ejecución — si
    // webpack lo empaqueta normalmente esos .afm no se copian al build y
    // falla con ENOENT. Declararlo "external" hace que se cargue tal cual
    // desde node_modules en runtime, sin pasar por el bundler.
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

module.exports = nextConfig;
