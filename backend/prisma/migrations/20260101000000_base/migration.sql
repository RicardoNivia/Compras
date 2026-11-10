-- Esquema base del panel (cascarón público: sin datos). Crea todas las tablas vacías y protege su texto en UTF-8.
-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "localSeq" INTEGER,
    "informe" TEXT,
    "fechaSolicitud" TEXT,
    "fechaEntrega" TEXT,
    "area" TEXT,
    "areaId" TEXT,
    "responsable" TEXT,
    "responsableUserId" TEXT,
    "estado" TEXT,
    "estadoId" TEXT,
    "categoria" TEXT,
    "categoriaId" TEXT,
    "descripcion" TEXT,
    "medioPago" TEXT,
    "medioPagoId" TEXT,
    "licitacion" TEXT,
    "estadoLegalizacion" TEXT,
    "estadoLegalizacionId" TEXT,
    "nit" TEXT,
    "proveedor" TEXT,
    "proveedorNit" TEXT,
    "fe" TEXT,
    "valorConIva" DOUBLE PRECISION,
    "valorSinIva" DOUBLE PRECISION,
    "valorCot" DOUBLE PRECISION,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "valorUsd" DOUBLE PRECISION,
    "trm" DOUBLE PRECISION,
    "observaciones" TEXT,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "actividad" TEXT,
    "actividadId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividades_bienestar" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TEXT,
    "fechaFin" TEXT,
    "linea" TEXT NOT NULL DEFAULT 'Bienestar',
    "estado" TEXT NOT NULL DEFAULT 'creada',
    "descripcion" TEXT,
    "responsableUserId" TEXT,
    "responsableNombre" TEXT,
    "presupuesto" DOUBLE PRECISION,
    "inscritos" INTEGER,
    "asistentes" INTEGER,
    "enCronograma" BOOLEAN NOT NULL DEFAULT true,
    "sentimientoObservaciones" TEXT,
    "sentimientoCierre" TEXT,
    "aplicaParticipantes" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calificacion" INTEGER,
    "comentarioCierre" TEXT,
    "cerradaAt" TIMESTAMP(3),
    "cerradaPorUserId" TEXT,
    "cerradaPorNombre" TEXT,
    "formularioToken" TEXT,
    "formularioAbierto" BOOLEAN NOT NULL DEFAULT false,
    "formularioCampos" TEXT,

    CONSTRAINT "actividades_bienestar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participantes_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "area" TEXT,
    "areaId" TEXT,
    "correo" TEXT,
    "inscrito" BOOLEAN NOT NULL DEFAULT true,
    "asistio" BOOLEAN,
    "motivoInasistencia" TEXT,
    "motivoInasistenciaId" TEXT,
    "calificacion" INTEGER,
    "observacion" TEXT,
    "sentimiento" TEXT,
    "datos" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "autorizaDatos" BOOLEAN NOT NULL DEFAULT false,
    "autorizaDatosAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participantes_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "mime" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "miniatura" BYTEA NOT NULL,
    "hash" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'app',
    "fuente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fotos_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observaciones_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "sentimiento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "observaciones_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "unidad" TEXT,
    "unidadId" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "usado" DOUBLE PRECISION,
    "costoUnitario" DOUBLE PRECISION,
    "recordId" TEXT,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calificaciones_proveedor" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "proveedorNit" TEXT,
    "proveedor" TEXT,
    "estrellas" INTEGER NOT NULL,
    "causasIds" TEXT,
    "comentario" TEXT,
    "calificadoPorUserId" TEXT,
    "calificadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calificaciones_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valoraciones_compra" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "puntajeCompra" INTEGER NOT NULL,
    "puntajeProveedor" INTEGER,
    "resumen" TEXT NOT NULL,
    "observacionCompra" TEXT NOT NULL,
    "observacionProveedor" TEXT,
    "factores" TEXT,
    "comprasPrevias" INTEGER NOT NULL DEFAULT 0,
    "modelo" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'radicacion',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "valoraciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'record',
    "recordId" TEXT NOT NULL,
    "recordInfo" TEXT,
    "userId" TEXT,
    "userNombre" TEXT,
    "userEmail" TEXT,
    "changes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "nextLocalSeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maestros" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "userId" TEXT,
    "aplicaEstrellas" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "maestros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "telefono" TEXT,
    "correo" TEXT,
    "internacional" BOOLEAN NOT NULL DEFAULT false,
    "ultimaEvaluacionCriticoFecha" TIMESTAMP(3),
    "ultimaEvaluacionCriticoResultado" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "inactivoMotivo" TEXT,
    "tipoProveedorId" TEXT,
    "criticidad" TEXT,
    "areaId" TEXT,
    "area" TEXT,
    "tipoServicioId" TEXT,
    "servicio" TEXT,
    "esExcepcion" BOOLEAN NOT NULL DEFAULT false,
    "motivoExcepcionId" TEXT,
    "motivoExcepcion" TEXT,
    "justificacionExcepcion" TEXT,
    "fechaExcepcion" TIMESTAMP(3),
    "radicaFacturas" BOOLEAN NOT NULL DEFAULT false,
    "radicaFacturasAt" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3),
    "clasificacionMontoId" TEXT,
    "clasificacionMonto" TEXT,
    "revision" TEXT,
    "observacion" TEXT,
    "fechaInvitacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("nit")
);

