"""Extrae las fotos de las actividades desde los informes mensuales de Bienestar (PDF) y las asigna a su actividad.

Uso (Python con PyMuPDF y Pillow; correr con -E -P para que no cargue nada de la carpeta de los PDF):
    python -E -P scripts/bienestar/extraerFotosInformes.py <carpeta_pdf> <actividades.json> <carpeta_salida> [--simular]

actividades.json: [{ id, nombre, fecha }] (lo arma scripts/bienestar/importarFotos.mjs --exportar).
Salida: <carpeta_salida>/<id>/<n>.jpg (≤ 1.600 px) y <n>.mini.jpg (≤ 480 px), más manifiesto.json con
[{ actividadId, actividad, archivo, miniatura, ancho, alto, fuente }]. Después: node scripts/bienestar/importarFotos.mjs.

Cómo decide:
  · Cada página tiene una o varias tarjetas de actividad (título, fecha "Jueves 4 de junio", objetivo) con sus fotos
    encima o al lado. La tarjeta es el rectángulo que envuelve su fecha y los textos más cercanos; cada foto va a la
    tarjeta con la que se cruza (o la más cercana, si está a menos de 120 pt). Si en esa fecha hay dos actividades,
    gana la que tenga más palabras de su nombre en la tarjeta. Con duda, la foto no se asigna.
  · No son fotos de actividades: imágenes que se repiten en varias páginas (logos, fondos), banners muy alargados,
    íconos pequeños o dibujos planos (pocos colores), fondos que cubren casi toda la página, y las páginas de portada, cifras, cumpleaños, actividades
    semanales y "actividades por ejecutar" (las del mes siguiente).
"""
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter

import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

