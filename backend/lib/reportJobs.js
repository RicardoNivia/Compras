import { randomUUID } from "node:crypto";

// Trabajos en memoria para desacoplar la generación de informes (puede tardar
// hasta ~100s, ver lib/aiStructured.js) del límite de ~30s que el proxy de
// rewrites del frontend le impone a cualquier request iniciado desde el
// navegador (ver el comentario en lib/anthropic.js).
// En vez de esperar la respuesta completa en una sola llamada HTTP, el POST
// inicial solo crea el trabajo y responde al toque; el cliente consulta su
// estado con GETs cortos y rápidos hasta que termina — ver
// app/api/reports/jobs/[jobId]/route.js y lib/api.js (previewReportApi/
// sendReportNowApi, que hacen ese polling internamente).
// En globalThis (no un simple módulo-nivel `const`) por la misma razón que
// lib/prisma.js: en dev, Next.js puede compilar cada route handler como un
// bundle aislado con su propia instancia del módulo, así que un Map a nivel
// de módulo no queda garantizado compartido entre la ruta que crea el
// trabajo (preview/send-now) y la que lo consulta (jobs/[jobId]) — globalThis
// sí es el mismo objeto para todo el proceso, sin importar cómo se bundee cada ruta.
const jobs = globalThis.__reportJobs || (globalThis.__reportJobs = new Map());
const JOB_TTL_MS = 15 * 60 * 1000;

function cleanupOld() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

// ownerId: quien creó el trabajo. Permite que un usuario sin permiso de Informes consulte SU trabajo (p. ej. ver un
// informe compartido con él, ver app/api/reports/compartidos/*).
export function createJob(taskFn, ownerId = null) {
  const id = randomUUID();
  const job = { status: "pending", result: null, error: null, createdAt: Date.now(), ownerId };
  jobs.set(id, job);
  cleanupOld();

  taskFn()
    .then((result) => { job.status = "done"; job.result = result; })
    .catch((err) => { job.status = "error"; job.error = err.message || "Error desconocido."; });

  return id;
}

export function getJob(id) {
  return jobs.get(id) || null;
}
