"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { tesConciliacionMes, tesConciliacionBanco, tesVerificarMovimiento, tesFirmarCierre, tesReabrirCierre, tesResolverPendiente, tesBorrarMovimiento, tesEditarMovimiento } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { IconCheck, IconAlert, IconSpark } from "@/components/icons";
import { BotonExcel, useAniosTesoreria, useCatalogos, Aviso, Modal, MESES, MESES_CORTOS, anioActual, mesActual, fechaCorta, fechaSinAnio } from "@/components/tesoreria/comun";
import { DetalleMovimientoModal, ExtractoModal } from "@/components/tesoreria/MovimientoModales";
import { ConciliacionContable, PistasDiferencia } from "@/components/tesoreria/ConciliacionContable";

const PAGE = 10;
// Cómo se ve cada estado de un banco: [clase de píldora, texto corto, ícono ok]
const ESTADO = {
  cuadra: ["good", "Cuadra con el banco", true],
  diferencia: ["critical", "No cuadra", false],
  sinSaldoBanco: ["warning", "Falta el extracto", false],
  sinSaldoInicial: ["warning", "Falta el saldo inicial", false],
  sinMovimientos: ["muted", "Sin movimientos", true],
};
const COP = (v, m = "COP") => (v == null ? "—" : fmtMoneda(v, m));

function Paso({ n, titulo, listo, estadoTexto, children, explica }) {
  return (
    <section className={`card tes-paso${listo ? " listo" : ""}`} aria-label={titulo}>
      <div className="tes-paso-cab">
        <span className="tes-paso-n" aria-hidden="true">{listo ? <IconCheck size={16} /> : n}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ margin: 0 }}>{titulo}</h3>
          {explica && <span className="card-sub" style={{ margin: 0 }}>{explica}</span>}
        </div>
        <span className={`pill ${listo ? "good" : "warning"}`}>{estadoTexto || (listo ? "Listo" : "Por revisar")}</span>
      </div>
      <div className="tes-paso-cuerpo">{children}</div>
    </section>
  );
}

// Lista corta paginada (10) para los pasos.
function Paginita({ total, page, onPage }) {
  const paginas = Math.max(1, Math.ceil(total / PAGE));
  if (total <= PAGE) return null;
  return (
    <div className="table-footer">
      <div className="page-btns"><button type="button" className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><button type="button" className="btn small" disabled={page >= paginas} onClick={() => onPage(page + 1)}>Siguiente</button></div>
      <span className="count-note">Página {Math.min(page, paginas)} de {paginas}</span><div className="spacer" /><span className="count-note">{total} en total</span>
    </div>
  );
}

