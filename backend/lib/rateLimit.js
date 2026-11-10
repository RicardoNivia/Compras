// Limitador de tasa simple en memoria (un solo proceso Node) para frenar
// fuerza bruta en /api/auth/login. Si el backend llega a correr en varias
// instancias sin estado compartido, esto deja de ser efectivo entre ellas y
// habría que moverlo a un store compartido (Redis, etc.) — por ahora es
// suficiente dado que `next start` corre como un único proceso.

const attempts = new Map(); // key -> { count, firstAttemptAt }

export function checkRateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAttemptAt > windowMs) {
    return { allowed: true };
  }
  if (entry.count >= max) {
    const retryAfterMs = windowMs - (now - entry.firstAttemptAt);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  return { allowed: true };
}

export function recordAttempt(key, { windowMs }) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAttemptAt > windowMs) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(key) {
  attempts.delete(key);
}
