# -*- coding: utf-8 -*-
"""Variante de migrar_excel_a_postgres.py para el layout de Excel sin columna
"informe" y con "Radicado" como columna de datos (hoja "Hoja1" en vez de
"COMPRAS"), usado en la migración de "Archivo compras para Migrar 1 (1).xlsx".

Mismo comportamiento que la v1: crea en `maestros` cualquier valor de
área/responsable/estado/medioPago/estadoLegalizacion que aparezca en el Excel
y no exista, y reemplaza todo el contenido de `records` (asume que está vacía
o es descartable).

Uso:
    PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... \
        python herramientas/migrar_excel_a_postgres_v2.py "<ruta del .xlsx>" [--dry-run]
"""
import datetime
import os
import sys
import uuid

import openpyxl
import psycopg2

HOJA = "Hoja1"

# Posición de cada columna del Excel dentro de la fila (base 0). Sin "informe";
# columna 2 es "DIAS" (calculada, se ignora); columna 17 es "Radicado".
COLUMNAS = {
    "fechaSolicitud": 0,
    "fechaEntrega": 1,
    "area": 3,
    "responsable": 4,
    "estado": 5,
    "categoria": 6,
    "descripcion": 7,
    "medioPago": 8,
    "licitacion": 9,
    "estadoLegalizacion": 10,
    "proveedor": 11,
    "fe": 12,
    "valorConIva": 13,
    "valorSinIva": 14,
    "valorCot": 15,
    "observaciones": 16,
    "radicado": 17,
}

# Campos donde un "-" literal se trata como vacío (placeholder de "no aplica"
# en el Excel). "licitacion" queda fuera: ahí "N/A" es un valor real distinto.
TEXTO_CON_GUION_VACIO = (
    "area", "responsable", "estado", "categoria", "descripcion",
    "medioPago", "estadoLegalizacion", "proveedor", "fe", "observaciones",
)
TEXTO = TEXTO_CON_GUION_VACIO + ("licitacion",)
NUMERO = ("valorConIva", "valorSinIva", "valorCot")
FECHA = ("fechaSolicitud", "fechaEntrega")

# Los 5 campos gobernados por la tabla maestros (ver frontend/lib/maestrosTipos.js).
TIPOS_MAESTRO = ("area", "responsable", "estado", "medioPago", "estadoLegalizacion")

ERRORES_EXCEL = ("#REF!", "#N/A", "#VALUE!", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!")


def texto(valor, campo):
    if valor is None:
        return None
    if isinstance(valor, datetime.datetime):
        return valor.strftime("%Y-%m-%d")
    dato = str(valor).strip()
    if not dato or dato in ERRORES_EXCEL:
        return None
    if campo in TEXTO_CON_GUION_VACIO and dato == "-":
        return None
    return dato


def fecha(valor):
    if isinstance(valor, datetime.datetime):
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, datetime.date):
        return valor.strftime("%Y-%m-%d")
    return texto(valor, "fecha")


def numero(valor):
    if isinstance(valor, bool) or valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    dato = str(valor).strip().replace("$", "").replace(" ", "")
    if not dato or dato in ERRORES_EXCEL or dato == "-":
        return None
    if "," in dato and "." in dato:
        dato = dato.replace(".", "").replace(",", ".")
    elif "," in dato:
        dato = dato.replace(",", ".")
    try:
        return float(dato)
    except ValueError:
        return None


def radicado(valor):
    return bool(valor) and str(valor).strip() not in ("0", "")


def fila_vacia(fila):
    return all(
        v is None or (isinstance(v, str) and not v.strip())
        for v in fila[: max(COLUMNAS.values()) + 1]
    )


