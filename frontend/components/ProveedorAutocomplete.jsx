"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Autocompletar de proveedor sobre el catálogo (maestro) de Proveedores:
// el usuario busca por nombre o nit y SOLO puede elegir una opción del
// catálogo — no existe un modo "texto libre" que invente un proveedor con
// nit vacío. Si escribe algo que no coincide con ninguna opción, el texto se
// descarta al salir del campo y vuelve al último valor válido (ver
// closeAndResync) — si el proveedor que necesita no existe, debe pedir a
// alguien con permiso de Maestros que lo agregue antes de poder elegirlo.
// Un registro viejo cuyo proveedor no está en el catálogo (dato histórico,
// antes de que este maestro existiera) se muestra tal cual al abrir el
// modal y no se toca a menos que el usuario decida cambiarlo.
export default function ProveedorAutocomplete({ id, nombre, nit, proveedorNit, proveedores, disabled, required, onChange }) {
  // onChange recibe { nombre, nit, proveedorNit }: proveedorNit (NIT, llave primaria del Proveedor)
  // es la referencia real que se guarda en el registro; nit/nombre son solo
  // para mostrar — si luego se corrige el proveedor en el catálogo, la tabla
  // de Registros refleja el cambio sola (ver hydrateConDatosActuales en
  // backend/lib/records.js), sin tener que volver a elegirlo aquí.
  const [text, setText] = useState(nombre || "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  // Si cambia el registro cargado en el formulario (abrir otro, o limpiar al
  // crear), resincroniza el texto mostrado.
  useEffect(() => {
    setText(nombre || "");
  }, [nombre]);

  function closeAndResync() {
    setOpen(false);
    setText(nombre || "");
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) closeAndResync();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    const list = !q
      ? proveedores
      : proveedores.filter((p) => p.nombre.toLowerCase().includes(q) || (qDigits && p.nit.includes(qDigits)));
    return list.slice(0, 50);
  }, [proveedores, text]);

  function selectProveedor(p) {
    setText(p.nombre);
    setOpen(false);
    onChange({ nombre: p.nombre, nit: p.nit, proveedorNit: p.nit });
  }

  function clear() {
    setText("");
    setOpen(false);
    onChange({ nombre: "", nit: "", proveedorNit: null });
  }

  function handleInputChange(value) {
    setText(value);
    setHighlight(0);
    setOpen(true);
    // No se escribe en el formulario mientras se teclea — solo al elegir una
    // opción del catálogo (ver comentario de cabecera) o al limpiar (clear()).
  }

  function handleKeyDown(e) {
    if (e.key === "Backspace" && !text && (nombre || nit)) {
      clear();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlight]) selectProveedor(matches[highlight]);
    } else if (e.key === "Escape") {
      closeAndResync();
    }
  }

  const sinCoincidencias = open && text.trim() && matches.length === 0;

  // Alerta del ciclo de actualización (ver backend/lib/proveedoresCicloReglas.js
  // #alertaCompras) — solo informativa, nunca bloquea registrar la compra.
  const seleccionado = proveedorNit ? proveedores.find((p) => p.nit === proveedorNit) : null;

  return (
    <div className="autocomplete-wrap" ref={wrapRef}>
      <input
        id={id}
        value={text}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        required={required}
        placeholder="Escribe nombre o nit para buscar…"
        autoComplete="off"
        spellCheck
        lang="es"
      />
      {nit && <span className="autocomplete-nit-tag">Nit {nit}</span>}
      {seleccionado?.alerta && (
        <span
          className={`autocomplete-info-badge ${seleccionado.alerta.nivel === "ok" ? "ok" : "warn"}`}
          title={seleccionado.alerta.detalle || ""}
        >
          {seleccionado.alerta.titulo}
        </span>
      )}
      {open && !disabled && (
        <div className="autocomplete-menu">
          {matches.length === 0 ? (
            <div className="autocomplete-empty">
              {sinCoincidencias
                ? "No existe en el catálogo. Pide al equipo de Proveedores que lo registre."
                : "Escribe para buscar en el catálogo de proveedores."}
            </div>
          ) : (
            matches.map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={`autocomplete-item${i === highlight ? " active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); selectProveedor(p); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="autocomplete-item-nombre">{p.nombre}</span>
                <span className="autocomplete-item-nit">Nit {p.nit}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
