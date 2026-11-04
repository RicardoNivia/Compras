-- Título y frase de cierre que Nova escribe para Historias de Fundación (Conectando Corazones), con la huella de los
-- datos que los originaron. Son textos emocionales: nunca hablan de gasto ni de presupuesto.
ALTER TABLE "analisis_actividad" ADD COLUMN "tituloHistoria" TEXT;
ALTER TABLE "analisis_actividad" ADD COLUMN "fraseHistoria" TEXT;
ALTER TABLE "analisis_actividad" ADD COLUMN "fraseHistoriaHash" TEXT;
