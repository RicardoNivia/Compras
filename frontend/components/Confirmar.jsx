"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Regla de la app: NUNCA window.confirm / window.alert / window.prompt. Toda confirmación (sobre todo al eliminar o
// quitar algo) y todo aviso usan este modal con el estilo de la app.
//   const { confirmar, avisar } = useConfirmar();
//   if (!(await confirmar({ titulo: "Quitar participante", mensaje: "¿Quitar a X de la actividad?", boton: "Sí, quitar", peligro: true }))) return;
//   await avisar({ titulo: "No se pudo exportar", mensaje: e.message });
// El proveedor está montado en app/(app)/layout.js. Fuera de él (p. ej. una página pública) el hook cae al navegador
// solo como último recurso, para no romper.

const Ctx = createContext(null);

export function ConfirmarProvider({ children }) {
  const [pedido, setPedido] = useState(null); // { titulo, mensaje, detalle, boton, peligro, soloAviso, resolver }
  const abrir = useCallback((opciones, soloAviso) => new Promise((resolver) => setPedido({ ...opciones, soloAviso, resolver })), []);
  const confirmar = useCallback((o) => abrir(o, false), [abrir]);
  const avisar = useCallback((o) => abrir(o, true), [abrir]);
  const cerrar = (valor) => { pedido?.resolver(valor); setPedido(null); };
  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && <ModalConfirmar pedido={pedido} onRespuesta={cerrar} />}
    </Ctx.Provider>
  );
}

export function useConfirmar() {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    confirmar: async (o) => window.confirm(o?.mensaje || o?.titulo || "¿Continuar?"),
    avisar: async (o) => { window.alert(o?.mensaje || o?.titulo || ""); },
  };
}

function ModalConfirmar({ pedido, onRespuesta }) {
  const okRef = useRef(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onRespuesta(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onRespuesta]);
  const titulo = pedido.titulo || (pedido.soloAviso ? "Aviso" : "Confirmar");
  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onRespuesta(false); }}>
      <div className="modal confirmar-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h3 id="confirmar-titulo">{titulo}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={() => onRespuesta(false)} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          {pedido.mensaje && <p className="confirmar-mensaje">{pedido.mensaje}</p>}
          {pedido.detalle && <p className="count-note" style={{ margin: "6px 0 0" }}>{pedido.detalle}</p>}
        </div>
        <div className="modal-foot">
          {pedido.soloAviso ? (
            <button type="button" ref={okRef} className="btn btn-primary" onClick={() => onRespuesta(true)}>Entendido</button>
          ) : (
            <>
              <button type="button" ref={okRef} className={`btn ${pedido.peligro ? "btn-danger-solid" : "btn-primary"}`} onClick={() => onRespuesta(true)}>{pedido.boton || "Aceptar"}</button>
              <button type="button" className="btn" onClick={() => onRespuesta(false)}>Cancelar</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
