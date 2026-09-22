# -*- coding: utf-8 -*-
"""Convierte la hoja COMPRAS del Excel del panel a un JSON que consume
prisma/importar-registros.mjs.

Uso:
    python herramientas/excel_a_json.py "<ruta del .xlsx>" [salida.json]

Requiere openpyxl (pip install openpyxl).
"""
import datetime
import json
import sys

import openpyxl

HOJA = "COMPRAS"

# Posición de cada columna del Excel dentro de la fila (base 0).
# La columna 3 ("Días") es un cálculo del Excel: no se guarda, la app la
# recalcula con lib/businessDays.js. La 18 ("Columna1") es residual.
COLUMNAS = {
    "informe": 0,
    "fechaSolicitud": 1,
    "fechaEntrega": 2,
    "area": 4,
    "responsable": 5,
    "estado": 6,
    "categoria": 7,
    "descripcion": 8,
    "medioPago": 9,
    "licitacion": 10,
    "estadoLegalizacion": 11,
    "proveedor": 12,
    "fe": 13,
    "valorConIva": 14,
    "valorSinIva": 15,
    "valorCot": 16,
    "observaciones": 17,
}

TEXTO = (
    "informe", "area", "responsable", "estado", "categoria", "descripcion",
    "medioPago", "licitacion", "estadoLegalizacion", "proveedor", "fe",
    "observaciones",
)
NUMERO = ("valorConIva", "valorSinIva", "valorCot")
FECHA = ("fechaSolicitud", "fechaEntrega")

# Excel arrastra errores de fórmula como texto; equivalen a "sin dato".
ERRORES_EXCEL = ("#REF!", "#N/A", "#VALUE!", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!")


def texto(valor):
    if valor is None:
        return None
    if isinstance(valor, datetime.datetime):
        return valor.strftime("%Y-%m-%d")
    dato = str(valor).strip()
    if not dato or dato in ERRORES_EXCEL:
        return None
    return dato


def fecha(valor):
    if isinstance(valor, datetime.datetime):
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, datetime.date):
        return valor.strftime("%Y-%m-%d")
    return texto(valor)


def numero(valor):
    if isinstance(valor, bool) or valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    dato = str(valor).strip().replace("$", "").replace(" ", "")
    if not dato or dato in ERRORES_EXCEL:
        return None
    # Formato colombiano: 1.234.567,89
    if "," in dato and "." in dato:
        dato = dato.replace(".", "").replace(",", ".")
    elif "," in dato:
        dato = dato.replace(",", ".")
    try:
        return float(dato)
    except ValueError:
        return None


def fila_vacia(fila):
    return all(
        v is None or (isinstance(v, str) and not v.strip())
        for v in fila[: max(COLUMNAS.values()) + 1]
    )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    ruta = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else "registros.json"

    libro = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    if HOJA not in libro.sheetnames:
        print("No se encontró la hoja %r. Hojas: %s" % (HOJA, libro.sheetnames))
        return 1
    hoja = libro[HOJA]

    registros = []
    descartadas = 0
    for numero_fila, fila in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        if fila_vacia(fila):
            continue
        registro = {}
        for campo, indice in COLUMNAS.items():
            bruto = fila[indice] if indice < len(fila) else None
            if campo in FECHA:
                registro[campo] = fecha(bruto)
            elif campo in NUMERO:
                registro[campo] = numero(bruto)
            else:
                registro[campo] = texto(bruto)
        # El Excel no tiene columna de radicado; entra en falso y se marca en la app.
        registro["radicado"] = False
        # Sin fecha ni descripción la fila no es un registro utilizable.
        if not registro["fechaSolicitud"] and not registro["descripcion"]:
            descartadas += 1
            continue
        registro["id"] = "c%d" % (len(registros) + 1)
        registros.append(registro)

    datos = {
        "records": registros,
        "meta": {
            "sourceFile": ruta.replace("\\", "/").split("/")[-1],
            "sourceSheet": HOJA,
            "nextLocalSeq": len(registros) + 1,
        },
    }
    with open(salida, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=1)

    print("Registros convertidos: %d" % len(registros))
    if descartadas:
        print("Filas descartadas por falta de fecha y descripción: %d" % descartadas)
    print("Salida: %s" % salida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
