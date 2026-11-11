"use client";

import EstadoVacio from "@/components/EstadoVacio";
import { useCallback, useEffect, useState } from "react";
import { tesSaldos, tesGuardarSaldoInicial, tesAlertas } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import MoneyInput from "@/components/MoneyInput";
import { Aviso, useAniosTesoreria, MESES, anioActual, BotonExcel, fechaCorta } from "@/components/tesoreria/comun";

const corto = (v) => (v == null ? "—" : Math.round(v).toLocaleString("es-CO"));

// Saldos de los bancos: el saldo inicial de enero por banco y año (lo digita la persona) es el punto de partida, y cada
// extracto que se sube lo ajusta: desde el saldo que reporta el banco se sigue con los movimientos posteriores
// (lib/tesoreria/saldos.js#reporteSaldos). La diferencia del mes compara lo registrado con lo que dijo el banco.
export default function SaldosTesoreria({ acceso }) {
  const aniosTes = useAniosTesoreria("movimientos"); // años anteriores solo si tienen datos
  const [anio, setAnio] = useState(anioActual());
  const [d, setD] = useState(null);
  const [valores, setValores] = useState({});
  const [sugerencias, setSugerencias] = useState([]);
  const [bancoVer, setBancoVer] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;

  const cargar = useCallback(async () => {
    try {
      const r = await tesSaldos(anio);
      setD(r);
      setValores(Object.fromEntries(r.iniciales.items.map((s) => [s.bancoId, s.valor == null ? "" : String(s.valor)])));
      setBancoVer((b) => b || r.reporte.items[0]?.bancoId || null);
      const al = await tesAlertas({ tipo: "saldoInicial", size: 50 }).catch(() => ({ items: [] }));
      setSugerencias(al.items);
      setError("");
    } catch (e) { setError(e.message); }
  }, [anio]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(bancoId) {
    setOcupado(bancoId); setError("");
    try { await tesGuardarSaldoInicial(bancoId, anio, valores[bancoId] === "" ? null : valores[bancoId]); setAviso("Saldo inicial guardado."); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  // Valor de una alerta de saldo del Excel («… por COP 6.820.392 …»).
  const valorDe = (msg) => { const m = String(msg).match(/COP\s?(-?[\d.]+)/); return m ? m[1].replace(/\./g, "") : ""; };
  const banco = d?.reporte.items.find((b) => b.bancoId === bancoVer);
  const rep = new Map((d?.reporte.items || []).map((b) => [b.bancoId, b]));
  const FUENTE = { banco: ["good", "Extracto del banco"], parcial: ["accent", "Extracto parcial"], calculado: ["muted", "Calculado"] };
  return (
    <div className="tes-vista">
      <div className="tes-cabecera">
        <div className="tes-seg" role="group" aria-label="Año">{[...new Set([...(aniosTes || []), anioActual(), anioActual() + 1])].filter((a) => a <= anioActual() + 1).sort((x, y) => x - y).map((a) => <button key={a} type="button" className={anio === a ? "on" : ""} onClick={() => setAnio(a)}>{a}</button>)}</div>
      </div>
      {error && <p className="modal-error">{error}</p>}
      {!d && <div className="card"><span className="spinner" /></div>}
      {d && (
        <div className="tes-dos">
          <div className="card">
            <div className="card-head"><div><h3>Saldo inicial de enero {anio}</h3><span className="card-sub">Uno por banco y año.</span></div></div>
            {!d.iniciales.items.length && <EstadoVacio compacto titulo="Todavía no hay bancos" accion={<a className="btn btn-primary small" href="/tesoreria/importar">Importar la plantilla</a>}>Créalos en Maestros o sube la plantilla de flujo de caja.</EstadoVacio>}
            {d.iniciales.items.map((s) => (
              <div key={s.bancoId} className="tes-tarea">
                <div><strong>{s.banco}</strong><small>{s.valor != null ? `Registrado por ${s.actualizadoPor || "—"}` : rep.get(s.bancoId)?.fuenteInicial === "banco" ? `Sin digitar: se usa el del banco, ${fmtMoneda(rep.get(s.bancoId).saldoInicial, s.moneda)}` : "Falta: digítalo o sube el extracto de enero"}</small></div>
                <div style={{ width: 210 }}><MoneyInput value={valores[s.bancoId] ?? ""} onChange={(x) => setValores((v) => ({ ...v, [s.bancoId]: x }))} prefix={s.moneda} decimales={2} permitirNegativo ariaLabel={`Saldo inicial de ${s.banco}`} disabled={!puede} /></div>
                {puede && <button type="button" className="btn small btn-primary" onClick={() => guardar(s.bancoId)} disabled={ocupado === s.bancoId || (valores[s.bancoId] ?? "") === (s.valor == null ? "" : String(s.valor))}>Guardar</button>}
              </div>
            ))}
            {puede && sugerencias.length > 0 && (
              <div className="tes-seccion" style={{ marginTop: 10 }}>
                <span className="card-sub" style={{ margin: 0 }}><strong>Saldos que trae el Excel</strong> (filas S de los pagos). Úsalos si corresponden:</span>
                {sugerencias.map((a) => (
                  <div key={a.id} className="tes-cand">
                    <div><small>{a.mensaje}</small></div>
                    {d.iniciales.items.map((s) => <button key={s.bancoId} type="button" className="btn small" onClick={() => setValores((v) => ({ ...v, [s.bancoId]: valorDe(a.mensaje) }))}>Usar en {s.banco}</button>)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Saldo {anio === anioActual() ? "hoy" : `final de ${anio}`}</h3><span className="card-sub">Parte del último saldo que reportó el banco y suma los movimientos registrados después. Se ajusta con cada extracto que subes.</span></div></div>
            {d.reporte.items.map((b) => {
              const v = anio === anioActual() ? b.saldoHoy : b.saldoFinal;
              const u = b.ultimoSaldoBanco;
              return (
                <div key={b.bancoId} className="tes-tarea">
                  <div><strong>{b.banco}</strong><small>{v == null ? "Sin saldo inicial ni extractos: no se puede calcular" : u ? `Banco al ${fechaCorta(u.dia)}: ${fmtMoneda(u.valor, b.moneda)}, más lo registrado después` : `Saldo inicial digitado ${corto(b.saldoInicial)} + ${corto(b.creditos)} − ${corto(b.debitos)} (aún sin extractos)`}</small></div>
                  <strong className="tes-num" style={{ fontSize: 16 }}>{v == null ? "—" : fmtMoneda(v, b.moneda)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {d && banco && (
        <div className="table-card">
          <div className="tes-cabecera" style={{ padding: "14px 16px 0" }}>
            <h3 style={{ margin: 0 }}>{banco.banco} mes a mes · {anio}</h3>
            <BotonExcel nombre={`tesoreria-saldos-${anio}`} hoja="Saldos" obtener={async () => d.reporte.items.flatMap((b) => b.meses.map((m) => ({ ...m, banco: b.banco, sinInicial: b.saldoInicial == null })))} columnas={[
              { t: "Banco", v: (m) => m.banco }, { t: "Mes", v: (m) => MESES[m.mes - 1] }, { t: "Saldo inicial", v: (m) => m.saldoInicial },
              { t: "Créditos (entra)", v: (m) => m.creditos }, { t: "Débitos (sale)", v: (m) => m.debitos }, { t: "Saldo final", v: (m) => m.saldoFinal },
              { t: "De dónde sale", v: (m) => (m.fuente ? FUENTE[m.fuente][1] : null) }, { t: "Según el banco", v: (m) => m.reportado }, { t: "Al día", v: (m) => m.reportadoAl },
              { t: "Lo registrado daba", v: (m) => m.calculado }, { t: "Diferencia", v: (m) => m.diferencia }, { t: "Movimientos", v: (m) => m.movimientos },
            ]} etiqueta="Exportar todos los bancos" />
            <div className="spacer" />
            <div className="tes-seg">{d.reporte.items.map((b) => <button key={b.bancoId} type="button" className={b.bancoId === bancoVer ? "on" : ""} onClick={() => setBancoVer(b.bancoId)}>{b.banco}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table className="records tes-tabla">
              <thead><tr><th>Mes</th><th style={{ textAlign: "right" }}>Saldo inicial</th><th style={{ textAlign: "right" }}>Créditos (entra)</th><th style={{ textAlign: "right" }}>Débitos (sale)</th><th style={{ textAlign: "right" }}>Saldo final</th><th>De dónde sale</th><th style={{ textAlign: "right" }}>Según el banco</th><th style={{ textAlign: "right" }} title="Lo registrado (desde el saldo anterior del banco) menos lo que dijo el banco">Diferencia</th><th style={{ textAlign: "right" }}>Movimientos</th></tr></thead>
              <tbody>
                {banco.meses.map((m) => (
                  <tr key={m.mes}>
                    <td><strong>{MESES[m.mes - 1]}</strong></td>
                    <td style={{ textAlign: "right" }} className="tes-num">{corto(m.saldoInicial)}</td>
                    <td style={{ textAlign: "right" }} className="tes-num tes-pos">{m.creditos ? corto(m.creditos) : "—"}</td>
                    <td style={{ textAlign: "right" }} className="tes-num tes-neg">{m.debitos ? corto(m.debitos) : "—"}</td>
                    <td style={{ textAlign: "right" }} className="tes-num"><strong>{corto(m.saldoFinal)}</strong></td>
                    <td>{m.fuente ? <span className={`pill ${FUENTE[m.fuente][0]}`} title={m.fuente === "calculado" ? "Último saldo del banco + movimientos registrados" : "Saldo que reportó el banco en el extracto"}>{FUENTE[m.fuente][1]}{m.fuente === "parcial" && m.reportadoAl ? ` al ${Number(m.reportadoAl.slice(8))}` : ""}</span> : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }} className="tes-num">{corto(m.reportado)}{m.reportadoAl && <small className="muted"> al {Number(m.reportadoAl.slice(8))}</small>}</td>
                    <td style={{ textAlign: "right" }}>{m.diferencia == null ? <span className="muted">—</span> : Math.abs(m.diferencia) < 1 ? <span className="pill good">Cuadra</span> : <span className="pill warning tes-num" title={`Lo registrado daba ${corto(m.calculado)}; el banco dijo ${corto(m.reportado)}. Falta registrar o sobra algún movimiento.`}>{corto(m.diferencia)}</span>}</td>
                    <td style={{ textAlign: "right" }} className="tes-num">{m.movimientos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {banco.saldoInicial == null && !banco.ultimoSaldoBanco && <p className="card-sub" style={{ padding: "0 16px 14px", margin: 0 }}>Digita el saldo inicial de enero de {banco.banco} o sube un extracto para ver sus saldos.</p>}
          {(banco.saldoInicial != null || banco.ultimoSaldoBanco) && <p className="card-sub" style={{ padding: "0 16px 14px", margin: 0 }}>Cada extracto que subes (mensual o parcial) fija el saldo de ese día al que dice el banco, y los meses siguientes parten de ahí. La diferencia muestra cuánto se alejaba lo registrado de lo que dijo el banco.</p>}
        </div>
      )}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
