import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Cifrado de los tokens de Microsoft que se guardan en la BD (CuentaCorreo.accessToken / refreshToken): AES-256-GCM.
// La clave sale de CORREO_CLAVE_CIFRADO (recomendada en producción) o, si no está, de SESSION_SECRET: cambiar esa
// variable deja ilegibles los tokens guardados y cada persona tendría que volver a vincular su correo.
// Formato guardado: "v1.<iv>.<tag>.<cifrado>" en base64url.

function clave() {
  const base = process.env.CORREO_CLAVE_CIFRADO || process.env.SESSION_SECRET || "dev-secret-change-me";
  return createHash("sha256").update(`correo|${base}`).digest();
}

export function cifrar(texto) {
  if (texto == null) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}

// Devuelve null si no se puede descifrar (clave cambiada o dato dañado): la cuenta queda para volver a vincular.
export function descifrar(guardado) {
  if (!guardado) return null;
  try {
    const [v, iv, tag, datos] = String(guardado).split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