MESES = {m: i + 1 for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"])}
RE_FECHA = re.compile(r"(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")", re.I)
PAGINA_NO = re.compile(r"semanal|semana\s*\d|por ejecutar|mes en cifras|resumen de participaci|detr[aá]s de cada actividad", re.I)
# Textos que no son parte de la tarjeta de una actividad (el encabezado de la página, el globo de asistentes).
RE_NO_TARJETA = re.compile(r"actividades del mes|^\s*(\d+\s+personas\s*)+$", re.I)
MIN_LADO = 260
MAX_ASPECTO = 2.6
MAX_AREA_PAGINA = 0.72


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def palabras(s):
    return {w for w in re.sub(r"[^a-z\s]", " ", sin_tildes(s)).split() if len(w) > 3}


def dist_rect(a, b):
    dx = max(b[0] - a[2], a[0] - b[2], 0)
    dy = max(b[1] - a[3], a[1] - b[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def cruce(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0


def es_ilustracion(img):
    """Íconos y dibujos planos (manos, medallas, fondos de afiche): la mitad o más de la imagen son 6 colores; en una
    foto real esos 6 colores no pasan del 45 %."""
    muestra = img.convert("RGB").resize((64, 64))
    colores = Counter((r >> 4, g >> 4, b >> 4) for r, g, b in muestra.get_flattened_data())
    return sum(n for _, n in colores.most_common(6)) / (64 * 64) >= 0.5


def reducir(img, lado):
    k = min(1.0, lado / max(img.size))
    out = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS) if k < 1 else img.copy()
    buf = io.BytesIO()
    out.convert("RGB").save(buf, "JPEG", quality=84 if lado > 600 else 78, optimize=True)
    return buf.getvalue(), out.size


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    simular = "--simular" in sys.argv
    carpeta, json_act, salida = args[0], args[1], args[2]
    actividades = json.load(open(json_act, encoding="utf-8"))
    por_fecha = {}
    for a in actividades:
        por_fecha.setdefault(a["fecha"], []).append(a)

    manifiesto, vistos, resumen = [], set(), {}
    pdfs = sorted(f for f in os.listdir(carpeta) if f.lower().endswith(".pdf") and re.search(r"inform", f, re.I))
    for nombre_pdf in pdfs:
        doc = pymupdf.open(os.path.join(carpeta, nombre_pdf))
        # Imágenes que aparecen en más de una página: logos y fondos del diseño.
        usos = {}
        for page in doc:
            for x in {im[0] for im in page.get_images(full=True)}:
                usos[x] = usos.get(x, 0) + 1
        for num, page in enumerate(doc, start=1):
            texto = page.get_text()
            if num == 1 and doc.page_count > 3 or PAGINA_NO.search(texto):
                continue
            area_pag = page.rect.width * page.rect.height
            bloques = [b for b in page.get_text("blocks") if b[4].strip()]
            # Tarjetas: cada fecha de una actividad conocida es el ancla de una tarjeta; los textos de la página (título,
            # objetivo) se unen a la tarjeta de la fecha más cercana y la tarjeta es el rectángulo que los envuelve.
            tarjetas = []
            for b in bloques:
                vistas = {}
                for m in RE_FECHA.finditer(b[4]):
                    fecha = f"2026-{MESES[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
                    if fecha not in por_fecha:
                        continue
                    # Un bloque puede traer varias fechas ("Domingo, 5 de julio   Viernes 24 de julio"): cada una se
                    # ubica por su propia posición en la página.
                    rects = page.search_for(m.group(0), clip=pymupdf.Rect(b[:4]))
                    k = vistas.get(m.group(0), 0)
                    vistas[m.group(0)] = k + 1
                    r = tuple(rects[k]) if k < len(rects) else tuple(b[:4])
                    tarjetas.append({"fecha": fecha, "ancla": r, "rect": list(r), "texto": ""})
            if not tarjetas:
                continue
            for b in bloques:
                if RE_FECHA.search(b[4]) or RE_NO_TARJETA.search(b[4]):
                    continue
                t = min(tarjetas, key=lambda t: dist_rect(b[:4], t["ancla"]))
                if dist_rect(b[:4], t["ancla"]) > 140:
                    continue
                r = t["rect"]
                t["rect"] = [min(r[0], b[0]), min(r[1], b[1]), max(r[2], b[2]), max(r[3], b[3])]
                t["texto"] += " " + b[4]
            for t in tarjetas:
                candidatas = por_fecha[t["fecha"]]
                if len(candidatas) == 1:
                    t["actividad"] = candidatas[0]
                else:
                    pal = palabras(t["texto"])
                    puntajes = sorted(((len(palabras(a["nombre"]) & pal), a) for a in candidatas), key=lambda x: -x[0])
                    ok = puntajes[0][0] > 0 and (len(puntajes) == 1 or puntajes[0][0] > puntajes[1][0])
                    t["actividad"] = puntajes[0][1] if ok else None
            for info in page.get_image_info(xrefs=True):
                xref = info.get("xref")
                if not xref or usos.get(xref, 0) > 1:
                    continue
                x0, y0, x1, y1 = info["bbox"]
                w, h = x1 - x0, y1 - y0
                if w <= 0 or h <= 0 or w * h > MAX_AREA_PAGINA * area_pag or x0 < -5 or y0 < -5 or x1 > page.rect.width + 5 or y1 > page.rect.height + 5:
                    continue
                if info["width"] < MIN_LADO or info["height"] < MIN_LADO or max(info["width"], info["height"]) / min(info["width"], info["height"]) > MAX_ASPECTO:
                    continue
                # La foto va a la tarjeta con la que más se cruza; si no toca ninguna, a la más cercana (hasta 120 pt).
                caja = (x0, y0, x1, y1)
                orden = sorted(tarjetas, key=lambda t: (-cruce(caja, t["rect"]), dist_rect(caja, t["rect"])))
                mejor = orden[0]
                if cruce(caja, mejor["rect"]) == 0 and dist_rect(caja, mejor["rect"]) > 120:
                    continue
                if len(orden) > 1 and cruce(caja, mejor["rect"]) == 0 and abs(dist_rect(caja, mejor["rect"]) - dist_rect(caja, orden[1]["rect"])) < 25:
                    continue  # equidistante de dos tarjetas: con duda, no se asigna
                actividad = mejor.get("actividad")
                if not actividad:
                    continue
                try:
                    crudo = doc.extract_image(xref)["image"]
                    img = Image.open(io.BytesIO(crudo))
                    img.load()
                except Exception:
                    continue
                if es_ilustracion(img):
                    continue
                grande, (ancho, alto) = reducir(img, 1600)
                clave = (actividad["id"], hashlib.sha1(grande).hexdigest())
                if clave in vistos:
                    continue
                vistos.add(clave)
                n = sum(1 for m in manifiesto if m["actividadId"] == actividad["id"]) + 1
                destino = os.path.join(salida, str(actividad["id"]))
                archivo, mini = os.path.join(destino, f"{n}.jpg"), os.path.join(destino, f"{n}.mini.jpg")
                if not simular:
                    os.makedirs(destino, exist_ok=True)
                    open(archivo, "wb").write(grande)
                    open(mini, "wb").write(reducir(img, 480)[0])
                manifiesto.append({"actividadId": actividad["id"], "actividad": actividad["nombre"], "archivo": archivo, "miniatura": mini, "ancho": ancho, "alto": alto, "fuente": f"{nombre_pdf} · página {num}"})
                resumen[actividad["nombre"]] = resumen.get(actividad["nombre"], 0) + 1
    if not simular:
        os.makedirs(salida, exist_ok=True)
        json.dump(manifiesto, open(os.path.join(salida, "manifiesto.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{'SIMULACIÓN · ' if simular else ''}{len(manifiesto)} fotos en {len(resumen)} actividades")
    for nombre, n in sorted(resumen.items(), key=lambda t: -t[1]):
        print(f"  · {nombre}: {n}")


if __name__ == "__main__":
    main()
