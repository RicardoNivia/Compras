-- Líder (opcional) de cada área de los participantes de Bienestar (maestro "areaParticipante"). Solo se usa en ese tipo.
-- La tabla maestros ya está protegida por trg_texto_sin_danos.
ALTER TABLE "maestros" ADD COLUMN "lider" TEXT;
