"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// swagger-ui-react no soporta SSR (usa window/document) — se carga solo en
// el navegador. El spec que renderiza sale de /api/openapi.json (generado en
// caliente desde los comentarios "@openapi" de cada route.js, ver lib/openapi.js).
// Acceso restringido a admin en middleware.js (expone la forma completa de la API).
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function DocsPage() {
  return <SwaggerUI url="/api/openapi.json" />;
}
