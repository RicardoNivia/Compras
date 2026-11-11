"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EstadoVacio from "@/components/EstadoVacio";
import MoneyInput from "@/components/MoneyInput";
import { tesSaldos, tesGuardarSaldoInicial, tesAlertas } from "@/lib/tesoreriaApi";
import { fmtMoneda, fmtMonedaCorta } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { IconCheck, IconAlert, IconClock, IconDownload } from "@/components/icons";
import { Aviso, useAniosTesoreria, useCatalogos, MESES, MESES_CORTOS, anioActual, mesActual, BotonExcel, fechaCorta } from "@/components/tesoreria/comun";
import { ExtractoModal } from "@/components/tesoreria/MovimientoModales";

// Estado de cada mes de cada cuenta (lib/tesoreria/saldos.js#reporteSaldos → meses[].estado).
const ESTADOS = {
  confirmado: { cls: "ok", txt: "Confirmado con extracto", corto: "Confirmado" },
  diferencia: { cls: "mal", txt: "Con extracto, pero no cuadra", corto: "No cuadra" },
  parcial: { cls: "parcial", txt: "Extracto hasta un día del mes", corto: "Parcial" },
  estimado: { cls: "estim", txt: "Estimado: falta el extracto", corto: "Estimado" },
  sinDatos: { cls: "vacio", txt: "Sin datos", corto: "—" },
  futuro: { cls: "futuro", txt: "Aún no llega", corto: "" },
};

