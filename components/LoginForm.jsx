"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-side">
        <div className="login-side-mark">S</div>
        <h1>Sinco · Compras</h1>
        <p>Panel de gestión y seguimiento de solicitudes de compra.</p>
      </div>
      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Iniciar sesión</h2>
          <p className="login-sub">Ingresa tus credenciales para continuar.</p>

          <div className="field">
            <label htmlFor="login-email">Correo</label>
            <input
              id="login-email" type="email" autoComplete="username" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@sinco.com.co"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Contraseña</label>
            <input
              id="login-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="modal-error">{error}</div>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
