// Pruebas de las reglas del ciclo de proveedores. Ejecutar: node scripts/testProveedoresCiclo.mjs
import assert from "node:assert/strict";
import {
  anioCicloVigente, inicioCiclo, finCicloFecha, diasParaCorte, clasificacionEn,
  checklistDe, alertaCompras, puedeCambiarEstado, validarConfig,
  estadoInicial, actualizadoEnCiclo, esCritico, claveCriticidad,
} from "../lib/proveedoresCicloReglas.js";

const cfg = { diaCorte: 31, mesCorte: 3, diasAviso: 30 };
const bogota = (iso) => new Date(iso + "T12:00:00-05:00");

// Corte: el 31 de marzo a las 23:59 (Bogotá) aún es el ciclo anterior; el 1 de abril ya es el nuevo.
assert.equal(anioCicloVigente(new Date("2027-03-31T23:59:00-05:00"), cfg), 2026);
assert.equal(anioCicloVigente(new Date("2027-04-01T00:00:30-05:00"), cfg), 2027);
assert.equal(anioCicloVigente(bogota("2026-04-01"), cfg), 2026);
assert.equal(anioCicloVigente(bogota("2026-03-31"), cfg), 2025);
assert.equal(anioCicloVigente(bogota("2026-10-11"), cfg), 2026);

// Inicio y fin del ciclo 2026 en hora de Colombia.
assert.equal(inicioCiclo(2026, cfg).toISOString(), "2026-04-01T05:00:00.000Z");
assert.equal(finCicloFecha(2026, cfg).toISOString(), "2027-04-01T04:59:59.999Z");

// Días para el corte desde hoy (11 oct 2026) → 31 mar 2027 ≈ 171 días.
const dias = diasParaCorte(bogota("2026-10-11"), cfg);
assert.ok(dias >= 170 && dias <= 172, `días para corte: ${dias}`);

// Clasificación.
const base = { activo: true, esExcepcion: false, createdAt: bogota("2019-05-01") };
assert.equal(clasificacionEn(base, 2026), "actualizacion");
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2026-06-10") }, 2026), "nuevo");
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2026-06-10") }, 2027), "actualizacion");
// Creado entre enero y marzo (antes del corte) sigue siendo Nuevo del ciclo en curso: no queda sin estado.
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2027-01-05") }, 2026), "nuevo");
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2027-03-31") }, 2026), "nuevo");
assert.equal(clasificacionEn({ ...base, createdAt: new Date("2027-04-01T00:30:00-05:00") }, 2026), "no_aplica");
assert.equal(clasificacionEn({ ...base, createdAt: new Date("2027-04-01T00:30:00-05:00") }, 2027), "nuevo");
// Creado antes de empezar el ciclo (enero a marzo de 2026) ya es de Actualización en el ciclo 2026.
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2026-02-10") }, 2026), "actualizacion");
assert.equal(clasificacionEn({ ...base, createdAt: new Date("2026-03-31T23:00:00-05:00") }, 2026), "actualizacion");
// Un proveedor creado en el ciclo 2026 pasa a Actualización en el ciclo 2027.
assert.equal(clasificacionEn({ ...base, createdAt: bogota("2027-01-05") }, 2027), "actualizacion");
assert.equal(clasificacionEn({ ...base, esExcepcion: true }, 2026), "excepcion");
assert.equal(clasificacionEn({ ...base, activo: false }, 2026), "inactivo");

// El estado del ciclo sale de la fecha de ÚLTIMA ACTUALIZACIÓN, no de la de registro.
const viejo = { ...base, createdAt: bogota("2019-05-01") };
assert.equal(estadoInicial({ ...viejo, fechaActualizacion: null }, 2026), "desactualizado");
assert.equal(estadoInicial({ ...viejo, fechaActualizacion: bogota("2026-08-01") }, 2026), "actualizado");
assert.equal(estadoInicial({ ...viejo, fechaActualizacion: bogota("2026-03-15") }, 2026), "desactualizado");
assert.equal(estadoInicial({ ...viejo, fechaActualizacion: bogota("2026-08-01") }, 2027), "desactualizado");
// Registrado dentro del ciclo pero sin actualización registrada: la fecha de registro no cuenta.
assert.equal(estadoInicial({ ...base, createdAt: bogota("2026-06-10"), fechaActualizacion: null }, 2026), "desactualizado");
assert.equal(actualizadoEnCiclo({ fechaActualizacion: new Date("2027-03-31T23:00:00-05:00") }, 2026), true);
assert.equal(actualizadoEnCiclo({ fechaActualizacion: new Date("2027-04-01T00:30:00-05:00") }, 2026), false);
// Excepción: no participa del ciclo sin importar sus fechas.
assert.equal(clasificacionEn({ ...base, esExcepcion: true, createdAt: bogota("2026-06-10"), fechaActualizacion: null }, 2026), "excepcion");
assert.equal(clasificacionEn({ ...base, esExcepcion: true, createdAt: null, fechaActualizacion: null }, 2026), "excepcion");

