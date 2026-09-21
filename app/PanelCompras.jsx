"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import panelShellHtml from "./panelShellHtml";

// Scripts que el panel original cargaba en línea (jsPDF, el plugin
// autoTable y html2canvas, usados para exportar PDF), seguidos de la
// lógica de la aplicación. Se cargan en este orden porque app-logic.js
// depende de que window.jspdf y window.html2canvas ya existan.
const VENDOR_SCRIPTS = [
  "/vendor/jspdf.umd.min.js",
  "/vendor/jspdf.autotable.min.js",
  "/vendor/html2canvas.min.js",
  "/vendor/app-logic.js",
];

function loadScriptSequentially(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar " + src));
    document.body.appendChild(script);
  });
}

function PanelSkeleton() {
  return (
    <Box sx={{ p: "26px 28px" }}>
      <Skeleton variant="rounded" height={52} sx={{ mb: 2, borderRadius: "12px" }} />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", mb: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={92} sx={{ borderRadius: "14px" }} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={280} sx={{ borderRadius: "14px" }} />
    </Box>
  );
}

export default function PanelCompras({ initialRecords }) {
  const containerRef = useRef(null);
  const initializedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Evita una doble inicialización (por ejemplo en desarrollo con
    // recargas rápidas), ya que el script de la app registra listeners
    // globales y de lo contrario quedarían duplicados.
    if (initializedRef.current || typeof window === "undefined") return;
    if (window.__panelComprasInitialized) return;
    initializedRef.current = true;
    window.__panelComprasInitialized = true;

    // Estado inicial que app-logic.js lee en vez del antiguo
    // <script id="app-data">: los registros vienen de SQLite
    // (consultados con Prisma en el Server Component de la página).
    window.__INITIAL_STATE__ = {
      records: initialRecords || [],
      meta: {
        updatedAt: new Date().toISOString(),
      },
    };

    let cancelled = false;

    (async () => {
      for (const src of VENDOR_SCRIPTS) {
        if (cancelled) return;
        await loadScriptSequentially(src);
      }
      if (!cancelled) setReady(true);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Error inicializando Panel de Compras:", err);
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialRecords]);

  return (
    <>
      {!ready && <PanelSkeleton />}
      <div
        ref={containerRef}
        style={{ display: ready ? undefined : "none" }}
        // El HTML original (topbar, dashboard, modales, tooltip) se
        // inserta tal cual; los datos ya no van embebidos aquí.
        dangerouslySetInnerHTML={{ __html: panelShellHtml }}
      />
    </>
  );
}
