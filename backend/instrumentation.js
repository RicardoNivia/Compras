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

    const { startReportScheduler } = await import("@/lib/reportScheduler");
    startReportScheduler();
  }
}