// Criticidad por valor del maestro (sin tildes ni mayúsculas).
assert.equal(esCritico("Crítico"), true);
assert.equal(esCritico("CRITICO"), true);
assert.equal(esCritico("No crítico"), false);
assert.equal(esCritico("NO CRITICO"), false);
assert.equal(claveCriticidad(null), "sin_definir");

// NIT provisional: no participa en el ciclo.
assert.equal(clasificacionEn({ ...base, nit: "PENDIENTE-000001" }, 2026), "por_registrar");
assert.equal(alertaCompras({ activo: true, esExcepcion: false, nit: "PENDIENTE-000001" }, null, { completos: 0, total: 6, faltan: [] }).titulo, "Proveedor sin NIT");

// Checklist: 3 automáticos + 3 manuales.
const completo = { criticidad: "Critico", areaId: "a1", servicio: "Ferias", telefono: "3001234567" };
assert.equal(checklistDe(completo, {}).completos, 3);
assert.equal(checklistDe(completo, { rutVigente: true, certBancaria: true, listasRestr: true }).completos, 6);
assert.equal(checklistDe({ criticidad: null, area: "Mercadeo", servicio: "x" }, {}).completos, 1);

// Los 3 automáticos también se pueden marcar a mano: la marca explícita gana sobre el valor derivado.
assert.equal(checklistDe(completo, { criticidadDefinida: false }).completos, 2);
assert.equal(checklistDe({ criticidad: null, area: null, servicio: null }, { areaAsignada: true, criticidadDefinida: true, contactoRegistrado: true }).completos, 3);
assert.equal(checklistDe(completo, {}).items.find((i) => i.clave === "areaAsignada").marcado, false);
assert.equal(checklistDe(completo, { areaAsignada: true }).items.find((i) => i.clave === "areaAsignada").marcado, true);

// Alertas.
const ck6 = checklistDe(completo, { rutVigente: true, certBancaria: true, listasRestr: true });
const ck3 = checklistDe(completo, {});
const activo = { activo: true, esExcepcion: false };
assert.equal(alertaCompras(activo, { anio: 2026, estado: "actualizado", clasificacion: "actualizacion" }, ck6).nivel, "ok");
assert.equal(alertaCompras(activo, { anio: 2026, estado: "actualizado", clasificacion: "actualizacion" }, ck3).nivel, "aviso");
assert.equal(alertaCompras(activo, { anio: 2026, estado: "desactualizado", clasificacion: "actualizacion" }, ck6).nivel, "aviso");
assert.equal(alertaCompras(activo, { anio: 2026, estado: "en_aprobacion", clasificacion: "actualizacion" }, ck6).nivel, "tramite");
assert.equal(alertaCompras({ activo: true, esExcepcion: true, motivoExcepcion: "Gran contribuyente" }, null, ck3).nivel, "excepcion");
assert.equal(alertaCompras({ activo: false, inactivoMotivo: "Desvinculado" }, null, ck3).nivel, "inactivo");

// Transiciones: actualizado exige checklist completo.
assert.equal(puedeCambiarEstado("en_aprobacion", "actualizado", false).ok, false);
assert.equal(puedeCambiarEstado("en_aprobacion", "actualizado", true).ok, true);
assert.equal(puedeCambiarEstado("actualizado", "desactualizado", false).ok, true);
assert.equal(puedeCambiarEstado("en_proceso", "en_proceso", true).ok, false);

// Configuración: 29 de febrero válido solo como fecha de corte posible; 31 de abril no existe.
assert.equal(validarConfig({ diaCorte: 31, mesCorte: 3, diasAviso: 30 }), null);
assert.ok(validarConfig({ diaCorte: 31, mesCorte: 4, diasAviso: 30 }));
assert.ok(validarConfig({ diaCorte: 1, mesCorte: 13, diasAviso: 30 }));

console.log("OK · reglas del ciclo de proveedores (todas las pruebas pasaron)");