// Conciliación: por mes y banco, en 4 pasos con preguntas simples. Cada paso dice qué falta y lleva a resolverlo.
export default function ConciliacionTesoreria({ acceso }) {
  const aniosTes = useAniosTesoreria("movimientos"); // años anteriores solo si tienen datos
  const params = useSearchParams();
  const { cat } = useCatalogos();
  const [anio, setAnio] = useState(Number(params.get("anio")) || anioActual());
  const [mes, setMes] = useState(Number(params.get("mes")) || (mesActual() === 1 ? 12 : mesActual() - 1));
  const [mesData, setMesData] = useState(null);
  const [bancoId, setBancoId] = useState(Number(params.get("bancoId")) || null);
  const [d, setD] = useState(null);
  const [pVer, setPVer] = useState(1);
  const [pNo, setPNo] = useState(1);
  const [pFal, setPFal] = useState(1);
  const [confirmar, setConfirmar] = useState(null); // { titulo, texto, boton, fn, msg }
  const [modal, setModal] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;
  const firma = !!acceso?.puedeFirmar;

  const cargarMes = useCallback(async () => {
    try {
      const r = await tesConciliacionMes(anio, mes);
      setMesData(r);
      setBancoId((b) => (b && r.bancos.some((x) => x.bancoId === b) ? b : (r.bancos.find((x) => x.estado !== "sinMovimientos") || r.bancos[0])?.bancoId || null));
      setError("");
    } catch (e) { setError(e.message); }
  }, [anio, mes]);
  const cargarBanco = useCallback(async () => {
    if (!bancoId) { setD(null); return; }
    try { setD(await tesConciliacionBanco(bancoId, anio, mes)); setError(""); } catch (e) { setError(e.message); }
  }, [bancoId, anio, mes]);
  useEffect(() => { cargarMes(); }, [cargarMes]);
  useEffect(() => { cargarBanco(); setPVer(1); setPNo(1); setPFal(1); }, [cargarBanco]);
  const recargar = async (msg) => { if (msg) setAviso(msg); await Promise.all([cargarMes(), cargarBanco()]); };

  async function hacer(clave, fn, msg) {
    setOcupado(clave); setError("");
    try { await fn(); await recargar(msg); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }

  const cerrado = !!mesData?.cierre?.firmado;
  const nombreMes = `${MESES[mes - 1]} ${anio}`;
  const e = d ? ESTADO[d.estado] : null;
  const verPag = d ? d.listaPorVerificar.slice((pVer - 1) * PAGE, pVer * PAGE) : [];
  const dg = d?.diagnostico;
  const COPd = (v) => COP(v, d?.moneda);
  // Acciones que corrigen una diferencia: siempre se confirman (la persona aprueba).
  function accionPista(p, clave) {
    const m = p.movimiento;
    if (p.accion === "eliminar") setConfirmar({ titulo: "¿Eliminar este movimiento?", texto: `«${m.descripcion}» del ${fechaCorta(m.fecha)} por ${COPd(m.firmado)}. Queda en auditoría.`, boton: "Sí, eliminarlo", clave, fn: () => tesBorrarMovimiento(m.id), msg: "Movimiento eliminado." });
    if (p.accion === "cambiarTipo") setConfirmar({ titulo: "¿Cambiar el tipo?", texto: `«${m.descripcion}» pasa de ${m.tipo === "credito" ? "crédito (entra)" : "débito (sale)"} a ${m.tipo === "credito" ? "débito (sale)" : "crédito (entra)"}.`, boton: "Sí, cambiarlo", clave, fn: () => tesEditarMovimiento(m.id, { tipo: m.tipo === "credito" ? "debito" : "credito" }), msg: "Tipo corregido." });
    if (p.accion === "corregirValor") setConfirmar({ titulo: "¿Corregir el valor?", texto: `«${m.descripcion}» pasa de ${COPd(m.valor)} a ${COPd(p.valorSugerido)}.`, boton: "Sí, corregirlo", clave, fn: () => tesEditarMovimiento(m.id, { valor: p.valorSugerido }), msg: "Valor corregido." });
    if (p.accion === "registrar") setConfirmar({ titulo: "¿Registrar la línea del banco?", texto: p.texto, boton: "Sí, registrarla", clave, fn: () => tesResolverPendiente(p.extractoId, p.clave, "registrar"), msg: "Línea del extracto registrada." });
  }

  return (
    <div className="tes-vista">

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="tes-cabecera">
          <div className="tes-seg" role="group" aria-label="Año">{[...new Set([...(aniosTes || []), anioActual()])].filter((a) => a <= anioActual()).map((a) => <button key={a} type="button" className={anio === a ? "on" : ""} onClick={() => setAnio(a)}>{a}</button>)}</div>
          <span className="card-sub" style={{ margin: 0 }}>Elige el mes que vas a conciliar.</span>
          <div className="spacer" />
          {mesData && (cerrado
            ? <span className="pill good"><IconCheck size={11} /> {nombreMes} cerrado por {mesData.cierre.firmadoPorNombre || "—"} · {fechaCorta(String(mesData.cierre.firmadoAt).slice(0, 10))}</span>
            : <span className="pill warning">{nombreMes} abierto</span>)}
        </div>
        <div className="tes-meses">
          {MESES_CORTOS.map((m, i) => <button key={m} type="button" className={`tes-mes${mes === i + 1 ? " on" : ""}${anio === anioActual() && i + 1 === mesActual() ? " hoy" : ""}`} onClick={() => crossfade(() => setMes(i + 1))}><b>{m}</b><span>{anio}</span></button>)}
        </div>
      </div>

      {error && <p className="modal-error">{error}</p>}
      {!mesData && <div className="card"><span className="spinner" /></div>}
      {mesData && !mesData.bancos.length && <div className="tes-ayuda"><div>Todavía no hay bancos. Créalos en <Link href="/tesoreria/maestros">Maestros</Link> o sube la plantilla en <Link href="/tesoreria/importar">Importar plantilla</Link>.</div></div>}

      {mesData && mesData.bancos.length > 0 && (
        <div className="tes-bancos" role="tablist" aria-label="Banco">
          {mesData.bancos.map((b) => {
            const [cls, txt, ok] = ESTADO[b.estado];
            return (
              <button key={b.bancoId} type="button" role="tab" aria-selected={b.bancoId === bancoId} className={`tes-banco${b.bancoId === bancoId ? " on" : ""}`} onClick={() => crossfade(() => setBancoId(b.bancoId))}>
                <span className="tes-banco-cab"><strong>{b.banco}</strong><span className={`pill ${cls}`}>{ok ? <IconCheck size={10} /> : <IconAlert size={10} />} {b.estado === "diferencia" ? `${txt}: ${COP(b.diferencia, b.moneda)}` : txt}</span></span>
                <span className="tes-banco-datos"><span>{b.movimientos} mov.</span><span>{b.porVerificar} sin confirmar</span></span>
              </button>
            );
          })}
        </div>
      )}

      {d && e && (
        <>
          {/* Paso 1: saldo */}
          <Paso n={1} titulo="¿El saldo cuadra con el banco?" listo={d.estado === "cuadra"} estadoTexto={e[1]}
            explica="Lo que tienes registrado debe dar el mismo saldo final que dice el extracto del banco.">
            <div className="tes-ecuacion" aria-label="Cuadre del saldo">
              <div className="tes-ec-caja"><span>Saldo al empezar {MESES[mes - 1].toLowerCase()}</span><strong className="tes-num">{COP(d.saldoInicial, d.moneda)}</strong><small>{d.saldoInicial == null ? "falta el saldo de enero o un extracto" : mes === 1 && d.saldoInicialAnio != null ? "el saldo inicial de enero" : "lo que dejó el mes anterior (último extracto + lo registrado)"}</small></div>
              <span className="tes-ec-op">+</span>
              <div className="tes-ec-caja"><span>Entró (créditos)</span><strong className="tes-num tes-pos">{COP(d.creditos, d.moneda)}</strong></div>
              <span className="tes-ec-op">−</span>
              <div className="tes-ec-caja"><span>Salió (débitos)</span><strong className="tes-num tes-neg">{COP(d.debitos, d.moneda)}</strong></div>
              <span className="tes-ec-op">=</span>
              <div className="tes-ec-caja fuerte"><span>Saldo según tu registro{d.corteBanco ? ` al ${fechaSinAnio(d.corteBanco)}` : ""}</span><strong className="tes-num">{COP(d.corteBanco ? d.saldoCalculadoCorte : d.saldoCalculado, d.moneda)}</strong>{d.corteBanco && <small>a fin de mes: {COP(d.saldoCalculado, d.moneda)}</small>}</div>
              <span className="tes-ec-op">vs</span>
              <div className="tes-ec-caja fuerte"><span>Saldo según el banco{d.corteBanco ? ` al ${fechaSinAnio(d.corteBanco)}` : ""}</span><strong className="tes-num">{COP(d.saldoBanco, d.moneda)}</strong><small>{d.saldoBancoFuente || "sube el extracto del mes"}</small></div>
            </div>
            {d.estado === "cuadra" && <div className="tes-resultado ok"><IconCheck size={18} /><div><strong>¡Cuadra al centavo!</strong> Tu registro y el banco dicen lo mismo: {COP(d.saldoBanco, d.moneda)} {d.corteBanco ? `al ${fechaCorta(d.corteBanco)} (el último extracto que subiste llega hasta ese día)` : `al final de ${MESES[mes - 1].toLowerCase()}`}.</div></div>}
            {d.estado === "diferencia" && (
              <div className="tes-resultado mal"><IconAlert size={18} /><div>
                <strong>Hay una diferencia de {COP(d.diferencia, d.moneda)}.</strong> {d.diferencia > 0 ? "Tu registro tiene más que el banco: sobra algún crédito o falta algún débito." : "El banco tiene más que tu registro: falta algún crédito o sobra algún débito."}
                {d.diferenciaInicial != null && Math.abs(d.diferenciaInicial) > 0.5 && <> Ojo: el mes ya <strong>empieza</strong> con {COP(d.diferenciaInicial, d.moneda)} de diferencia contra el saldo inicial del banco: revisa los meses anteriores o el saldo de enero.</>}
                {" "}En el paso 2 está la conciliación con lo que tengo y el banco no, lo que trae el banco y no tengo, y dónde puede estar lo que falta.
              </div></div>
            )}
            {d.estado === "sinSaldoBanco" && <div className="tes-resultado aviso"><IconAlert size={18} /><div><strong>Falta el saldo del banco.</strong> Sube el extracto de {nombreMes} (PDF, Excel o CSV): primero verás las diferencias con lo registrado y tú apruebas qué se registra.</div></div>}
            {d.estado === "sinSaldoInicial" && <div className="tes-resultado aviso"><IconAlert size={18} /><div><strong>Falta el saldo inicial de enero {anio}</strong> de {d.banco}. Sin él (o sin un extracto anterior) no se puede calcular el saldo. <Link href="/tesoreria/saldos">Digítalo en Saldos de bancos</Link>.</div></div>}
            <div className="tes-cabecera">
              {puede && !cerrado && <button type="button" className={`btn${d.estado === "sinSaldoBanco" ? " btn-primary" : ""}`} onClick={() => setModal({ tipo: "extracto" })}>Subir extracto o movimientos</button>}
              <Link className="btn" href={`/tesoreria/movimientos?anio=${anio}`}>Ver movimientos</Link>
              <div className="spacer" />
              {d.extractos.length > 0 && <span className="card-sub" style={{ margin: 0 }}>Extracto(s) del mes: {d.extractos.map((x) => `«${x.archivo}» (${(x.formato || "").toUpperCase()}, ${fechaSinAnio(x.desde)} a ${fechaSinAnio(x.hasta)})`).join(" · ")}</span>}
            </div>
          </Paso>

          {/* Paso 2: conciliación bancaria contable y diferencias */}
          <Paso n={2} titulo="¿Qué diferencias hay con el banco?" listo={!!dg && dg.faltan.length === 0 && dg.noEnBanco.length === 0 && (d.diferencia == null || Math.abs(d.diferencia) < 0.5)}
            estadoTexto={!d.extractos.length ? "Sube el extracto" : dg.faltan.length + dg.noEnBanco.length ? `${dg.faltan.length + dg.noEnBanco.length} partida(s)` : "Sin diferencias"}
            explica="Conciliación bancaria: lo que tienes registrado y el banco no trae, lo que trae el banco y no tienes, y dónde puede estar lo que no explican. Asociar movimientos a pagos es del agente, no de aquí.">
            {!d.extractos.length ? (
              <div className="empty compacta">Sube el extracto de {nombreMes} para comparar movimiento por movimiento.</div>
            ) : (
              <>
                {d.saldoBanco != null && <ConciliacionContable moneda={d.moneda} saldoBanco={d.saldoBanco} saldoLibros={d.corteBanco ? d.saldoCalculadoCorte : d.saldoCalculado} contable={dg.contable} sinExplicar={dg.restante} alTexto={d.corteBanco ? ` al ${fechaSinAnio(d.corteBanco)}` : ` al cierre de ${MESES[mes - 1].toLowerCase()}`} />}
                <PistasDiferencia pistas={dg.pistas} moneda={d.moneda} puede={puede && !cerrado} ocupado={ocupado} onAccion={accionPista} onVer={(id) => setModal({ tipo: "mov", id })} />
                <div className="tes-dos-listas">
                  <div>
                    <h4>Tengo y el banco no trae · {dg.noEnBanco.length}</h4>
                    {dg.noEnBanco.length ? dg.noEnBanco.slice((pNo - 1) * PAGE, pNo * PAGE).map((m) => (
                      <div key={m.id} className="tes-cand">
                        <div><strong>{m.descripcion}</strong><small>{fechaSinAnio(m.fecha)} · {m.origen}{m.creadoPorNombre ? ` · ${m.creadoPorNombre}` : ""}</small></div>
                        <span className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COPd(m.firmado)}</span>
                        <button type="button" className="btn small" onClick={() => setModal({ tipo: "mov", id: m.id })}>Ver</button>
                        {puede && !cerrado && <button type="button" className="btn small" disabled={ocupado === `v${m.id}`} onClick={() => hacer(`v${m.id}`, () => tesVerificarMovimiento(m.id), "Movimiento confirmado.")} title="El banco sí lo tiene (p. ej. salió en otro extracto)">Sí está</button>}
                        {puede && !cerrado && <button type="button" className="btn small btn-danger-outline" onClick={() => accionPista({ accion: "eliminar", movimiento: m }, `e${m.id}`)}>Eliminar</button>}
                      </div>
                    )) : <div className="empty compacta">Todo lo registrado en las fechas del extracto está en el banco.</div>}
                    {dg.noEnBanco.length > PAGE && <Paginita total={dg.noEnBanco.length} page={pNo} onPage={setPNo} />}
                  </div>
                  <div>
                    <h4>El banco trae y no tengo · {dg.faltan.length}</h4>
                    {dg.faltan.length ? dg.faltan.slice((pFal - 1) * PAGE, pFal * PAGE).map((l) => (
                      <div key={l.clave} className="tes-cand">
                        <div><strong>{l.descripcion}</strong><small>{fechaSinAnio(l.fecha)} · extracto «{l.archivo}»</small></div>
                        <span className={`tes-num ${l.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{COPd(l.firmado)}</span>
                        {puede && !cerrado && <button type="button" className="btn small btn-primary" disabled={ocupado === `r${l.clave}`} onClick={() => hacer(`r${l.clave}`, () => tesResolverPendiente(l.extractoId, l.clave, "registrar"), "Línea del extracto registrada.")}>Registrar</button>}
                        {puede && !cerrado && <button type="button" className="btn small" disabled={ocupado === `d${l.clave}`} onClick={() => hacer(`d${l.clave}`, () => tesResolverPendiente(l.extractoId, l.clave, "descartar"), "Línea descartada.")}>Descartar</button>}
                      </div>
                    )) : <div className="empty compacta">Todo lo que trae el banco está registrado.</div>}
                    {dg.faltan.length > PAGE && <Paginita total={dg.faltan.length} page={pFal} onPage={setPFal} />}
                  </div>
                </div>
              </>
            )}
          </Paso>

          {/* Paso 3: registrado sin extracto que lo cubra */}
          <Paso n={3} titulo="¿Lo registrado fuera del extracto está en el banco?" listo={d.listaPorVerificar.length === 0} estadoTexto={d.listaPorVerificar.length ? `${d.listaPorVerificar.length} sin confirmar` : "Todo confirmado"}
            explica="Movimientos registrados en fechas que ningún extracto cubre todavía. Se confirman solos al subir el extracto de esas fechas, o a mano si sabes que están en el banco.">
            {d.listaPorVerificar.length === 0 ? <div className="empty compacta">Todo lo de {d.banco} en {nombreMes} está confirmado o cubierto por un extracto.</div> : (
              <div className="table-card">
                <div className="table-scroll">
                  <table className="records tes-tabla">
                    <thead><tr><th>Fecha</th><th>Descripción</th><th>Concepto</th><th style={{ textAlign: "right" }}>Valor</th><th>Registró</th><th></th></tr></thead>
                    <tbody>{verPag.map((m) => (
                      <tr key={m.id}>
                        <td>{fechaSinAnio(m.fecha)}</td><td>{m.descripcion}</td><td>{m.concepto || "—"}</td>
                        <td style={{ textAlign: "right" }}><span className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}>{m.tipo === "debito" ? "−" : "+"}{m.valorTexto}</span></td>
                        <td>{m.creadoPorNombre || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div className="tes-cabecera" style={{ gap: 6, flexWrap: "nowrap" }}>
                            {puede && !cerrado && <button type="button" className="btn small btn-primary" disabled={ocupado === `v${m.id}`} onClick={() => hacer(`v${m.id}`, () => tesVerificarMovimiento(m.id), "Movimiento confirmado.")}>Sí, está en el banco</button>}
                            <button type="button" className="btn small" onClick={() => setModal({ tipo: "mov", id: m.id })}>Ver</button>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <Paginita total={d.listaPorVerificar.length} page={pVer} onPage={setPVer} />
                <div className="tes-cabecera" style={{ padding: "8px 12px" }}><div className="spacer" /><BotonExcel nombre={`tesoreria-sin-confirmar-${d.banco}-${anio}-${mes}`} hoja="Sin confirmar" filas={d.listaPorVerificar} columnas={[
                  { t: "Fecha", v: (m) => m.fecha }, { t: "Tipo", v: (m) => (m.tipo === "debito" ? "Débito" : "Crédito") }, { t: "Descripción", v: (m) => m.descripcion },
                  { t: "Concepto", v: (m) => m.concepto }, { t: "Tercero", v: (m) => m.tercero }, { t: "Valor (COP, − sale)", v: (m) => (m.tipo === "debito" ? -m.valor : m.valor) }, { t: "Registró", v: (m) => m.creadoPorNombre },
                ]} /></div>
              </div>
            )}
          </Paso>
        </>
      )}

      {/* Paso 4: cerrar el mes (todos los bancos) */}
      {mesData && mesData.bancos.length > 0 && (
        <Paso n={4} titulo={`Cerrar ${nombreMes}`} listo={cerrado} estadoTexto={cerrado ? "Cerrado" : mesData.revision.puedeFirmar ? "Listo para cerrar" : "Aún no se puede"}
          explica="Cerrar el mes deja todos sus movimientos de solo lectura. Se puede cerrar cuando todos los bancos cuadran con el saldo del banco.">
          {cerrado ? (
            <div className="tes-resultado ok"><IconCheck size={18} /><div><strong>{nombreMes} está cerrado.</strong> Lo cerró {mesData.cierre.firmadoPorNombre || "—"} el {fechaCorta(String(mesData.cierre.firmadoAt).slice(0, 10))}. Nada de ese mes se puede cambiar; si hace falta corregir algo, reábrelo (queda en auditoría).</div></div>
          ) : (
            <ul className="tes-checklist">
              {mesData.bancos.filter((b) => b.estado !== "sinMovimientos").map((b) => {
                const [cls, txt, ok] = ESTADO[b.estado];
                return <li key={b.bancoId} className={ok ? "ok" : b.estado === "sinSaldoBanco" ? "aviso" : "mal"}><span className="tes-check-ic">{ok ? <IconCheck size={13} /> : <IconAlert size={13} />}</span><span><strong>{b.banco}</strong>: {b.estado === "diferencia" ? `no cuadra (${COP(b.diferencia, b.moneda)})` : txt.toLowerCase()}</span><span className={`pill ${cls}`}>{ok ? "Listo" : b.estado === "sinSaldoBanco" ? "Aviso" : "Falta"}</span></li>;
              })}
              {mesData.revision.avisos.filter((a) => !/no hay extracto/.test(a)).map((a) => <li key={a} className="aviso"><span className="tes-check-ic"><IconAlert size={13} /></span><span>{a}</span><span className="pill warning">Aviso</span></li>)}
            </ul>
          )}
          <div className="tes-cabecera">
            <div className="spacer" />
            {firma && !cerrado && <button type="button" className="btn btn-primary" disabled={!mesData.revision.puedeFirmar} title={mesData.revision.puedeFirmar ? undefined : mesData.revision.bloqueos.join(" ")} onClick={() => setModal({ tipo: "cerrar" })}>Cerrar {nombreMes}</button>}
            {firma && cerrado && <button type="button" className="btn" onClick={() => setModal({ tipo: "reabrir" })}>Reabrir {nombreMes}</button>}
            {!firma && <span className="card-sub" style={{ margin: 0 }}>Solo quien puede administrar Tesorería (firma) cierra o reabre el mes.</span>}
          </div>
        </Paso>
      )}

      {modal?.tipo === "extracto" && cat && <ExtractoModal cat={cat} bancoId={bancoId} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); recargar(msg); }} />}
      {modal?.tipo === "mov" && cat && <DetalleMovimientoModal id={modal.id} cat={cat} puedeRegistrar={puede && !cerrado} onClose={() => { setModal(null); recargar(); }} onCambio={(msg) => { if (msg) setAviso(msg); }} onEditar={() => { window.location.href = `/tesoreria/movimientos?id=${modal.id}`; }} />}
      {modal?.tipo === "cerrar" && (
        <Modal titulo={`¿Cerrar ${nombreMes}?`} sub="Todos los movimientos, soportes y asociaciones de ese mes quedarán de solo lectura." onClose={() => setModal(null)} ancho={560}
          pie={<><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" disabled={ocupado === "cerrar"} onClick={() => hacer("cerrar", () => tesFirmarCierre(anio, mes), `${nombreMes} cerrado.`).then(() => setModal(null))}>{ocupado === "cerrar" ? <span className="spinner" /> : null} Sí, cerrar el mes</button></>}>
          {mesData.revision.avisos.length ? <div className="tes-ayuda"><div><strong>Antes de cerrar, ten en cuenta:</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{mesData.revision.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div></div> : <p style={{ margin: 0 }}>Todo está conciliado. ¡Listo para cerrar!</p>}
        </Modal>
      )}
      {modal?.tipo === "reabrir" && (
        <Modal titulo={`¿Reabrir ${nombreMes}?`} sub="Se podrá volver a cambiar lo de ese mes. Queda registrado en auditoría quién lo reabrió." onClose={() => setModal(null)} ancho={520}
          pie={<><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" disabled={ocupado === "reabrir"} onClick={() => hacer("reabrir", () => tesReabrirCierre(anio, mes), `${nombreMes} reabierto.`).then(() => setModal(null))}>Sí, reabrir</button></>}>
          <p style={{ margin: 0 }}>Cuando termines de corregir, vuelve a cerrarlo desde aquí.</p>
        </Modal>
      )}
      {confirmar && (
        <Modal titulo={confirmar.titulo} onClose={() => setConfirmar(null)} ancho={520}
          pie={<><button type="button" className="btn" onClick={() => setConfirmar(null)}>Cancelar</button><div className="spacer" /><button type="button" className="btn btn-primary" disabled={ocupado === confirmar.clave} onClick={() => hacer(confirmar.clave, confirmar.fn, confirmar.msg).then(() => setConfirmar(null))}>{ocupado === confirmar.clave ? <span className="spinner" /> : null} {confirmar.boton}</button></>}>
          <p style={{ margin: 0 }}>{confirmar.texto}</p>
        </Modal>
      )}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
