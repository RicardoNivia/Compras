# Panel de Compras — Sinco (Next.js + Prisma + SQLite)

Conversión a Next.js / React del panel `Panel_de_Compras_-_Sinco.html`
original, con persistencia real en **SQLite** a través del ORM
[Prisma](https://www.prisma.io/). Ya no depende de IIS: corre con su
propio servidor Node (`next start`).

## Qué cambió respecto a la versión anterior (solo en memoria)

- Los 479 registros originales del panel ahora viven en una tabla
  (`purchase_records`) en un archivo SQLite, no embebidos en el HTML.
- La página (`app/page.js`) es un *Server Component* que consulta la
  base con Prisma y le pasa los registros al panel.
- Hay endpoints API (`app/api/records/...`) para crear, editar y
  eliminar registros; el panel llama a esos endpoints en vez de guardar
  solo en el navegador.
- El modelo de datos está en `prisma/schema.prisma`.

## Requisitos

- [Node.js](https://nodejs.org/) 18.18 o superior (recomendado 20 LTS).
- Nada más: SQLite no necesita un servidor de base de datos aparte, se
  guarda como un archivo local (`prisma/dev.db`).

## 1. Instalar dependencias

```bash
cd C:\Soluciones\ComprasSinco
npm install
```

Esto instala Next.js, React y Prisma, y ejecuta automáticamente
`prisma generate` (necesita internet para descargar el motor de
consultas de Prisma la primera vez).

## 2. Configurar la conexión a la base de datos

Copia `.env.example` a `.env`:

```bash
copy .env.example .env
```

```env
DATABASE_URL="file:./dev.db"
```

No hace falta crear nada más: Prisma crea el archivo `prisma/dev.db`
la primera vez que corres la migración.

## 3. Crear las tablas (migración)

```bash
npm run db:migrate
```

Esto crea el archivo `prisma/dev.db` con la tabla `purchase_records`
según `prisma/schema.prisma`. En un servidor de producción, en vez de
`db:migrate` usa:

```bash
npm run db:deploy
```

## 4. (Opcional) Cargar los datos originales

Si quieres partir con los mismos 479 registros que traía el archivo
original:

```bash
npm run db:seed
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Abre http://localhost:3000

## Compilar y ejecutar en producción

```bash
npm run build
npm start
```

Por defecto queda escuchando en el puerto 3000. Para usar otro puerto:

```bash
npm start -- -p 8080
```

## Dejarlo corriendo como servicio en Windows (opcional)

Como ya no depende de IIS, si quieres que quede siempre encendido puedes
usar [PM2](https://pm2.keymetrics.io/) o [NSSM](https://nssm.cc/) para
correr `npm start` como servicio de Windows, por ejemplo:

```bash
npm install -g pm2
pm2 start npm --name "compras-sinco" -- start
pm2 save
```

## Respaldo de la base de datos

Al ser SQLite, todo el contenido vive en un solo archivo:
`prisma/dev.db` (la ruta exacta la define `DATABASE_URL` en `.env`).
Para respaldarlo basta con copiar ese archivo mientras la app no está
escribiendo en él (por ejemplo, con el servidor detenido).

## Estructura

```
ComprasSinco/
├── app/
│   ├── layout.js            # <head> (fuentes de Google) y layout raíz
│   ├── page.js               # Server Component: lee SQLite via Prisma
│   ├── PanelCompras.jsx      # Componente cliente: monta el HTML e inyecta los scripts
│   ├── panelShellHtml.js      # HTML del panel (topbar, dashboard, modales) sin datos
│   ├── globals.css            # Estilos extraídos del <style> original
│   └── api/
│       └── records/
│           ├── route.js               # GET (listar) / POST (crear)
│           └── [id]/route.js           # PUT (editar) / DELETE (eliminar)
├── lib/
│   ├── prisma.js              # Cliente Prisma (singleton)
│   └── records.js             # Conversión entre filas SQL <-> JSON del panel
├── prisma/
│   ├── schema.prisma           # Modelo de datos (tabla purchase_records)
│   ├── dev.db                   # Archivo de base de datos SQLite (se crea con la migración)
│   ├── seed.js                 # Carga los 479 registros originales
│   └── seed-records.json
├── public/vendor/
│   ├── jspdf.umd.min.js
│   ├── jspdf.autotable.min.js
│   ├── html2canvas.min.js
│   └── app-logic.js            # Lógica de la app, ahora hablando con /api/records
├── .env.example
├── next.config.js
└── package.json
```

## Notas sobre el modelo de datos (`prisma/schema.prisma`)

El modelo `PurchaseRecord` (tabla `purchase_records`) tiene un campo por
cada columna que ya usaba el panel: `informe`, `fechaSolicitud`,
`fechaEntrega`, `area`, `responsable`, `estado`, `categoria`,
`descripcion`, `medioPago`, `licitacion`, `estadoLegalizacion`,
`proveedor`, `fe`, `valorConIva`, `valorSinIva`, `valorCot`,
`observaciones` y `radicado`, más `id`, `createdAt` y `updatedAt`. Si
necesitas agregar una columna nueva:

1. Agrégala en `prisma/schema.prisma`.
2. Corre `npm run db:migrate` para crear la migración y aplicarla.
3. Súmala también en `lib/records.js` (en `toClientRecord` y
   `fromClientPayload`) y en el formulario del modal
   (`app/panelShellHtml.js` / `public/vendor/app-logic.js`) si quieres
   editarla desde la interfaz.

## Otras herramientas útiles

```bash
npm run db:studio   # interfaz visual de Prisma para ver/editar datos
```