// Saldos de las cuentas, pensado para que se entienda sin explicación: un saldo solo es REAL si lo confirma el extracto
// del banco. Arriba, cada cuenta con su saldo de hoy y si está confirmado o qué extracto falta. En el centro, el mapa
// cuenta × mes: cada casilla es el saldo con que terminó el mes y su color dice si está confirmado, no cuadra o es una
// estimación. Al tocar una casilla se explica el mes en palabras: con cuánto empezó (y de dónde sale), cuánto entró y
// salió, con cuánto terminó y qué dice el banco. El saldo inicial del año queda al final: solo hace falta si no hay
// extracto de diciembre del año anterior.
export default function SaldosTesoreria({ acceso }) {
  const aniosTes = useAniosTesoreria("saldos"); // años anteriores solo si tienen algún saldo (extracto o saldo inicial)
  const { cat, recargar: recargarCat } = useCatalogos();
  const [anio, setAnio] = useState(anioActual());
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null); // { bancoId, mes }
  const [valores, setValores] = useState({});
  const [sugerencias, setSugerencias] = useState([]);
  const [abrirInicial, setAbrirInicial] = useState(false);
  const [extracto, setExtracto] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;
  const esteAnio = anio === anioActual();

  const cargar = useCallback(async () => {
    try {
      const r = await tesSaldos(anio);
      setD(r);
      setValores(Object.fromEntries(r.iniciales.items.map((s) => [s.bancoId, s.valor == null ? "" : String(s.valor)])));
      // Casilla elegida por defecto: el último mes con datos (hasta el mes actual) de la primera cuenta con datos.
      setSel((x) => {
        if (x && r.reporte.items.some((b) => b.bancoId === x.bancoId)) return x;
        const b = r.reporte.items.find((y) => y.meses.some((m) => m.estado !== "sinDatos" && m.estado !== "futuro")) || r.reporte.items[0];
        if (!b) return null;
        const tope = esteAnio ? mesActual() : 12;
        const m = [...b.meses].reverse().find((y) => y.mes <= tope && y.estado !== "sinDatos" && y.estado !== "futuro");
        return { bancoId: b.bancoId, mes: m?.mes || tope };
      });
      const al = await tesAlertas({ tipo: "saldoInicial", size: 50 }).catch(() => ({ items: [] }));
      setSugerencias(al.items);
      setError("");
    } catch (e) { setError(e.message); }
  }, [anio, esteAnio]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(bancoId) {
    setOcupado(bancoId); setError("");
    try { await tesGuardarSaldoInicial(bancoId, anio, valores[bancoId] === "" ? null : valores[bancoId]); setAviso("Saldo inicial guardado."); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  const valorDe = (msg) => { const m = String(msg).match(/COP\s?(-?[\d.]+)/); return m ? m[1].replace(/\./g, "") : ""; };

  const bancos = useMemo(() => d?.reporte.items || [], [d]);
  // Estado de cada cuenta hoy: confirmado si los meses cerrados después del último extracto no faltan; si no, cuáles faltan.
  const resumen = useMemo(() => bancos.map((b) => {
    const tope = esteAnio ? mesActual() - 1 : 12; // último mes ya cerrado
    const cerrados = b.meses.filter((m) => m.mes <= tope && m.estado !== "sinDatos");
    const ultimo = b.ultimoSaldoBanco?.dia || null;
    const faltanDespues = cerrados.filter((m) => m.estado === "estimado" && (!ultimo || `${anio}-${String(m.mes).padStart(2, "0")}` > ultimo.slice(0, 7))).map((m) => m.mes);
    const saldo = esteAnio ? b.saldoHoy : b.saldoFinal;
    const conDif = cerrados.filter((m) => m.estado === "diferencia").map((m) => m.mes);
    const estadoCuenta = saldo == null ? "sinDatos" : !ultimo ? "sinExtracto" : faltanDespues.length ? "falta" : "confirmado";
    return { ...b, saldo, ultimo, estadoCuenta, faltanDespues, conDif };
  }), [bancos, esteAnio, anio]);
  const totalHoy = resumen.filter((b) => b.saldo != null).reduce((s, b) => s + b.saldo, 0);
  const totalConfirmado = resumen.length > 0 && resumen.every((b) => b.estadoCuenta === "confirmado");

  const bSel = bancos.find((b) => b.bancoId === sel?.bancoId);
  const mSel = bSel?.meses.find((m) => m.mes === sel?.mes);
  const mesAnteriorNombre = sel ? (sel.mes === 1 ? `diciembre de ${anio - 1}` : MESES[sel.mes - 2].toLowerCase()) : "";
  const inicioTexto = (m) => {
    if (!m || m.saldoInicial == null) return "No se puede saber: falta el saldo inicial o un extracto.";
    if (m.inicioFuente === "extracto") return `Sale del extracto del banco (cierre de ${mesAnteriorNombre}).`;
    if (m.inicioFuente === "digitado") return "Es el saldo inicial del año que digitaste.";
    return `Estimado: último saldo conocido${m.inicioDesde ? ` (${fechaCorta(m.inicioDesde)})` : ""} ± los movimientos registrados.`;
  };

  return (
    <div className="tes-vista sb">
      <div className="tes-cabecera">
        <div className="tes-seg" role="group" aria-label="Año">{[...new Set([...(aniosTes || []), anioActual()])].filter((a) => a <= anioActual()).sort((x, y) => x - y).map((a) => <button key={a} type="button" className={anio === a ? "on" : ""} onClick={() => crossfade(() => { setAnio(a); setSel(null); })}>{a}</button>)}</div>
        <span className="card-sub" style={{ margin: 0 }}>Un saldo solo es real cuando lo confirma el extracto del banco.</span>
        <div className="spacer" />
        {d && <BotonExcel nombre={`tesoreria-saldos-${anio}`} hoja="Saldos" filas={bancos.flatMap((b) => b.meses.map((m) => ({ ...m, banco: b.banco })))} columnas={[
          { t: "Cuenta", v: (m) => m.banco }, { t: "Mes", v: (m) => MESES[m.mes - 1] }, { t: "Estado", v: (m) => ESTADOS[m.estado]?.txt },
          { t: "Empezó con", v: (m) => m.saldoInicial }, { t: "De dónde sale", v: (m) => ({ extracto: "Extracto del banco", digitado: "Saldo inicial digitado", estimado: "Estimado" })[m.inicioFuente] || "" },
          { t: "Entró", v: (m) => m.creditos }, { t: "Salió", v: (m) => -m.debitos }, { t: "Terminó en", v: (m) => m.saldoFinal },
          { t: "El banco dice", v: (m) => m.reportado }, { t: "Diferencia", v: (m) => m.diferencia }, { t: "Movimientos", v: (m) => m.movimientos },
        ]} />}
      </div>
      {error && <p className="modal-error">{error}</p>}
      {!d && <div className="card"><span className="spinner" /></div>}
      {d && !bancos.length && <div className="card"><EstadoVacio titulo="Todavía no hay cuentas" accion={<Link className="btn btn-primary" href="/tesoreria/importar">Importar la plantilla</Link>}>Crea las cuentas en Maestros o importa la plantilla de flujo de caja.</EstadoVacio></div>}

      {d && bancos.length > 0 && (
        <>
          {/* 1. Cada cuenta hoy */}
          <section className="sb-cuentas" aria-label="Saldo de cada cuenta">
            <div className={`sb-total ${totalConfirmado ? "ok" : "est"}`}>
              <span>{esteAnio ? "Total en bancos hoy" : `Total al cierre de ${anio}`}</span>
              <strong className="tes-num">{resumen.some((b) => b.saldo != null) ? fmtMoneda(totalHoy, "COP") : "—"}</strong>
              <small>{totalConfirmado ? <><IconCheck size={12} /> Todas las cuentas confirmadas con extracto</> : <><IconAlert size={12} /> No es un saldo real: hay cuentas sin el extracto del último mes</>}</small>
            </div>
            {resumen.map((b) => (
              <div key={b.bancoId} className={`sb-cuenta ${b.estadoCuenta}`}>
                <div className="sb-cuenta-top"><strong>{b.banco}</strong>
                  <span className={`pill ${b.estadoCuenta === "confirmado" ? "good" : b.estadoCuenta === "sinDatos" ? "muted" : "warning"}`}>{b.estadoCuenta === "confirmado" ? <><IconCheck size={10} /> Confirmado</> : b.estadoCuenta === "sinDatos" ? "Sin datos" : <><IconClock size={10} /> Sin confirmar</>}</span>
                </div>
                <span className={`sb-cuenta-v tes-num${b.saldo != null && b.saldo < 0 ? " tes-neg" : ""}`}>{b.saldo == null ? "—" : fmtMoneda(b.saldo, b.moneda)}</span>
                <small>
                  {b.estadoCuenta === "sinDatos" ? "Falta el saldo inicial del año o un extracto para calcularlo."
                    : b.estadoCuenta === "sinExtracto" ? "Nunca se ha subido un extracto: es solo una estimación con lo registrado."
                      : b.estadoCuenta === "falta" ? <span>Último extracto: <b>{fechaCorta(b.ultimo)}</b>. Falta el de <b>{b.faltanDespues.map((m) => MESES[m - 1].toLowerCase()).join(", ")}</b>.</span>
                        : <span>Confirmado con el extracto al <b>{fechaCorta(b.ultimo)}</b>{esteAnio ? "; de ahí a hoy, más y menos lo registrado." : "."}</span>}
                  {b.conDif.length > 0 && <span className="tes-neg">No cuadra en {b.conDif.map((m) => MESES_CORTOS[m - 1]).join(", ")}.</span>}
                </small>
                {puede && cat && b.estadoCuenta !== "confirmado" && <button type="button" className="btn small" onClick={() => setExtracto({ bancoId: b.bancoId })}><IconDownload size={12} style={{ transform: "rotate(180deg)" }} /> Subir extracto</button>}
              </div>
            ))}
          </section>

          {/* 2. Mapa cuenta × mes */}
          <section className="card sb-mapa">
            <div className="card-head"><div><h3>Mes a mes, ¿con cuánto terminó cada cuenta?</h3><span className="card-sub">Toca una casilla para ver el mes explicado.</span></div></div>
            <div className="sb-leyenda">
              {["confirmado", "diferencia", "parcial", "estimado", "futuro"].map((k) => <span key={k} className={`sb-ley ${ESTADOS[k].cls}`}><i />{ESTADOS[k].txt}</span>)}
            </div>
            <div className="sb-grid-scroll">
              <table className="sb-grid">
                <thead><tr><th>Cuenta</th>{MESES_CORTOS.map((m, i) => <th key={m} className={esteAnio && i + 1 === mesActual() ? "hoy" : ""}>{m}</th>)}</tr></thead>
                <tbody>
                  {bancos.map((b) => (
                    <tr key={b.bancoId}>
                      <th scope="row">{b.banco}</th>
                      {b.meses.map((m) => {
                        const e = ESTADOS[m.estado] || ESTADOS.sinDatos;
                        const on = sel?.bancoId === b.bancoId && sel?.mes === m.mes;
                        return (
                          <td key={m.mes}>
                            <button type="button" className={`sb-celda ${e.cls}${on ? " on" : ""}`} disabled={m.estado === "futuro" || m.estado === "sinDatos"} onClick={() => crossfade(() => setSel({ bancoId: b.bancoId, mes: m.mes }))}
                              title={`${b.banco} · ${MESES[m.mes - 1]}: ${e.txt}${m.saldoFinal != null ? ` · terminó en ${fmtMoneda(m.saldoFinal, b.moneda)}` : ""}`}>
                              <span className="tes-num">{m.saldoFinal != null && m.estado !== "futuro" && m.estado !== "sinDatos" ? fmtMonedaCorta(m.saldoFinal, b.moneda).replace("COP", "").trim() : ""}</span>
                              <small>{e.corto}</small>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. El mes explicado */}
          {bSel && mSel && (
            <section className={`card sb-detalle ${ESTADOS[mSel.estado]?.cls || ""}`} aria-live="polite">
              <div className="card-head">
                <div><h3>{bSel.banco} · {MESES[mSel.mes - 1]} {anio}</h3><span className="card-sub">{mSel.movimientos} movimiento(s) registrados en el mes.</span></div>
                <span className={`pill ${mSel.estado === "confirmado" ? "good" : mSel.estado === "diferencia" ? "critical" : mSel.estado === "parcial" ? "accent" : "warning"}`}>{ESTADOS[mSel.estado]?.txt}</span>
              </div>
              <div className="sb-cuenta-mes">
                <div className="sb-paso"><span>Empezó con</span><strong className="tes-num">{mSel.saldoInicial == null ? "—" : fmtMoneda(mSel.saldoInicial, bSel.moneda)}</strong><small>{inicioTexto(mSel)}</small></div>
                <b className="sb-op">+</b>
                <div className="sb-paso"><span>Entró</span><strong className="tes-num tes-pos">{fmtMoneda(mSel.creditos, bSel.moneda)}</strong><small>créditos registrados</small></div>
                <b className="sb-op">−</b>
                <div className="sb-paso"><span>Salió</span><strong className="tes-num tes-neg">{fmtMoneda(mSel.debitos, bSel.moneda)}</strong><small>débitos registrados</small></div>
                <b className="sb-op">=</b>
                <div className="sb-paso fuerte"><span>Terminó en</span><strong className="tes-num">{mSel.saldoFinal == null ? "—" : fmtMoneda(mSel.saldoFinal, bSel.moneda)}</strong><small>{mSel.fuente === "banco" ? "el que dice el banco" : mSel.fuente === "parcial" ? `el banco al ${fechaCorta(mSel.reportadoAl)} + lo registrado después` : "estimado con lo registrado"}</small></div>
              </div>
              {mSel.estado === "confirmado" && <div className="tes-resultado ok"><IconCheck size={18} /><div><strong>Saldo real.</strong> El extracto del banco confirma {fmtMoneda(mSel.saldoFinal, bSel.moneda)} al cierre de {MESES[mSel.mes - 1].toLowerCase()}.</div></div>}
              {mSel.estado === "diferencia" && <div className="tes-resultado mal"><IconAlert size={18} /><div><strong>El banco dice {fmtMoneda(mSel.reportado, bSel.moneda)}{mSel.reportadoAl ? ` al ${fechaCorta(mSel.reportadoAl)}` : ""} y lo registrado daba {fmtMoneda(mSel.calculado, bSel.moneda)}: diferencia de {fmtMoneda(mSel.diferencia, bSel.moneda)}.</strong> Falta o sobra algún movimiento; el saldo que se usa es el del banco. En Conciliación verás qué falta y dónde puede estar.</div></div>}
              {mSel.estado === "parcial" && <div className="tes-resultado aviso"><IconClock size={18} /><div><strong>Confirmado solo hasta el {fechaCorta(mSel.reportadoAl)}</strong> (extracto parcial). Lo que va después es estimado hasta subir el extracto completo del mes.</div></div>}
              {mSel.estado === "estimado" && <div className="tes-resultado aviso"><IconAlert size={18} /><div><strong>No se puede conocer el saldo real de {MESES[mSel.mes - 1].toLowerCase()}: falta el extracto.</strong> {mSel.saldoFinal == null ? "" : `${fmtMoneda(mSel.saldoFinal, bSel.moneda)} es una estimación (con cuánto empezó ± lo registrado).`} Sube el extracto del banco para confirmarlo.</div></div>}
              <div className="tes-cabecera">
                {puede && cat && mSel.estado !== "confirmado" && <button type="button" className="btn btn-primary" onClick={() => setExtracto({ bancoId: bSel.bancoId })}>Subir extracto de {MESES[mSel.mes - 1].toLowerCase()}</button>}
                <Link className="btn" href={`/tesoreria/conciliacion?anio=${anio}&mes=${mSel.mes}&bancoId=${bSel.bancoId}`}>Conciliar este mes</Link>
                <Link className="btn" href={`/tesoreria/movimientos?anio=${anio}`}>Ver movimientos</Link>
              </div>
            </section>
          )}

          {/* 4. Saldo inicial del año (solo si no hay extracto de diciembre anterior) */}
          <section className="card sb-inicial">
            <button type="button" className="sb-inicial-cab" aria-expanded={abrirInicial} onClick={() => setAbrirInicial((v) => !v)}>
              <div><h3>Saldo inicial de {anio}</h3><span className="card-sub">Solo hace falta si una cuenta no tiene el extracto de diciembre de {anio - 1}: es el punto de partida para estimar.</span></div>
              <span className="sb-inicial-estado">{bancos.map((b) => <span key={b.bancoId} className={`pill ${b.fuenteInicial ? "good" : "muted"}`}>{b.banco}: {b.fuenteInicial === "digitado" ? "digitado" : b.fuenteInicial === "banco" ? "del extracto" : b.fuenteInicial === "calculado" ? "calculado" : "falta"}</span>)}</span>
              <span aria-hidden="true">{abrirInicial ? "▴" : "▾"}</span>
            </button>
            {abrirInicial && (
              <div className="sb-inicial-cuerpo">
                {d.iniciales.items.map((s) => {
                  const b = bancos.find((x) => x.bancoId === s.bancoId);
                  return (
                    <div key={s.bancoId} className="tes-tarea">
                      <div><strong>{s.banco}</strong><small>{s.valor != null ? `Digitado por ${s.actualizadoPor || "—"}` : b?.fuenteInicial === "banco" ? `No hace falta: se usa el saldo de diciembre del extracto (${fmtMoneda(b.saldoInicial, s.moneda)})` : b?.fuenteInicial === "calculado" ? `Calculado hacia atrás desde el extracto del ${fechaCorta(b.inicialDesde)} (${fmtMoneda(b.saldoInicial, s.moneda)})` : "Falta: digítalo o sube un extracto"}</small></div>
                      <div style={{ width: 210 }}><MoneyInput value={valores[s.bancoId] ?? ""} onChange={(x) => setValores((v) => ({ ...v, [s.bancoId]: x }))} prefix={s.moneda} decimales={2} permitirNegativo ariaLabel={`Saldo inicial de ${s.banco}`} disabled={!puede} /></div>
                      {puede && <button type="button" className="btn small btn-primary" onClick={() => guardar(s.bancoId)} disabled={ocupado === s.bancoId || (valores[s.bancoId] ?? "") === (s.valor == null ? "" : String(s.valor))}>Guardar</button>}
                    </div>
                  );
                })}
                {puede && sugerencias.length > 0 && (
                  <div className="tes-seccion">
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
            )}
          </section>
        </>
      )}
      {extracto && cat && <ExtractoModal cat={cat} bancoId={extracto.bancoId} onClose={() => setExtracto(null)} onListo={(msg) => { setExtracto(null); setAviso(msg); cargar(); recargarCat(); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
