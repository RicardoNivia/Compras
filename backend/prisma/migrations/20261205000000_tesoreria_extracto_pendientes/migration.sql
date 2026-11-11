-- Líneas de un extracto que la persona NO aprobó al subirlo (JSON: [{ clave, fecha, tipo, valor, descripcion, tercero }]).
-- La conciliación las muestra como «el banco las trae y no están registradas» para registrarlas o descartarlas.
-- AlterTable
ALTER TABLE "tesoreria_extractos" ADD COLUMN     "pendientes" TEXT;
