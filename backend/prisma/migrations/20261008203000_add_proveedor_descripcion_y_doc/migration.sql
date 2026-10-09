/*
  Warnings:

  - Added the required column `descripcion` to the `proveedores` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "descripcion" TEXT NOT NULL,
ADD COLUMN     "documentacionAlDia" BOOLEAN NOT NULL DEFAULT false;
