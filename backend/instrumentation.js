// Arranca el scheduler de Informes automáticos una sola vez cuando el
// servidor Next.js (runtime Node, no Edge) levanta — ver lib/reportScheduler.js.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // En algunos entornos (sin ruta IPv6 configurada, p.ej. ciertos
    // contenedores/VPN corporativas) Node intenta conectar por IPv6 primero
    // y tarda varios segundos en caer a IPv4 en cada llamada saliente
    // (Anthropic) antes de fallar — curl no tiene ese problema porque
    // detecta la falta de ruta IPv6 al instante. Forzar IPv4 primero evita
    // ese cuelgue silencioso sin afectar nada si el entorno sí tiene IPv6.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
    // Lo que arranca aquí corre solo (sin que una persona lo pida): en producción usa Sonnet 5.5 primero
    // (ver lib/anthropicModels.js). Los temporizadores creados dentro heredan la marca.
    const { enSegundoPlano } = await import("@/lib/anthropicModels");
    await enSegundoPlano(async () => {

    const { startReportScheduler } = await import("@/lib/reportScheduler");
    startReportScheduler();

    // Notificaciones configurables por prompt (app y Teams), ver lib/notificacionesScheduler.js.
    const { startNotificacionesScheduler } = await import("@/lib/notificacionesScheduler");
    startNotificacionesScheduler();

    // Valora en segundo plano las compras radicadas que aún no tienen valoración con IA (ver lib/valoracionAuto.js).
    const { startValoracionAutomatica } = await import("@/lib/valoracionAuto");
    startValoracionAutomatica();

    // Análisis de Nova del Resumen de Bienestar, el día 1 de cada mes (ver lib/analisisBienestar.js).
    const { startAnalisisBienestarScheduler } = await import("@/lib/analisisBienestar");
    startAnalisisBienestarScheduler();

    // Manito arriba / al medio / abajo de los comentarios de Bienestar que aún no la tienen (ver lib/sentimientoComentarios.js).
    const { startClasificacionSentimientos } = await import("@/lib/sentimientoComentarios");
    startClasificacionSentimientos();

    // Avisos a la Bandeja de las actividades de Bienestar que ya pasaron y siguen programadas (ver lib/avisosBienestar.js).
    const { startAvisosBienestar } = await import("@/lib/avisosBienestar");
    startAvisosBienestar();

    // Agente asociador: una vez al día propone la actividad de las compras de Bienestar sin actividad (ver lib/agenteAsociador.js).
    const { startAgenteAsociador } = await import("@/lib/agenteAsociador");
    startAgenteAsociador();

    // Agente de correo: cada 10 min lee el correo vinculado (con el agente encendido) y deja en la Bandeja las
    // solicitudes de creación de proveedor (ver lib/agenteCorreoProveedores.js). Solo con CORREO_MODO=real.
    const { startAgenteCorreo } = await import("@/lib/agenteCorreoProveedores");
    startAgenteCorreo();

    // Una vez por despliegue: manito de todos los comentarios y recalificación de todas las actividades (ver lib/agenteDespliegue.js).
    const { startAgenteAlDesplegar } = await import("@/lib/agenteDespliegue");
    startAgenteAlDesplegar();
    });
  }
}
