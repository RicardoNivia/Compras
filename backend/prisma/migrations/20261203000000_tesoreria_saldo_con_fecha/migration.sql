-- El saldo que reporta el banco guarda su fecha: un extracto parcial (lo del día o lo que va del mes) se compara a esa
-- fecha, no a fin de mes. Los saldos que ya existen (filas SALDO de la plantilla, extractos de mes completo) quedan sin
-- fecha = fin del mes.
-- AlterTable
ALTER TABLE "tesoreria_saldos_reportados" ADD COLUMN     "fecha" TEXT;

