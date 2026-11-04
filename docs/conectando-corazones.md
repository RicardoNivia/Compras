# Conectando Corazones con Propósito

Documento de referencia del programa de la **línea Fundación** del módulo Bienestar. Entregado por Bienestar el 4 de noviembre de 2026 (Ricardo Nivia).

## Cómo lo usa la aplicación

Nova lee este documento desde `backend/lib/conectandoCorazones.js`. Ese archivo es la fuente para la IA y este documento es su copia legible; la presentación de Historias tiene su propio texto en `programa.js`. **Si el programa cambia, actualiza los tres.**

| Dónde | Qué recibe la IA |
|---|---|
| Chat de Nova (`app/api/agent/chat/route.js`) | Recibe siempre un resumen corto y el índice de secciones. Cuando le preguntan por el programa, pide la sección que necesita con la herramienta `consultar_referencia`, documento `"fundacion"`. |
| Análisis del dashboard de Fundación (`lib/analisisBienestar.js`) | El propósito, los cuatro componentes y los valores. Con eso relaciona las jornadas con el programa. |
| Frases de Historias (`lib/historiasFundacion.js`) | Solo el propósito, la misión y los valores. **Nunca recibe la sección de apoyo corporativo**, porque Historias no habla de dinero. |
| Presentación de Historias (`frontend/components/bienestar/historias/programa.js`) | No es IA: es el texto de la presentación «¿Qué es Conectando Corazones?» (botón en Historias), con fotos al azar de las jornadas. Sin la sección de apoyo corporativo ni cifras de niños. |
| Moderación (`lib/agentModeration.js`) | Acepta como tema el programa, la fundación, sus hogares y la alianza. |

**Regla sobre las cifras.** Las cifras de este documento (niños que atienden los hogares, colaboradores que donan, trabajadores financiados) son datos de la fundación y de la alianza. Nova puede citarlas como tales. Nunca debe presentarlas como personas atendidas por las jornadas registradas en la app: de eso no hay datos de beneficiarios.

---

## ¿Qué es Conectando Corazones?

Conectando Corazones con Propósito es una iniciativa conjunta de Sincosoft y la Fundación Proyecto Unión ("Un lugar donde la vida recobra la esperanza"). Su idea central es abrir un puente hacia la verdadera inclusión, uniendo a los colaboradores de la empresa con poblaciones vulnerables: niños en condición de discapacidad y adultos mayores en situación de calle.

A través de experiencias compartidas y lazos afectivos, el programa no solo brinda sonrisas y momentos inolvidables, sino que también siembra la semilla de la empatía y el respeto por la diversidad.

Conectando Corazones es más que un programa: es una filosofía que nos invita a abrir nuestros corazones y a dejar una huella imborrable en el mundo, que transforma vidas, incluyendo la nuestra, una sonrisa a la vez.

## Propósito, misión y visión

**Propósito.** Al conectar con un propósito a través de buenas acciones, entendemos que nuestras acciones impactan de manera significativa en la vida de los demás. Juntos, construimos un mundo donde las diferencias se celebran y donde cada persona tiene la oportunidad de brillar.

**Misión.** Fomentar la conexión genuina y significativa entre los colaboradores de Sincosoft y los beneficiarios de la Fundación Proyecto Unión, creando un espacio de intercambio de experiencias, valores y aprendizajes mutuos que promuevan la inclusión real, la empatía y el respeto por la diversidad.

**Visión.** Ser un programa reconocido y replicable a nivel empresarial y social por su impacto positivo en la construcción de una sociedad más inclusiva, justa y equitativa, donde la interacción entre personas de diferentes entornos enriquezca las vidas de todos los involucrados.

## Valores que promueve

- **Inclusión real:** unir a personas de entornos muy distintos en un mismo espacio.
- **Empatía:** ponerse en el lugar del otro a partir de experiencias compartidas.
- **Respeto por la diversidad:** celebrar las diferencias en lugar de esconderlas.
- **Aprendizaje mutuo:** colaboradores y beneficiarios se transforman unos a otros.
- **Servicio con sentido:** el servicio deja de ser una tarea y se vuelve una expresión de plenitud.
- **Presencia:** "Aquí descubrimos el poder de estar presentes".

## Cómo está estructurado el programa

1. **Encuentros:** dar a conocer a los colaboradores historias inspiradoras, motivándolos a contribuir a través del servicio hacia las poblaciones más vulnerables.
2. **Vivencias en el hogar:** conectar los corazones de los colaboradores con los beneficiarios en las diferentes sedes del hogar.
3. **Motivadores:** reconocer y valorar a los colaboradores que dedican su esfuerzo y tiempo al desarrollo del programa.
4. **Conexiones:** inspirar, mediante campañas de comunicación, a los colaboradores de Sincosoft para que se unan al programa.

## La alianza con Sincosoft

### Nuestro camino

La historia con Sincosoft nace a finales de 2021. Durante estos años se han apoyado las fases de construcción del **Hogar Amparo Quin**, un hogar que atiende actualmente a 50 niños y atenderá a más de 200 niños con patologías de difícil manejo, incluyendo los beneficiarios del programa Vida.

La fundación también acompaña al **Hogar Santa Rita de Cascia**, donde viven 50 niños en condiciones similares, y a adultos mayores en situación de calle en el **Comedor María es mi Madre** y la **Casa de la Esperanza**.

### Apoyo corporativo para un cambio sostenible

- **Aportando con el Alma:** invita a las organizaciones a sumarse al cambio social mediante una donación mensual voluntaria de sus empleados, descontada por nómina. En 2025, 12 colaboradores de SINCO participan. Este aporte constante apoya el desarrollo social sostenible y la calidad de vida de los niños y abuelitos.
- **Hogar Amparo Quin:** Sincosoft financia los salarios de 4 trabajadores, asegurando labores esenciales, y cubrió la parte eléctrica de la cuarta fase del proyecto (próxima a finalizar), fortaleciendo la infraestructura y la sostenibilidad de la misión.
