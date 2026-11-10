// Fecha de hoy (aaaa-mm-dd) en Colombia, sin depender de la zona horaria del servidor.
export const hoyColombia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
