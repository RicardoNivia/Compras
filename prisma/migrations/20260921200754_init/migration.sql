BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[purchase_records] (
    [id] NVARCHAR(1000) NOT NULL,
    [informe] NVARCHAR(50),
    [fechaSolicitud] DATE,
    [fechaEntrega] DATE,
    [area] NVARCHAR(200),
    [responsable] NVARCHAR(200),
    [estado] NVARCHAR(50),
    [categoria] NVARCHAR(300),
    [descripcion] NVARCHAR(max) NOT NULL,
    [medioPago] NVARCHAR(100),
    [licitacion] NVARCHAR(100),
    [estadoLegalizacion] NVARCHAR(100),
    [proveedor] NVARCHAR(300),
    [fe] NVARCHAR(200),
    [valorConIva] FLOAT(53),
    [valorSinIva] FLOAT(53),
    [valorCot] FLOAT(53),
    [observaciones] NVARCHAR(max),
    [radicado] BIT NOT NULL CONSTRAINT [purchase_records_radicado_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_records_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [purchase_records_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
