"use client";

import { fmtMoneda } from "@/lib/moneda";
import { fechaSinAnio } from "@/components/tesoreria/comun";

// Conciliación bancaria contable: del saldo según el banco al saldo según libros (lo registrado), con las partidas que
// están en un lado y no en el otro. Lo que no explican las partidas es la «diferencia sin explicar» (faltante o sobrante).
// Libros = Banco + créditos en libros no en banco − débitos en libros no en banco − créditos del banco no en libros
//          + débitos del banco no en libros.
export function ConciliacionContable({ moneda = "COP", saldoBanco, saldoLibros, contable, sinExplicar, alTexto = "" }) {
  const $ = (v) => (v == null ? "—" : fmtMoneda(v, moneda));
  if (!contable) return null;
  const conciliado = saldoBanco == null ? null : saldoBanco + contable.creditosLibrosNoBanco - contable.debitosLibrosNoBanco - contable.creditosBancoNoLibros + contable.debitosBancoNoLibros;
  const fila = (signo, texto, valor, ayuda) => (
    <tr className={valor ? "" : "tes-cc-cero"}>
      <td className="tes-cc-signo">{signo}</td><td>{texto}{ayuda && <small>{ayuda}</small>}</td><td className="tes-num" style={{ textAlign: "right" }}>{$(valor)}</td>
    </tr>
  );
  const ok = sinExplicar != null && Math.abs(sinExplicar) < 1;
  return (
    <div className="tes-cc">
      <table className="tes-cc-tabla" aria-label="Conciliación bancaria">
        <tbody>
          <tr className="tes-cc-total"><td /><td>Saldo según el banco{alTexto}</td><td className="tes-num" style={{ textAlign: "right" }}>{$(saldoBanco)}</td></tr>
          {fila("+", "Créditos registrados que el banco no trae", contable.creditosLibrosNoBanco, "consignaciones en tránsito o ingresos de más")}
          {fila("−", "Débitos registrados que el banco no trae", contable.debitosLibrosNoBanco, "pagos que aún no cobra el banco o registrados de más")}
          {fila("−", "Créditos del banco que no están registrados", contable.creditosBancoNoLibros, "ingresos por registrar")}
          {fila("+", "Débitos del banco que no están registrados", contable.debitosBancoNoLibros, "comisiones, 4×1000, cobros por registrar")}
          <tr className="tes-cc-total"><td>=</td><td>Saldo conciliado</td><td className="tes-num" style={{ textAlign: "right" }}>{$(conciliado)}</td></tr>
          <tr className="tes-cc-total"><td /><td>Saldo según libros (lo registrado)</td><td className="tes-num" style={{ textAlign: "right" }}>{$(saldoLibros)}</td></tr>
          <tr className={`tes-cc-dif ${ok ? "ok" : "mal"}`}><td /><td><strong>{ok ? "Cuadra: las partidas explican toda la diferencia" : "Diferencia sin explicar"}</strong>{!ok && sinExplicar != null && <small>{sinExplicar > 0 ? "Tus libros tienen más plata de la que explican las partidas: posible faltante en el banco o un débito sin registrar." : "El banco tiene más de lo que explican las partidas: falta registrar un ingreso o sobra un débito."}</small>}</td><td className="tes-num" style={{ textAlign: "right" }}><strong>{$(sinExplicar)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

const TITULO = { inicial: "Viene del mes anterior", sobra: "Puede sobrar", tipoAlReves: "Tipo al revés", digitos: "Dígitos invertidos", duplicado: "Posible duplicado", falta: "Falta registrar", par: "Dos movimientos", sinExplicar: "Sin explicar" };
const ACCION = { eliminar: "Eliminarlo", cambiarTipo: "Cambiar el tipo", corregirValor: "Corregir el valor", registrar: "Registrarlo" };

// Dónde puede estar la diferencia: pistas ordenadas por confianza (verde alta, ámbar media, gris baja), cada una con la
// acción que la corrige; la persona la aprueba (onAccion) — nada se cambia solo.
export function PistasDiferencia({ pistas = [], moneda = "COP", onAccion, onVer, puede = true, ocupado = null }) {
  if (!pistas.length) return null;
  return (
    <div className="tes-pistas">
      <h4 className="tes-pistas-t">¿Dónde puede estar la diferencia?</h4>
      {pistas.map((p, i) => {
        const clave = `${p.tipo}-${p.movimiento?.id || p.clave || i}`;
        return (
          <div key={clave} className={`tes-posible conf-${p.confianza}`}>
            <div>
              <strong>{TITULO[p.tipo] || "Revisar"} <span className={`pill ${p.confianza === "alta" ? "good" : p.confianza === "media" ? "warning" : "muted"}`}>confianza {p.confianza}</span></strong>
              <small>{p.texto}</small>
              {p.movimiento && <small className="muted">{fechaSinAnio(p.movimiento.fecha)} · {p.movimiento.descripcion} · {fmtMoneda(p.movimiento.firmado, moneda)}{p.otro ? ` + ${fechaSinAnio(p.otro.fecha)} · ${p.otro.descripcion} · ${fmtMoneda(p.otro.firmado, moneda)}` : ""}</small>}
            </div>
            <div className="tes-pistas-acc">
              {p.movimiento && onVer && <button type="button" className="btn small" onClick={() => onVer(p.movimiento.id)}>Ver</button>}
              {puede && p.accion && onAccion && <button type="button" className="btn small btn-primary" disabled={ocupado === clave} onClick={() => onAccion(p, clave)}>{ocupado === clave ? <span className="spinner" /> : null} {ACCION[p.accion]}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