def parsear_excel(ruta):
    libro = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    if HOJA not in libro.sheetnames:
        raise SystemExit(f"No se encontró la hoja {HOJA!r}. Hojas: {libro.sheetnames}")
    hoja = libro[HOJA]

    registros = []
    descartadas = 0
    for fila in hoja.iter_rows(min_row=2, values_only=True):
        if fila_vacia(fila):
            continue
        registro = {"informe": None}
        for campo, indice in COLUMNAS.items():
            bruto = fila[indice] if indice < len(fila) else None
            if campo == "radicado":
                registro[campo] = radicado(bruto)
            elif campo in FECHA:
                registro[campo] = fecha(bruto)
            elif campo in NUMERO:
                registro[campo] = numero(bruto)
            else:
                registro[campo] = texto(bruto, campo)
        if not registro["fechaSolicitud"] and not registro["descripcion"]:
            descartadas += 1
            continue
        registros.append(registro)

    return registros, descartadas


def conectar():
    faltan = [k for k in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD") if not os.environ.get(k)]
    if faltan:
        raise SystemExit(f"Faltan variables de entorno: {', '.join(faltan)}")
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", "5432")),
        dbname=os.environ["PGDATABASE"],
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
    )


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print(__doc__)
        return 1
    ruta = args[0]

    registros, descartadas = parsear_excel(ruta)
    print(f"Parseados: {len(registros)} registros del Excel"
          + (f" ({descartadas} descartados sin fecha ni descripción)" if descartadas else ""))

    conn = conectar()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("SELECT tipo, valor FROM maestros")
        existentes = set(cur.fetchall())

        faltantes = []
        vistos = set()
        for tipo in TIPOS_MAESTRO:
            for r in registros:
                v = r.get(tipo)
                if v and (tipo, v) not in existentes and (tipo, v) not in vistos:
                    vistos.add((tipo, v))
                    faltantes.append((tipo, v))

        print(f"\nMaestros nuevos a crear: {len(faltantes)}")
        for tipo, v in faltantes:
            print(f"  {tipo:20s} -> {v}")

        if not dry_run:
            for tipo, v in faltantes:
                cur.execute(
                    'INSERT INTO maestros (id, tipo, valor, activo, "createdAt", "updatedAt") '
                    'VALUES (%s, %s, %s, true, now(), now())',
                    (uuid.uuid4().hex, tipo, v),
                )

        cur.execute("SELECT count(*) FROM records")
        previos = cur.fetchone()[0]

        if not dry_run:
            cur.execute("DELETE FROM records")
            for i, r in enumerate(registros, start=1):
                cur.execute(
                    """
                    INSERT INTO records (
                        id, "localSeq", informe, "fechaSolicitud", "fechaEntrega", area, responsable,
                        estado, categoria, descripcion, "medioPago", licitacion, "estadoLegalizacion",
                        proveedor, fe, "valorConIva", "valorSinIva", "valorCot", observaciones,
                        radicado, "createdAt", "updatedAt"
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        %s, now(), now()
                    )
                    """,
                    (
                        f"c{i}", i, r["informe"], r["fechaSolicitud"], r["fechaEntrega"], r["area"], r["responsable"],
                        r["estado"], r["categoria"], r["descripcion"], r["medioPago"], r["licitacion"], r["estadoLegalizacion"],
                        r["proveedor"], r["fe"], r["valorConIva"], r["valorSinIva"], r["valorCot"], r["observaciones"],
                        r["radicado"],
                    ),
                )

            nombre_archivo = os.path.basename(ruta)
            cur.execute(
                """
                INSERT INTO meta (id, "sourceFile", "sourceSheet", "nextLocalSeq", "updatedAt")
                VALUES (1, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    "sourceFile" = EXCLUDED."sourceFile",
                    "sourceSheet" = EXCLUDED."sourceSheet",
                    "nextLocalSeq" = EXCLUDED."nextLocalSeq",
                    "updatedAt" = now()
                """,
                (nombre_archivo, HOJA, len(registros) + 1),
            )

        if dry_run:
            conn.rollback()
            print(f"\n[dry-run] No se escribió nada. records: {previos} (sin cambios).")
        else:
            conn.commit()
            cur.execute("SELECT count(*) FROM records")
            total_records = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM maestros")
            total_maestros = cur.fetchone()[0]
            print(f"\nListo. records: {previos} -> {total_records}. maestros: {total_maestros}.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
