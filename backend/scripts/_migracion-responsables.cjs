// Script de un solo uso: crea los usuarios reales Yuli Pérez / Andrea Pérez,
// los ata al maestro "responsable", desactiva los valores de texto libre
// anteriores (Andrea/Andrea M/Yuli/Yuli M) y migra los registros existentes
// para que usen responsableUserId en vez de solo texto.
// Se deja aquí a propósito (no se borra) como registro de qué se ejecutó.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("12345678", 10);

  const result = await prisma.$transaction(async (tx) => {
    const yuli = await tx.user.create({
      data: { nombre: "Yuli Pérez", email: "yuli.perez@sinco.com.co", password: passwordHash, role: "radicar", activo: true },
    });
    const andrea = await tx.user.create({
      data: { nombre: "Andrea Pérez", email: "andrea.perez@sinco.com.co", password: passwordHash, role: "registro", activo: true },
    });

    const maestroYuli = await tx.maestro.create({
      data: { tipo: "responsable", valor: yuli.nombre, userId: yuli.id, activo: true },
    });
    const maestroAndrea = await tx.maestro.create({
      data: { tipo: "responsable", valor: andrea.nombre, userId: andrea.id, activo: true },
    });

    const desactivados = await tx.maestro.updateMany({
      where: { tipo: "responsable", valor: { in: ["Andrea", "Andrea M", "Yuli", "Yuli M"] } },
      data: { activo: false },
    });

    const actualizadosAndrea = await tx.record.updateMany({
      where: { responsable: { in: ["Andrea", "Andrea M"] } },
      data: { responsable: andrea.nombre, responsableUserId: andrea.id },
    });
    const actualizadosYuli = await tx.record.updateMany({
      where: { responsable: { in: ["Yuli", "Yuli M"] } },
      data: { responsable: yuli.nombre, responsableUserId: yuli.id },
    });

    return {
      yuli, andrea, maestroYuli, maestroAndrea,
      desactivados: desactivados.count,
      actualizadosAndrea: actualizadosAndrea.count,
      actualizadosYuli: actualizadosYuli.count,
    };
  });

  console.log(JSON.stringify(result, null, 2));

  const sinMapear = await prisma.record.count({ where: { responsableUserId: null } });
  console.log("Registros SIN responsableUserId tras la migración:", sinMapear);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