-- CreateTable
CREATE TABLE "proveedor_ciclos" (
    "id" SERIAL NOT NULL,
    "proveedorNit" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "clasificacion" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "aprobadoPorUserId" TEXT,
    "aprobadoPorNombre" TEXT,
    "aprobadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_ciclos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor_ciclo_documentos" (
    "id" SERIAL NOT NULL,
    "cicloId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "cumple" BOOLEAN NOT NULL DEFAULT false,
    "verificadoPorUserId" TEXT,
    "verificadoPorNombre" TEXT,
    "verificadoAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_ciclo_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_proveedores" (
    "id" SERIAL NOT NULL,
    "diaCorte" INTEGER NOT NULL DEFAULT 31,
    "mesCorte" INTEGER NOT NULL DEFAULT 3,
    "diasAviso" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_proveedor_iniciados" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "iniciadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ciclos_proveedor_iniciados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor_procesos" (
    "id" TEXT NOT NULL,
    "proveedorNit" TEXT NOT NULL,
    "proceso" TEXT NOT NULL,
    "estado" TEXT,
    "estadoId" TEXT,
    "fecha" TIMESTAMP(3),
    "revision" TEXT,
    "contacto" TEXT,
    "observacion" TEXT,
    "criticidad" TEXT,
    "clasificacion" TEXT,
    "area" TEXT,
    "areaId" TEXT,
    "servicio" TEXT,
    "servicioId" TEXT,
    "viaExcepcionCorreo" BOOLEAN NOT NULL DEFAULT false,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "radicadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_procesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor_checklists" (
    "proveedorNit" TEXT NOT NULL,
    "rutVigente" BOOLEAN NOT NULL DEFAULT false,
    "certBancaria" BOOLEAN NOT NULL DEFAULT false,
    "listasRestr" BOOLEAN NOT NULL DEFAULT false,
    "criticidadOverride" BOOLEAN NOT NULL DEFAULT false,
    "areaOverride" BOOLEAN NOT NULL DEFAULT false,
    "contactoOverride" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_checklists_pkey" PRIMARY KEY ("proveedorNit")
);

-- CreateTable
CREATE TABLE "presupuesto_anios" (
    "anio" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuesto_anios_pkey" PRIMARY KEY ("anio")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "valorArea" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_categorias" (
    "id" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "presupuesto_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_configs" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'bloques',
    "prompt" TEXT,
    "bloques" TEXT NOT NULL DEFAULT '[]',
    "periodoGeneral" TEXT NOT NULL DEFAULT 'historico',
    "destinatarios" TEXT NOT NULL,
    "cc" TEXT,
    "frecuencia" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "diaMes" INTEGER,
    "hora" TEXT NOT NULL,
    "sabadoHabil" BOOLEAN NOT NULL DEFAULT false,
    "domingoHabil" BOOLEAN NOT NULL DEFAULT false,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "cuerpoModo" TEXT NOT NULL DEFAULT 'resumen',
    "cuerpoPrompt" TEXT,
    "cuerpoHtml" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esBorrador" BOOLEAN NOT NULL DEFAULT false,
    "ultimoContenido" TEXT,
    "ultimoCuerpoCorreo" TEXT,
    "ultimoEnvio" TIMESTAMP(3),
    "pedido" TEXT,
    "contexto" TEXT,
    "reglaTexto" TEXT,
    "ordinal" INTEGER,
    "fechaUnica" TEXT,
    "saltarFestivos" BOOLEAN NOT NULL DEFAULT true,
    "condicion" TEXT NOT NULL DEFAULT 'siempre',
    "entrega" TEXT NOT NULL DEFAULT 'yo',
    "responsables" TEXT,
    "asunto" TEXT,
    "mensaje" TEXT,
    "createdBy" TEXT,
    "createdByNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_ediciones" (
    "id" SERIAL NOT NULL,
    "reportId" TEXT NOT NULL,
    "periodoLabel" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'programado',
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "contenido" TEXT,
    "pdf" BYTEA,
    "asunto" TEXT,
    "mensaje" TEXT,
    "destinatarios" TEXT,
    "cc" TEXT,
    "resumen" TEXT,
    "descargadoAt" TIMESTAMP(3),
    "enviadoAt" TIMESTAMP(3),
    "enviadoPorUserId" TEXT,
    "enviadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "report_ediciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_acceso" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraAt" TIMESTAMP(3),
    "ultimoUsoAt" TIMESTAMP(3),
    "usos" INTEGER NOT NULL DEFAULT 0,
    "revocadoAt" TIMESTAMP(3),
    "revocadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tokens_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "pedido" TEXT NOT NULL,
    "aclaraciones" TEXT,
    "disparador" TEXT NOT NULL DEFAULT 'programado',
    "evento" TEXT,
    "agrupacion" TEXT,
    "fuente" TEXT NOT NULL,
    "consulta" TEXT NOT NULL,
    "parametros" TEXT NOT NULL DEFAULT '{}',
    "alcance" TEXT NOT NULL DEFAULT 'general',
    "condicion" TEXT NOT NULL DEFAULT 'si_hay_resultados',
    "umbral" INTEGER,
    "frecuencia" TEXT,
    "diaSemana" INTEGER,
    "diaMes" INTEGER,
    "ordinal" INTEGER,
    "fechaUnica" TEXT,
    "hora" TEXT,
    "siFestivo" TEXT NOT NULL DEFAULT 'correr',
    "sabadoHabil" BOOLEAN NOT NULL DEFAULT false,
    "domingoHabil" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "canales" TEXT NOT NULL DEFAULT '["app"]',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "motivoPausa" TEXT,
    "pausadaPorUserId" TEXT,
    "pausadaPorNombre" TEXT,
    "pausadaAt" TIMESTAMP(3),
    "propietarioUserId" TEXT NOT NULL,
    "propietarioNombre" TEXT NOT NULL,
    "ultimaEjecucionAt" TIMESTAMP(3),
    "ultimoResultado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_destinatarios" (
    "id" SERIAL NOT NULL,
    "notificacionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "deBaja" BOOLEAN NOT NULL DEFAULT false,
    "deBajaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_destinatarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_ejecuciones" (
    "id" SERIAL NOT NULL,
    "notificacionId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "resultados" INTEGER NOT NULL DEFAULT 0,
    "contenido" TEXT,
    "error" TEXT,
    "retrasoMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_ejecuciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_notificacion" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "datos" TEXT NOT NULL,
    "procesadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "eventos_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_entregas" (
    "id" SERIAL NOT NULL,
    "ejecucionId" INTEGER,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "contenido" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3),
    "enviadaAt" TIMESTAMP(3),
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_entregas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analisis_bienestar" (
    "id" SERIAL NOT NULL,
    "linea" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "corte" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'automatico',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "analisis_bienestar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analisis_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "puntaje" INTEGER,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'cierre',
    "tituloHistoria" TEXT,
    "fraseHistoria" TEXT,
    "fraseHistoriaHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "analisis_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_compra" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "valorEstimado" DOUBLE PRECISION,
    "categoria" TEXT,
    "categoriaId" TEXT,
    "proveedorSugerido" TEXT,
    "fechaRequerida" TEXT,
    "observaciones" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "motivoRechazo" TEXT,
    "recordId" TEXT,
    "recordSeq" INTEGER,
    "atendidaAt" TIMESTAMP(3),
    "atendidaPorUserId" TEXT,
    "atendidaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "solicitudes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propuestas_asociacion" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordSeq" INTEGER,
    "actividadId" INTEGER,
    "confianza" TEXT,
    "razon" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resueltaAt" TIMESTAMP(3),
    "resueltaPorUserId" TEXT,
    "resueltaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "propuestas_asociacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuadros_comparativos" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL DEFAULT 'bienestar',
    "actividadId" INTEGER,
    "recordId" TEXT,
    "datos" JSONB NOT NULL,
    "recomendacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "cuadros_comparativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salarios_minimos" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "norma" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "actualizadoPorNombre" TEXT,

    CONSTRAINT "salarios_minimos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_agentes" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "actualizadoPorUserId" TEXT,
    "actualizadoPorNombre" TEXT,

    CONSTRAINT "config_agentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_correo" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT 'microsoft',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiraAt" TIMESTAMP(3),
    "agenteActivo" BOOLEAN NOT NULL DEFAULT true,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "ultimoError" TEXT,
    "revisadoHasta" TIMESTAMP(3),
    "ultimaRevision" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_correo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correos_revisados" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "correos_revisados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_proveedor_correo" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "webLink" TEXT,
    "remitente" TEXT,
    "asunto" TEXT,
    "recibidoAt" TIMESTAMP(3),
    "resumen" TEXT,
    "datos" TEXT NOT NULL,
    "faltantes" TEXT NOT NULL,
    "notas" TEXT,
    "adjuntos" TEXT,
    "nit" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "proveedorNit" TEXT,
    "motivoDescarte" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "resueltoPorUserId" TEXT,
    "resueltoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_proveedor_correo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_accesos" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_accesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_cuentas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ahorros',
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "formatoExtracto" TEXT,
    "saldoInicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldoInicialFecha" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_items" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_conceptos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "itemId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_pagadores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_pagadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_movimientos" (
    "id" SERIAL NOT NULL,
    "fecha" TEXT NOT NULL,
    "fechaAproximada" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "cuentaId" INTEGER NOT NULL,
    "cuentaDestinoId" INTEGER,
    "itemId" INTEGER,
    "conceptoId" INTEGER,
    "concepto" TEXT NOT NULL,
    "pagadorId" INTEGER,
    "tercero" TEXT,
    "referencia" TEXT,
    "observacion" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_soportes" (
    "id" SERIAL NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "datosLeidos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_soportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_extractos" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "archivo" TEXT NOT NULL,
    "desde" TEXT,
    "hasta" TEXT,
    "lineasNuevas" INTEGER NOT NULL DEFAULT 0,
    "lineasRepetidas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_extractos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_lineas_extracto" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "extractoId" INTEGER,
    "fecha" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tercero" TEXT,
    "valor" DECIMAL(18,2) NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT,
    "movimientoId" INTEGER,
    "comoSeEnlazo" TEXT,
    "enlazadoAt" TIMESTAMP(3),
    "enlazadoPorNombre" TEXT,
    "ignorada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_lineas_extracto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_reglas" (
    "id" SERIAL NOT NULL,
    "patron" TEXT NOT NULL,
    "conceptoId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "pagadorId" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_reglas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_cierres" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "saldos" TEXT NOT NULL,
    "firmadoPorUserId" TEXT,
    "firmadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_cierres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "records_localSeq_key" ON "records"("localSeq");

-- CreateIndex
CREATE INDEX "records_proveedorNit_idx" ON "records"("proveedorNit");

-- CreateIndex
CREATE INDEX "records_actividadId_idx" ON "records"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "actividades_bienestar_formularioToken_key" ON "actividades_bienestar"("formularioToken");

-- CreateIndex
CREATE INDEX "actividades_bienestar_fecha_idx" ON "actividades_bienestar"("fecha");

-- CreateIndex
CREATE INDEX "participantes_actividad_actividadId_idx" ON "participantes_actividad"("actividadId");

-- CreateIndex
CREATE INDEX "participantes_actividad_documento_idx" ON "participantes_actividad"("documento");

-- CreateIndex
CREATE INDEX "fotos_actividad_actividadId_idx" ON "fotos_actividad"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "fotos_actividad_actividadId_hash_key" ON "fotos_actividad"("actividadId", "hash");

-- CreateIndex
CREATE INDEX "observaciones_actividad_actividadId_idx" ON "observaciones_actividad"("actividadId");

-- CreateIndex
CREATE INDEX "inventario_actividad_actividadId_idx" ON "inventario_actividad"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "calificaciones_proveedor_recordId_key" ON "calificaciones_proveedor"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "valoraciones_compra_recordId_key" ON "valoraciones_compra"("recordId");

-- CreateIndex
CREATE INDEX "audit_logs_recordId_idx" ON "audit_logs"("recordId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "maestros_tipo_valor_key" ON "maestros"("tipo", "valor");

-- CreateIndex
CREATE INDEX "proveedores_tipoProveedorId_idx" ON "proveedores"("tipoProveedorId");

-- CreateIndex
CREATE INDEX "proveedores_clasificacionMontoId_idx" ON "proveedores"("clasificacionMontoId");

-- CreateIndex
CREATE INDEX "proveedores_tipoServicioId_idx" ON "proveedores"("tipoServicioId");

-- CreateIndex
CREATE INDEX "proveedores_areaId_idx" ON "proveedores"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_ciclos_proveedorNit_anio_key" ON "proveedor_ciclos"("proveedorNit", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_ciclo_documentos_cicloId_clave_key" ON "proveedor_ciclo_documentos"("cicloId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "ciclos_proveedor_iniciados_anio_key" ON "ciclos_proveedor_iniciados"("anio");

-- CreateIndex
CREATE INDEX "proveedor_procesos_proveedorNit_idx" ON "proveedor_procesos"("proveedorNit");

-- CreateIndex
CREATE INDEX "proveedor_procesos_proceso_idx" ON "proveedor_procesos"("proceso");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_area_anio_key" ON "presupuestos"("area", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_categorias_presupuestoId_categoria_key" ON "presupuesto_categorias"("presupuestoId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_feature_key" ON "role_permissions"("role", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "roles_clave_key" ON "roles"("clave");

-- CreateIndex
CREATE INDEX "report_ediciones_reportId_createdAt_idx" ON "report_ediciones"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "report_ediciones_estado_idx" ON "report_ediciones"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_acceso_tokenHash_key" ON "tokens_acceso"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_acceso_userId_idx" ON "tokens_acceso"("userId");

-- CreateIndex
CREATE INDEX "notificaciones_estado_disparador_idx" ON "notificaciones"("estado", "disparador");

-- CreateIndex
CREATE INDEX "notificaciones_propietarioUserId_idx" ON "notificaciones"("propietarioUserId");

-- CreateIndex
CREATE INDEX "notificacion_destinatarios_userId_idx" ON "notificacion_destinatarios"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_destinatarios_notificacionId_userId_key" ON "notificacion_destinatarios"("notificacionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_ejecuciones_clave_key" ON "notificacion_ejecuciones"("clave");

-- CreateIndex
CREATE INDEX "notificacion_ejecuciones_notificacionId_createdAt_idx" ON "notificacion_ejecuciones"("notificacionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_notificacion_clave_key" ON "eventos_notificacion"("clave");

-- CreateIndex
CREATE INDEX "eventos_notificacion_procesadoAt_idx" ON "eventos_notificacion"("procesadoAt");

-- CreateIndex
CREATE INDEX "eventos_notificacion_tipo_createdAt_idx" ON "eventos_notificacion"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "notificacion_entregas_userId_canal_leidaAt_idx" ON "notificacion_entregas"("userId", "canal", "leidaAt");

-- CreateIndex
CREATE INDEX "notificacion_entregas_estado_proximoIntento_idx" ON "notificacion_entregas"("estado", "proximoIntento");

-- CreateIndex
CREATE UNIQUE INDEX "analisis_bienestar_linea_anio_mes_key" ON "analisis_bienestar"("linea", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "analisis_actividad_actividadId_key" ON "analisis_actividad"("actividadId");

-- CreateIndex
CREATE INDEX "solicitudes_compra_estado_idx" ON "solicitudes_compra"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_compra_actividadId_idx" ON "solicitudes_compra"("actividadId");

-- CreateIndex
CREATE INDEX "propuestas_asociacion_estado_idx" ON "propuestas_asociacion"("estado");

-- CreateIndex
CREATE INDEX "propuestas_asociacion_recordId_idx" ON "propuestas_asociacion"("recordId");

-- CreateIndex
CREATE INDEX "cuadros_comparativos_recordId_idx" ON "cuadros_comparativos"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "salarios_minimos_anio_key" ON "salarios_minimos"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "config_agentes_clave_key" ON "config_agentes"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_correo_userId_key" ON "cuentas_correo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "correos_revisados_cuentaId_mensajeId_key" ON "correos_revisados"("cuentaId", "mensajeId");

-- CreateIndex
CREATE INDEX "solicitudes_proveedor_correo_userId_estado_idx" ON "solicitudes_proveedor_correo"("userId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_proveedor_correo_userId_mensajeId_key" ON "solicitudes_proveedor_correo"("userId", "mensajeId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_accesos_userId_key" ON "tesoreria_accesos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_cuentas_nombre_key" ON "tesoreria_cuentas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_items_nombre_key" ON "tesoreria_items"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_conceptos_nombre_key" ON "tesoreria_conceptos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_pagadores_nombre_key" ON "tesoreria_pagadores"("nombre");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_fecha_idx" ON "tesoreria_movimientos"("fecha");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_cuentaId_fecha_idx" ON "tesoreria_movimientos"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_estado_idx" ON "tesoreria_movimientos"("estado");

-- CreateIndex
CREATE INDEX "tesoreria_soportes_sha1_idx" ON "tesoreria_soportes"("sha1");

-- CreateIndex
CREATE INDEX "tesoreria_lineas_extracto_cuentaId_fecha_idx" ON "tesoreria_lineas_extracto"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "tesoreria_lineas_extracto_movimientoId_idx" ON "tesoreria_lineas_extracto"("movimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_lineas_extracto_cuentaId_clave_key" ON "tesoreria_lineas_extracto"("cuentaId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_reglas_patron_key" ON "tesoreria_reglas"("patron");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_cierres_anio_mes_key" ON "tesoreria_cierres"("anio", "mes");

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participantes_actividad" ADD CONSTRAINT "participantes_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_actividad" ADD CONSTRAINT "fotos_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observaciones_actividad" ADD CONSTRAINT "observaciones_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_actividad" ADD CONSTRAINT "inventario_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones_proveedor" ADD CONSTRAINT "calificaciones_proveedor_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoraciones_compra" ADD CONSTRAINT "valoraciones_compra_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_ciclos" ADD CONSTRAINT "proveedor_ciclos_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_ciclo_documentos" ADD CONSTRAINT "proveedor_ciclo_documentos_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "proveedor_ciclos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_procesos" ADD CONSTRAINT "proveedor_procesos_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_checklists" ADD CONSTRAINT "proveedor_checklists_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_categorias" ADD CONSTRAINT "presupuesto_categorias_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_ediciones" ADD CONSTRAINT "report_ediciones_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_destinatarios" ADD CONSTRAINT "notificacion_destinatarios_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_ejecuciones" ADD CONSTRAINT "notificacion_ejecuciones_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_entregas" ADD CONSTRAINT "notificacion_entregas_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "notificacion_ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analisis_actividad" ADD CONSTRAINT "analisis_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_soportes" ADD CONSTRAINT "tesoreria_soportes_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_lineas_extracto" ADD CONSTRAINT "tesoreria_lineas_extracto_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Ninguna tabla puede guardar texto con caracteres dañados (U+FFFD): una escritura no puede AÑADIR uno a la fila.
CREATE OR REPLACE FUNCTION rechazar_texto_danado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  nuevo text := to_jsonb(NEW)::text;
  viejo text := '';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    viejo := to_jsonb(OLD)::text;
  END IF;
  IF (length(nuevo) - length(replace(nuevo, chr(65533), ''))) > (length(viejo) - length(replace(viejo, chr(65533), ''))) THEN
    RAISE EXCEPTION 'Texto con caracteres dañados (U+FFFD) en la tabla "%": la codificación debe ser UTF-8.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION proteger_texto_tabla(tabla text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_texto_sin_danos ON %I', tabla);
  EXECUTE format('CREATE TRIGGER trg_texto_sin_danos BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION rechazar_texto_danado()', tabla);
END;
$$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' LOOP
    PERFORM proteger_texto_tabla(t.table_name);
  END LOOP;
END;
$$;
