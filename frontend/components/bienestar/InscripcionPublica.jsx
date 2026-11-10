"use client";

import { Bloque } from "@/components/bienestar/Esqueletos";
import { useEffect, useState } from "react";
import { fetchFormularioPublicoApi, inscribirPublicoApi } from "@/lib/api";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso) => (iso ? `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : "");

// Formulario público de inscripción (reemplaza Microsoft Forms). Pide nombre, documento, área, los campos propios de
// la actividad y la autorización de tratamiento de datos (Ley 1581 de 2012), obligatoria para inscribirse.
export default function InscripcionPublica({ token }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState({});
  const [base, setBase] = useState({ nombre: "", documento: "", area: "", correo: "", observacion: "" });
  const [autoriza, setAutoriza] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    fetchFormularioPublicoApi(token).then((r) => setForm(r.formulario)).catch((e) => setError(e.message || "Este formulario no está disponible."));
  }, [token]);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    if (!autoriza) return setError("Debes autorizar el tratamiento de tus datos personales para inscribirte.");
    setEnviando(true);
    try {
      const r = await inscribirPublicoApi(token, { ...base, datos, autorizaDatos: true });
      setListo(r.actividad);
    } catch (err) {
      setError(err.message || "No se pudo enviar tu inscripción.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="inscripcion">
      <div className="inscripcion-card">
        <div className="inscripcion-marca"><span>S</span> Bienestar Sinco{form?.linea === "Fundación" ? " · Fundación" : ""}</div>
        {!form && !error && <div className="esq" role="status" aria-busy="true" aria-label="Cargando el formulario"><Bloque w="70%" h={24} /><Bloque h={11} /><Bloque h={42} r={10} /><Bloque h={42} r={10} /><Bloque h={42} r={10} /></div>}
        {!form && error && (
          <>
            <h1>Formulario no disponible</h1>
            <p className="inscripcion-texto">{error}</p>
          </>
        )}
        {form && listo && (
          <div className="inscripcion-listo" role="status">
            <h1>¡Quedaste inscrito!</h1>
            <p className="inscripcion-texto">Te esperamos en <strong>{listo}</strong>{form.fecha ? ` el ${fechaLarga(form.fecha)}` : ""}.</p>
          </div>
        )}
        {form && !listo && (
          <form onSubmit={enviar} className="inscripcion-form">
            <h1>{form.nombre}</h1>
            {form.fecha && <p className="inscripcion-fecha">{fechaLarga(form.fecha)}</p>}
            {form.descripcion && <p className="inscripcion-texto">{form.descripcion}</p>}

            <label htmlFor="in-nombre">Nombre completo *</label>
            <input id="in-nombre" required autoComplete="name" value={base.nombre} onChange={(e) => setBase({ ...base, nombre: e.target.value })} />
            <label htmlFor="in-doc">Número de documento *</label>
            <input id="in-doc" required inputMode="numeric" value={base.documento} onChange={(e) => setBase({ ...base, documento: e.target.value })} />
            <label htmlFor="in-area">Área *</label>
            <select id="in-area" required value={base.area} onChange={(e) => setBase({ ...base, area: e.target.value })}>
              <option value="">Elige tu área</option>
              {(form.areas || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <label htmlFor="in-correo">Correo (opcional)</label>
            <input id="in-correo" type="email" autoComplete="email" value={base.correo} onChange={(e) => setBase({ ...base, correo: e.target.value })} />

            {form.campos.map((c) => (
              <div key={c.clave} className="inscripcion-campo">
                <label htmlFor={`in-${c.clave}`}>{c.etiqueta}{c.obligatorio ? " *" : ""}</label>
                {c.tipo === "opcion" ? (
                  <select id={`in-${c.clave}`} required={c.obligatorio} value={datos[c.clave] || ""} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })}>
                    <option value="">Elige…</option>
                    {(c.opciones || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : c.tipo === "si_no" ? (
                  <select id={`in-${c.clave}`} required={c.obligatorio} value={datos[c.clave] || ""} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })}>
                    <option value="">Elige…</option><option value="Sí">Sí</option><option value="No">No</option>
                  </select>
                ) : c.tipo === "parrafo" ? (
                  <textarea id={`in-${c.clave}`} rows={3} required={c.obligatorio} value={datos[c.clave] || ""} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })} />
                ) : (
                  <input id={`in-${c.clave}`} type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"} min={c.tipo === "numero" ? 0 : undefined} required={c.obligatorio} value={datos[c.clave] || ""} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })} />
                )}
              </div>
            ))}

            <label htmlFor="in-obs">Observaciones</label>
            <textarea id="in-obs" rows={2} value={base.observacion} onChange={(e) => setBase({ ...base, observacion: e.target.value })} />

            <label htmlFor="in-autoriza" className="inscripcion-autoriza">
              <span>Autorizo a Sincosoft S.A.S. el tratamiento de mis datos personales (y los de mis acompañantes o hijos, si los incluyo), incluidos los datos sensibles que entregue en este formulario, para organizar esta actividad, conforme a la Ley 1581 de 2012 y su política de tratamiento de datos. *</span>
              <input id="in-autoriza" type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} />
            </label>

            {error && <p className="inscripcion-error" role="alert">{error}</p>}
            <button type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Inscribirme"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
