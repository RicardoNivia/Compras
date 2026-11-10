import { LIMITES } from "@/lib/notificacionesCatalogo";

// Arma lo que recibe cada persona: el contenido (bandeja de la app) y la tarjeta de Teams. Determinista, sin IA.
// Los textos que vienen de los datos (descripción, observaciones…) se recortan y nunca vuelven a pasar por la IA.

const recortar = (s, n) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function aplicarPlantilla(plantilla, valores) {
  return String(plantilla || "").replace(/\{(\w+)\}/g, (m, k) => (valores && valores[k] != null ? String(valores[k]) : m));
}

export function appUrl() {
  return String(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

// notif: la regla. resultado: salida de ejecutarConsulta. opciones: { origen, actorNombre }.
export function construirContenido(notif, resultado, { origen, actorNombre } = {}) {
  const items = (resultado.items || []).slice(0, LIMITES.maxItemsMensaje).map((i) => ({
    ref: recortar(i.ref, 30),
    titulo: recortar(i.titulo, 120),
    contexto: recortar(i.contexto, 120),
    detalle: recortar(i.detalle, 220),
    dato: i.dato ? recortar(i.dato, 30) : null,
    href: i.href || null,
  }));
  return {
    titulo: recortar(aplicarPlantilla(notif.titulo, resultado.valores), 150),
    texto: recortar(aplicarPlantilla(notif.plantilla, resultado.valores), 1500),
    total: resultado.total,
    tituloItems: resultado.tituloItems || null,
    items,
    mas: Math.max(0, (resultado.items || []).length - items.length),
    enlace: resultado.enlace || "/alertas",
    origen: origen || "programado",
    manualPor: origen === "manual" ? actorNombre || null : null,
    pruebaPor: origen === "prueba" ? actorNombre || null : null,
    configuradaPor: notif.propietarioNombre,
    notificacionId: notif.id,
    notificacionNombre: notif.nombre, // de qué configuración viene (se muestra en la app y en Teams)
    fuente: notif.fuente,
  };
}

function lineaOrigen(c) {
  if (c.origen === "prueba") return `PRUEBA · enviada por ${c.pruebaPor || "quien la configuró"}`;
  if (c.origen === "manual") return `Enviada manualmente por ${c.manualPor || "una persona"}`;
  if (c.origen === "recuperado") return "Enviada con retraso (el servidor no estaba disponible a la hora programada)";
  return null;
}

// Adaptive Card 1.4 para Teams. `redirigidaDesde`: en local, a quién iba realmente (TEAMS_DESTINO_PRUEBA).
export function tarjetaTeams(c, { redirigidaDesde } = {}) {
  const base = appUrl();
  const body = [];
  if (redirigidaDesde) body.push({ type: "TextBlock", text: `[LOCAL → era para ${redirigidaDesde}]`, color: "Warning", size: "Small", wrap: true });
  body.push({ type: "TextBlock", text: c.titulo, weight: "Bolder", size: "Medium", wrap: true });
  const origen = lineaOrigen(c);
  if (origen) body.push({ type: "TextBlock", text: origen, color: c.origen === "prueba" ? "Warning" : "Accent", size: "Small", wrap: true, spacing: "None" });
  if (c.texto) body.push({ type: "TextBlock", text: c.texto, wrap: true });
  if (c.tituloItems && c.items.length) body.push({ type: "TextBlock", text: c.tituloItems, weight: "Bolder", size: "Small", spacing: "Medium" });
  for (const i of c.items) {
    body.push({
      type: "ColumnSet",
      separator: true,
      spacing: "Small",
      columns: [
        { type: "Column", width: "auto", items: [{ type: "TextBlock", text: i.ref || " ", weight: "Bolder", size: "Small" }] },
        {
          type: "Column",
          width: "stretch",
          items: [
            { type: "TextBlock", text: i.titulo, wrap: true, size: "Small" },
            ...(i.contexto || i.detalle ? [{ type: "TextBlock", text: [i.contexto, i.detalle].filter(Boolean).join(" · "), wrap: true, isSubtle: true, size: "Small", spacing: "None" }] : []),
          ],
        },
        ...(i.dato ? [{ type: "Column", width: "auto", items: [{ type: "TextBlock", text: i.dato, size: "Small", horizontalAlignment: "Right" }] }] : []),
      ],
    });
  }
  if (c.mas) body.push({ type: "TextBlock", text: `y ${c.mas} más`, isSubtle: true, size: "Small" });
  body.push({ type: "TextBlock", text: `Notificación «${c.notificacionNombre || c.titulo}» · configurada por ${c.configuradaPor} · Panel de Compras y Bienestar`, isSubtle: true, size: "Small", wrap: true, spacing: "Medium" });
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body,
    actions: [
      { type: "Action.OpenUrl", title: "Ver en el panel", url: `${base}/alertas?tab=bandeja` },
      { type: "Action.OpenUrl", title: "Gestionar notificación", url: `${base}/alertas?tab=notificaciones${c.notificacionId ? `&n=${c.notificacionId}` : ""}` },
    ],
  };
}
