import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// Llama al backend (otro proceso Next.js) desde un Server Component,
// reenviando la cookie de sesión de la petición entrante — un fetch de
// servidor a servidor no la reenvía solo, aunque exista un rewrite.
export async function backendFetch(path, options = {}) {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      cookie: cookieHeader,
    },
    cache: "no-store",
  });
}
