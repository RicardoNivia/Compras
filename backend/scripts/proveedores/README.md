# Migración de Proveedores (NIT como llave primaria)

Scripts para migrar el Excel "Informe Proveedores Sincosoft" y mantener la integridad del módulo de Proveedores.

| Archivo | Para qué |
|---|---|
| `mapeoProveedores.json` | Normalización y mapeo de la plantilla: hojas, columnas, alias de valores, maestros, reglas de NIT, de fechas y de excepción. Para una plantilla o migración nueva solo se ajusta este archivo. |
| `migrarProveedoresExcel.mjs` | `validar` (estructura y normalización, sin BD) · `simular` (compara con la BD en solo lectura) · `maestros` (solo crea maestros) · `aplicar --confirmar` (UPSERT por NIT). |
| `verificarIntegridadProveedores.mjs` | Revisa NIT, FKs, maestros por id, ciclo vigente y permisos. `--corregir` arregla lo que es seguro corregir. |
| `../../prisma/migrations/20261013100000_proveedor_nit_llave_primaria` | Migración de esquema: NIT como PK, relaciones por NIT (FK ON UPDATE CASCADE), maestros de proveedor, área de proveedor separada de la de Compras, backfill de `fechaActualizacion` y permisos del rol Proveedores. Conserva los datos existentes. |

## Procedimiento en producción

> La migración de esquema cambia la llave de `proveedores` (de `id` a `nit`). El código anterior deja de funcionar
> contra el esquema nuevo y viceversa: **se despliega el código nuevo y se aplica la migración en la misma ventana.**

1. **Respaldo** de la base de datos de producción (`pg_dump`).
2. **Validar la plantilla** (no toca la BD):
   `npm run proveedores:validar -- "Informe Proveedores.xlsx" --reporte validar.json`
   Debe terminar sin `ERROR`. Revisa las advertencias y la sección `SIN MAPEO`; si hay valores sin mapeo, agrega alias en `mapeoProveedores.json`.
3. **Desplegar el código** (backend y frontend) y **aplicar las migraciones**: `npm run prisma:deploy`.
   La migración se detiene sola si encuentra NIT vacíos o duplicados, o registros apuntando a un proveedor inexistente.
4. **Simular** contra producción (solo lectura):
   `npm run proveedores:simular -- "Informe Proveedores.xlsx" --reporte simular.json`
   Revisa cuántos se crean y actualizan, y los maestros nuevos.
5. **Migrar**:
   `npm run proveedores:migrar -- "Informe Proveedores.xlsx" --confirmar --reporte aplicar.json`
6. **Verificar**: `npm run proveedores:integridad` (y, si reporta avisos corregibles, `-- --corregir`).
7. Volver a correr `simular`: debe dar `crear: 0, actualizar: 0` (la migración es idempotente).

## Reglas de la migración

- **UPSERT por NIT**: si el NIT existe se actualiza, si no se inserta. Una celda vacía nunca borra un dato existente.
- **NIT**: si viene con dígito de verificación (`900.123.456-7`) se le quita; se aceptan NIT extranjeros alfanuméricos. Las filas sin NIT válido no se migran y se listan en el reporte.
- **Varias hojas con el mismo NIT**: se consolida en un solo proveedor, con prioridad Excepción > Nuevo > Actualización.
- **NIT provisional** (`PENDIENTE-…`) con la misma razón social que una fila del Excel: recibe el NIT real y sus registros lo siguen por FK.
- **Tipo, Clasificación por monto, Área y Tipo servicio** se guardan por id de maestro (más un snapshot del texto). El área de Proveedores es un maestro propio (`areaProveedor`), distinto del área de Compras.
- **Ciclo**: el estado se calcula con la fecha de **última actualización** (`fechaActualizacion`), no con la de registro. Las excepciones no participan del ciclo.
- Un ciclo aprobado a mano en la app no se sobrescribe. Cada cambio queda en Auditoría como "Importación Excel".
- La columna de Revisión (Andrea / Yuli) no se migra.
- La hoja "Contraseñas Adpro" nunca se lee.
