// Preguntas que haría un gerente a Nova. El chat muestra unas cuantas al azar cada vez que se abre (y con "Otras
// preguntas" se cambian), para que se vea todo lo que Nova sabe responder y no siempre las mismas.

export const PREGUNTAS_COMPRAS = [
  { prompt: "¿Cuál es el valor total de compras registrado este año?", title: "Valor total de compras", sub: "Cifra exacta sobre el 100% de los registros", icon: "money" },
  { prompt: "Muéstrame un gráfico de compras por área", title: "Gráfico por área", sub: "Desglose visual con datos reales", icon: "chart" },
  { prompt: "¿Qué áreas van más cerca de agotar su presupuesto?", title: "Presupuesto en riesgo", sub: "Áreas con mayor consumo", icon: "money" },
  { prompt: "¿Quiénes son los 5 proveedores a los que más les compramos y cuánto?", title: "Proveedores principales", sub: "Top por valor comprado", icon: "user" },
  { prompt: "¿Cuántas compras están atrasadas y en qué áreas?", title: "Compras atrasadas", sub: "Solicitudes fuera de plazo", icon: "doc" },
  { prompt: "¿Cuánto nos demoramos en promedio desde la solicitud hasta la entrega?", title: "Tiempos de entrega", sub: "Promedios reales del período", icon: "chart" },
  { prompt: "¿Qué compras quedaron mal valoradas por Nova y por qué?", title: "Compras mal valoradas", sub: "Puntaje de compra y proveedor", icon: "doc" },
  { prompt: "¿Cuántas compras faltan por legalizar o por radicar?", title: "Pendientes de legalizar", sub: "Estado de la legalización", icon: "doc" },
  { prompt: "Compárame el gasto en compras de este año frente al año pasado", title: "Este año vs. el anterior", sub: "Variación del gasto", icon: "chart" },
  { prompt: "¿En qué categorías se nos va la mayor parte del dinero?", title: "Gasto por categoría", sub: "Dónde se concentra el gasto", icon: "money" },
  { prompt: "¿Qué proveedores tienen la información desactualizada?", title: "Proveedores desactualizados", sub: "Ciclo anual de actualización", icon: "user" },
  { prompt: "¿A partir de qué monto se requiere cuadro comparativo?", title: "Procedimiento de compras", sub: "Umbrales, aprobaciones y plazos", icon: "doc" },
  { prompt: "¿Qué me toca revisar hoy?", title: "Mis pendientes de hoy", sub: "Según tu rol", icon: "user" },
];

export const PREGUNTAS_BIENESTAR = [
  { prompt: "¿Qué actividades se han realizado a la fecha de hoy?", title: "Realizadas a la fecha", sub: "Ejecutadas y cerradas hasta hoy", icon: "doc" },
  { prompt: "¿Cómo vamos en Bienestar este año frente al año pasado?", title: "Este año vs. el anterior", sub: "Asistentes, gasto y actividades", icon: "chart" },
  { prompt: "¿Cuánto se ha gastado frente a lo presupuestado en las actividades de Bienestar y Fundación?", title: "Gasto frente a presupuesto", sub: "Compras asociadas a las actividades", icon: "money" },
  { prompt: "¿Cuál fue la actividad mejor calificada del año y cuál la peor?", title: "Mejor y peor calificada", sub: "Calificación al cerrar y de Nova", icon: "user" },
  { prompt: "¿Qué áreas participan menos en las actividades?", title: "Participación por área", sub: "Dónde hay que motivar más", icon: "chart" },
  { prompt: "¿Por qué no asiste la gente que se inscribe?", title: "Motivos de inasistencia", sub: "Los motivos más frecuentes", icon: "user" },
  { prompt: "¿Cuánto nos cuesta en promedio cada asistente?", title: "Costo por asistente", sub: "Gasto asociado entre asistentes", icon: "money" },
  { prompt: "Muéstrame un gráfico de asistentes por mes en Bienestar", title: "Asistentes por mes", sub: "Desglose visual con datos reales", icon: "chart" },
  { prompt: "¿Qué actividades vienen próximas y cuáles no tienen presupuesto?", title: "Próximas actividades", sub: "Fechas, estado y presupuesto", icon: "doc" },
  { prompt: "¿Cuánto cuesta el plan de actividades del próximo año?", title: "Plan del próximo año", sub: "Presupuesto asignado a cada actividad", icon: "money" },
  { prompt: "¿Qué hemos hecho este año con la Fundación?", title: "Fundación este año", sub: "Jornadas y acompañamiento", icon: "doc" },
  { prompt: "¿Hay compras del área de Bienestar que no estén asociadas a ninguna actividad?", title: "Compras sin actividad", sub: "Gasto que no suma en el tablero", icon: "money" },
  { prompt: "¿Qué actividades ya pasaron y siguen sin cerrar?", title: "Actividades sin cerrar", sub: "Vencidas o ejecutadas sin cierre", icon: "doc" },
  { prompt: "Dame las fotos de la última actividad realizada", title: "Fotos de una actividad", sub: "Material fotográfico en el chat", icon: "chart" },
];

// n preguntas al azar, sin repetir (Fisher-Yates sobre una copia).
// Tesorería (solo aparecen a quien tiene acceso nominal al módulo).
export const PREGUNTAS_TESORERIA = [
  { prompt: '¿Cómo cerró el flujo de caja del mes pasado?', title: 'Flujo del mes pasado', sub: 'Ingresos, egresos y neto', icon: 'money' },
  { prompt: '¿En qué ítems se fue más plata este año?', title: 'Dónde se va la plata', sub: 'Egresos por ítem', icon: 'chart' },
  { prompt: '¿Qué pagos vienen en los próximos días?', title: 'Próximos pagos', sub: 'Proyectados del mes', icon: 'doc' },
  { prompt: '¿Qué falta para cerrar el mes pasado?', title: 'Cierre pendiente', sub: 'Conciliación y soportes', icon: 'user' },
  { prompt: '¿Cuánto hay hoy en cada cuenta?', title: 'Saldos por cuenta', sub: 'Según el libro', icon: 'money' },
  { prompt: '¿Qué movimientos del extracto de AV Villas no están en el libro este mes?', title: 'Solo en el banco', sub: 'Conciliación AV Villas', icon: 'doc' },
];

export function preguntasAlAzar(lista, n) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}
