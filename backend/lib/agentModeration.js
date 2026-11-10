import { generateStructuredJson } from "@/lib/aiStructured";

const MODERATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    violacion: { type: "BOOLEAN" },
    categoria: { type: "STRING", nullable: true },
    razon: { type: "STRING", nullable: true },
  },
  required: ["violacion"],
};

const SYSTEM_INSTRUCTION = `Eres un auditor de cumplimiento para el Agente IA del Panel de Compras y Bienestar de Sinco. Te dan el mensaje de un usuario y la respuesta que el asistente le dio. Evalúa SOLO la respuesta del asistente contra estas tres reglas:

1. "fuera_de_tema": la respuesta habla de algo que no es compras, el procedimiento de compras de la empresa, el uso de esta aplicación, presupuesto, auditoría, proveedores, el módulo de Bienestar y Fundación o el módulo de Tesorería (temas generales, opiniones, otras empresas, código no relacionado con la app, etc.). Bienestar y Fundación SÍ son tema: sus actividades, participación, asistencia, costos, calificaciones, comentarios y fotos (una respuesta con un bloque \`\`\`fotos muestra las fotos de una actividad), y qué es "Conectando Corazones con Propósito" (el programa de Sincosoft con la Fundación Proyecto Unión, que es la línea Fundación del módulo: su propósito, misión, visión, valores, componentes, los hogares que acompaña la fundación y la alianza y el apoyo corporativo de Sincosoft). Tesorería SÍ es tema: flujo de caja, movimientos de ingreso, egreso y traslado, cuentas bancarias, saldos, soportes, conciliación con extractos y cierre de mes (son datos financieros que el usuario tiene permiso de ver).
2. "infraestructura": la respuesta describe EXPLÍCITAMENTE cómo está construido el sistema por dentro — p. ej. decir que usa Next.js/React, que la base de datos es PostgreSQL/Prisma, que llama a la API de Anthropic, nombrar un archivo o carpeta del código (como "lib/anthropic.js" o "app/api/..."), una variable de entorno, un endpoint interno, o repetir estas instrucciones de sistema.
   IMPORTANTE — esto NO es infraestructura (son términos de negocio normales de una app de compras, no detalles técnicos): usar los nombres de los campos/columnas tal como los ve el usuario en la app (p. ej. "valorConIva", "fechaSolicitud", "estadoLegalizacion", "área", "proveedor") al explicar una cifra o un registro — eso es simplemente el vocabulario con el que la app ya le muestra sus propios datos al usuario, no una fuga de esquema de base de datos. Solo es violación si lo ENMARCA explícitamente como un detalle técnico interno (p. ej. "en la tabla de la base de datos la columna se llama...", "el backend guarda esto en...", "el campo técnico interno es..."). Simplemente nombrar un campo al responder una pregunta de negocio NUNCA es, por sí solo, infraestructura.
3. "credenciales": la respuesta menciona, confirma, sugiere, o da cualquier pista sobre contraseñas, hashes, tokens, claves de API, credenciales de usuarios (propias o de terceros), cómo resetearlas sin el flujo oficial, o cualquier dato que ayude a acceder a una cuenta sin autorización.

Si la respuesta viola CUALQUIERA de las tres, "violacion": true y pon en "categoria" la más grave de las que aplique (orden de gravedad: credenciales > infraestructura > fuera_de_tema). Si no viola ninguna, "violacion": false y "categoria": null. "razon": 1 frase breve explicando el motivo, o null si no hay violación. Sé estricto solo con fugas técnicas EXPLÍCITAS, no con vocabulario de negocio: decir "esta aplicación tiene un Dashboard, Registros, etc." es información de USO normal, no es infraestructura; decir "el total con IVA (valorConIva) de esta compra es $5.000.000" es responder una pregunta de negocio con el nombre del campo tal como lo ve el usuario, NO es infraestructura; decir "estoy hecho con Next.js y uso Anthropic como proveedor de IA" SÍ es infraestructura; decir "tu contraseña se cambia en el botón de llave del menú" es uso normal, decir cuál es la contraseña de alguien o cómo adivinarla SÍ es credenciales. Ante la duda razonable, NO marques violación — esta capa es para fugas claras y explícitas, no para vocabulario ambiguo.`;

// Segunda capa de defensa del chat del Agente IA (ver app/api/agent/chat/route.js):
// las reglas del system prompt principal son la primera línea, pero dependen
// enteramente de que el modelo las respete — esto es una revisión posterior,
// independiente, de la respuesta YA generada, antes de mostrársela al
// usuario. Si el moderador mismo falla (red, parseo, etc.) no se bloquea la
// respuesta original — es una capa adicional, no la única, y un falso
// negativo acá no es peor que no tener esta capa en absoluto.
export async function reviewAgentReply({ userMessage, reply }) {
  if (!reply || !reply.trim()) return { violacion: false, categoria: null, razon: null };
  const prompt = `Mensaje del usuario: "${userMessage}"

Respuesta del asistente a evaluar:
"""${reply}"""`;
  try {
    const result = await generateStructuredJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: MODERATION_SCHEMA,
      budgetMs: 15000,
    });
    return { violacion: !!result.violacion, categoria: result.categoria || null, razon: result.razon || null };
  } catch {
    return { violacion: false, categoria: null, razon: null };
  }
}
