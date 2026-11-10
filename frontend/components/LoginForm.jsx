"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconCheck } from "@/components/icons";
import ContactAdminModal from "@/components/ContactAdminModal";

const FEATURES = [
  "Compras, proveedores y presupuesto al día",
  "Actividades de Bienestar y Fundación, con su asistencia y su costo",
  "Reportes y análisis de Nova en un clic",
];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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
        <div className="login-side-blob login-side-blob-1" />
        <div className="login-side-blob login-side-blob-2" />

        <div className="login-side-top">
          <div className="login-side-mark">S</div>
          <span className="login-side-brand">Sinco · Panel de Compras y Bienestar</span>
        </div>

        <div className="login-side-copy">
          <h1>Tus compras y el bienestar de tu gente, en un solo lugar.</h1>
          <p>Radica, legaliza y haz seguimiento a cada compra. Planea las actividades de Bienestar y Fundación, y mira cuánta gente participó y cuánto costó.</p>
        </div>

        <div className="login-side-features">
          {FEATURES.map((f) => (
            <div key={f} className="login-side-feature">
              <IconCheck size={12} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className="login-side-foot">Sinco ERP © 2026</div>
      </div>

      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="login-eyebrow">Bienvenido</span>
            <h2>Inicia sesión</h2>
            <p className="login-sub">Ingresa tus credenciales para continuar.</p>
          </div>

          <div className="field">
            <label htmlFor="login-email">Correo corporativo</label>
            <input
              id="login-email" type="email" autoComplete="username" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@example.com"
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

          <button
            type="button"
            className="btn-ghost"
            style={{ alignSelf: "flex-end", fontSize: 13 }}
            onClick={() => setShowForgotPassword(true)}
          >
            ¿Olvidaste tu contraseña?
          </button>

          {error && <div className="modal-error">{error}</div>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
            {loading ? <span className="spinner" /> : <IconArrowRight size={16} />}
          </button>

          <p className="login-foot-note">¿Problemas para ingresar? Contacta a tu administrador.</p>
        </form>
      </div>

      {showForgotPassword && (
        <ContactAdminModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}
