#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
StudyMate AI — extraction OCR locale des PDF importés (aucun service en ligne).

Adaptation de la méthode d'OCR des diapositives PowerPoint au cas des PDF de cours :
le fichier reçu est déjà un PDF, l'étape de conversion « .pptx -> PDF » (LibreOffice)
et le réalignement des diapositives masquées n'ont donc plus lieu d'être. Une page du
PDF = une « diapositive » / page de cours.

Étapes :
  1. Entrée PDF (contrôle de lisibilité, nombre de pages).
  2. Cache : empreinte MD5 du PDF -> cache_ocr/<md5>.json (même dpi, même nombre de pages,
     mêmes langues) : pas de nouvel OCR si le fichier est déjà connu.
  3. Rendu des pages en PNG 300 dpi niveaux de gris (pdftoppm ; repli PyMuPDF).
  4. Choix du moteur : Tesseract (fra+eng, puis fra, puis eng) avec un dossier tessdata/
     local ; repli EasyOCR (fr, en, sans GPU) ; sinon None avec la raison.
  5. Lecture OCR : Tesseract --psm 3 en parallèle (ThreadPoolExecutor, OMP_THREAD_LIMIT=1,
     180 s max par page) ; EasyOCR : reconstitution des lignes.
  6. Nettoyage (espaces, bordures, puces, lignes trop courtes, confusions lettre/chiffre
     uniquement dans les jetons presque numériques).
  7. Contenu utile : lignes_utiles() (élimine le bruit des graphiques) et lignes_tableau().
  8. Relecture ciblée d'une zone : ocr_zone() (--psm 6 puis --psm 11).
  9. Usage dans StudyMate : le texte natif du PDF est conservé quand il existe ; l'OCR sert à
     vérifier que chaque nombre du texte natif est réellement visible (sinon « à vérifier ») et
     à lire les pages qui ne sont que des images (contenu marqué « OCR, à vérifier »).
     Aucune valeur illisible n'est jamais devinée.

Utilisation en ligne de commande (le worker Node.js l'appelle ainsi) :
    python3 studymate_ocr.py extraire cours.pdf --cache /tmp/cache_ocr
    python3 studymate_ocr.py image photo.jpg --cache /tmp/cache_ocr
    python3 studymate_ocr.py zone cours.pdf 3 0.10 0.20 0.50 0.30
La sortie est un objet JSON sur stdout.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

DPI = 300                      # résolution de rendu des pages
DELAI_PAGE = 180               # secondes maximum par page pour Tesseract
ICI = Path(__file__).resolve().parent
TESSDATA_LOCAL = Path(os.environ.get("STUDYMATE_TESSDATA", ICI / "tessdata"))
MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "300"))
MIN_TEXTE_NATIF = 25           # caractères utiles pour considérer qu'une page a du texte natif


# ───────────────────────────── 1. Entrée PDF ─────────────────────────────

def nombre_de_pages(pdf: Path) -> Optional[int]:
    """Nombre de pages du PDF (pypdf, sinon pdfinfo). None si le fichier est illisible."""
    try:
        from pypdf import PdfReader  # import local : dépendance facultative
        return len(PdfReader(str(pdf)).pages)
    except Exception:
        pass
    if shutil.which("pdfinfo"):
        try:
            sortie = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, timeout=60).stdout
            m = re.search(r"Pages:\s+(\d+)", sortie)
            return int(m.group(1)) if m else None
        except Exception:
            return None
    return None


def texte_natif(pdf: Path, n_pages: int) -> list[str]:
    """Texte « numérique » de chaque page (couche texte du PDF), vide pour une page scannée."""
    textes: list[str] = []
    if shutil.which("pdftotext"):
        for p in range(1, n_pages + 1):
            try:
                r = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", "-enc", "UTF-8", str(pdf), "-"],
                                   capture_output=True, text=True, timeout=60)
                textes.append(r.stdout)
            except Exception:
                textes.append("")
        return textes
    try:
        from pypdf import PdfReader
        return [(page.extract_text() or "") for page in PdfReader(str(pdf)).pages]
    except Exception:
        return [""] * n_pages


# ───────────────────────────── 2. Cache ─────────────────────────────

def empreinte_md5(fichier: Path) -> str:
    """Empreinte MD5 lue par blocs (fichiers volumineux)."""
    h = hashlib.md5()
    with open(fichier, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def lire_cache(dossier_cache: Path, cle: str, n_pages: int, langues: str) -> Optional[dict]:
    chemin = dossier_cache / f"{cle}.json"
    if not chemin.exists():
        return None
    try:
        donnees = json.loads(chemin.read_text(encoding="utf-8"))
    except Exception:
        return None
    # Le cache n'est valable que pour les mêmes paramètres de lecture.
    if donnees.get("dpi") == DPI and len(donnees.get("pages", [])) == n_pages and donnees.get("langues") == langues:
        return donnees
    return None


def ecrire_cache(dossier_cache: Path, cle: str, donnees: dict) -> None:
    dossier_cache.mkdir(parents=True, exist_ok=True)
    tmp = dossier_cache / f"{cle}.json.tmp"
    tmp.write_text(json.dumps(donnees, ensure_ascii=False), encoding="utf-8")
    tmp.replace(dossier_cache / f"{cle}.json")  # écriture atomique


# ───────────────────────────── 3. Rendu des pages ─────────────────────────────

def rendre_pages(pdf: Path, dossier: Path) -> list[Path]:
    """PNG 300 dpi en niveaux de gris, une image par page (ordre des pages)."""
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", str(pdf), str(dossier / "page")],
                       check=True, capture_output=True, timeout=DELAI_PAGE * 10)
        # pdftoppm numérote page-01.png, page-02.png… (largeur variable) : tri numérique.
        images = sorted(dossier.glob("page-*.png"), key=lambda p: int(re.findall(r"(\d+)\.png$", p.name)[0]))
        return images
    # Repli : PyMuPDF
    try:
        import pymupdf as fitz  # nom actuel du paquet
    except ImportError:
        import fitz  # anciennes versions de PyMuPDF
    images = []
    with fitz.open(str(pdf)) as doc:
        for i, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
            chemin = dossier / f"page-{i:04d}.png"
            pix.save(str(chemin))
            images.append(chemin)
    return images


# ───────────────────────────── 4. Moteur et langues ─────────────────────────────

def environnement_tesseract() -> dict:
    """Environnement d'exécution de Tesseract : tessdata local et un seul fil OpenMP par processus."""
    env = dict(os.environ)
    if (TESSDATA_LOCAL / "fra.traineddata").exists():
        env["TESSDATA_PREFIX"] = str(TESSDATA_LOCAL)
    env["OMP_THREAD_LIMIT"] = "1"
    return env


def choisir_moteur() -> tuple[Optional[str], Optional[str], str]:
    """Renvoie (moteur, langues, raison). moteur = None si aucun n'est disponible."""
    if shutil.which("tesseract"):
        try:
            sortie = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True,
                                    env=environnement_tesseract(), timeout=30)
            dispo = set(l.strip() for l in (sortie.stdout + sortie.stderr).splitlines()[1:])
            for langues in ("fra+eng", "fra", "eng"):
                if all(l in dispo for l in langues.split("+")):
                    return "tesseract", langues, ""
        except Exception as e:  # Tesseract présent mais inutilisable : on tente EasyOCR
            raison = f"Tesseract inutilisable : {e}"
        else:
            raison = "Tesseract sans langue française ni anglaise"
    else:
        raison = "Tesseract absent"
    try:
        import easyocr  # noqa: F401
        return "easyocr", "fr+en", ""
    except Exception:
        return None, None, f"{raison} ; EasyOCR absent : aucun moteur OCR disponible"


# ───────────────────────────── 5. Lecture OCR ─────────────────────────────

def ocr_tesseract(image: Path, langues: str, psm: int = 3) -> str:
    r = subprocess.run(["tesseract", str(image), "-", "-l", langues, "--psm", str(psm)],
                       capture_output=True, text=True, env=environnement_tesseract(), timeout=DELAI_PAGE)
    return r.stdout


_lecteur_easyocr = None


def ocr_easyocr(image: Path) -> str:
    """EasyOCR : boîtes regroupées en lignes de même hauteur, triées de gauche à droite."""
    global _lecteur_easyocr
    import easyocr
    if _lecteur_easyocr is None:
        _lecteur_easyocr = easyocr.Reader(["fr", "en"], gpu=False, verbose=False)
    resultats = _lecteur_easyocr.readtext(str(image), detail=1, paragraph=False)
    boites = []
    for (coins, texte, _conf) in resultats:
        ys = [p[1] for p in coins]
        xs = [p[0] for p in coins]
        boites.append({"y": sum(ys) / 4, "h": max(ys) - min(ys), "x": min(xs), "t": texte})
    boites.sort(key=lambda b: b["y"])
    lignes: list[list[dict]] = []
    for b in boites:
        # Même ligne si le centre vertical est à moins d'une demi-hauteur de la ligne courante.
        if lignes and abs(lignes[-1][-1]["y"] - b["y"]) <= max(b["h"], lignes[-1][-1]["h"]) / 2:
            lignes[-1].append(b)
        else:
            lignes.append([b])
    return "\n".join(" ".join(x["t"] for x in sorted(l, key=lambda b: b["x"])) for l in lignes)


def lire_images(images: list[Path], moteur: str, langues: str) -> list[str]:
    if moteur == "tesseract":
        fils = max(1, min(8, (os.cpu_count() or 2) - 1))
        with ThreadPoolExecutor(max_workers=fils) as pool:
            def lire(img: Path) -> str:
                try:
                    return ocr_tesseract(img, langues)
                except subprocess.TimeoutExpired:
                    return ""  # page trop longue : laissée vide plutôt que devinée
            return list(pool.map(lire, images))
    return [ocr_easyocr(img) for img in images]  # EasyOCR : séquentiel (modèle en mémoire)


# ───────────────────────────── 6. Nettoyage ─────────────────────────────

_BORDURES = "|_~-—=*•"
_CONFUSIONS = str.maketrans({"O": "0", "o": "0", "D": "0", "I": "1", "l": "1", "|": "1",
                             "A": "4", "S": "5", "B": "8", "Z": "2"})


def corriger_jeton(jeton: str) -> str:
    """Corrige O/I/A/S/B/Z… en chiffres seulement si le jeton est presque numérique
    (au moins 2 chiffres et pas plus de lettres que de chiffres) : « A7,A7% » -> « 47,47% »."""
    chiffres = sum(c.isdigit() for c in jeton)
    lettres = sum(c.isalpha() for c in jeton)
    if chiffres >= 2 and lettres <= chiffres:
        return jeton.translate(_CONFUSIONS)
    return jeton


def nettoyer(texte: str) -> str:
    lignes = []
    for ligne in texte.splitlines():
        ligne = re.sub(r"\s+", " ", ligne).strip().strip(_BORDURES).strip()
        if sum(c.isalnum() for c in ligne) < 2:
            continue
        lignes.append(" ".join(corriger_jeton(j) for j in ligne.split(" ")))
    return "\n".join(lignes)


# ───────────────────────────── 7. Contenu utile ─────────────────────────────

_PETITS_MOTS = {"le", "la", "les", "de", "du", "des", "et", "à", "a", "en", "au", "aux", "un", "une", "ou", "on",
                "se", "si", "il", "ce", "sa", "son", "par", "sur", "pour", "est", "ZS", "AS", "CS", "PoC", "PoE"}
_NOMBRE = re.compile(r"^[+-]?\d+(?:[.,/]\d+)*%?$")


def ligne_est_utile(ligne: str) -> bool:
    jetons = [j.strip("()[]:;«»\"'") for j in ligne.split()]
    jetons = [j for j in jetons if j]
    if not jetons:
        return False
    bons = sum(1 for j in jetons if (len(j) >= 3 and any(c.isalpha() for c in j)) or _NOMBRE.match(j) or j in _PETITS_MOTS or j.lower() in _PETITS_MOTS)
    return bons / len(jetons) >= 0.6


def lignes_utiles(texte: str) -> str:
    """Garde les lignes dont au moins 60 % des jetons sont des mots, nombres ou petits mots connus
    (élimine le bruit des graphiques : graduations d'axes, légendes fragmentées)."""
    return "\n".join(l for l in texte.splitlines() if ligne_est_utile(l))


_LIGNE_TABLEAU = re.compile(r"^(?P<libelle>[^\d\n]*?[A-Za-zÀ-ÿ][^\d\n]*?)\s+(?P<nombres>(?:[+-]?\d+(?:[.,]\d+)?%?\s+){1,}[+-]?\d+(?:[.,]\d+)?%?)\s*$")


def lignes_tableau(texte: str) -> list[list[str]]:
    """Lignes « libellé suivi d'au moins 2 nombres » -> [libellé, n1, n2, …]
    (ex. « Total 344 165 47,97% » -> ["Total", "344", "165", "47,97%"])."""
    resultat = []
    for ligne in texte.splitlines():
        m = _LIGNE_TABLEAU.match(ligne.strip().rstrip(" .;:,"))
        if m:
            resultat.append([m.group("libelle").strip()] + m.group("nombres").split())
    return resultat


# ───────────────────────────── 8. Relecture ciblée d'une zone ─────────────────────────────

def ocr_zone(pdf: str | Path, page: int, boite: tuple[float, float, float, float], langues: str = "fra+eng") -> str:
    """Relit une zone d'une page. boite = (x, y, largeur, hauteur) en proportions de la page.
    Résultat mis en cache dans <fichier>_zones.json (clé = page + boîte)."""
    pdf = Path(pdf)
    cache = pdf.with_name(pdf.stem + "_zones.json")
    cle = f"{page}:{','.join(f'{v:.4f}' for v in boite)}"
    zones = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    if cle in zones:
        return zones[cle]
    from pypdf import PdfReader
    mb = PdfReader(str(pdf)).pages[page - 1].mediabox
    largeur_px = float(mb.width) / 72 * DPI     # 72 points par pouce
    hauteur_px = float(mb.height) / 72 * DPI
    x, y, w, h = boite
    marge = 0.01                                # 1 % de marge autour de la zone
    x0, y0 = max(0.0, x - marge), max(0.0, y - marge)
    x1, y1 = min(1.0, x + w + marge), min(1.0, y + h + marge)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "zone"
        subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(DPI), "-gray", "-png", "-singlefile",
                        "-x", str(int(x0 * largeur_px)), "-y", str(int(y0 * hauteur_px)),
                        "-W", str(int((x1 - x0) * largeur_px)), "-H", str(int((y1 - y0) * hauteur_px)),
                        str(pdf), str(base)], check=True, capture_output=True, timeout=DELAI_PAGE)
        image = base.with_suffix(".png")
        # --psm 6 : bloc de texte ; --psm 11 : texte épars (grands chiffres isolés).
        texte = nettoyer(ocr_tesseract(image, langues, psm=6) + "\n" + ocr_tesseract(image, langues, psm=11))
    zones[cle] = texte
    cache.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    return texte


# ───────────────────── 8 bis. Images contenues dans les pages ─────────────────────

def pages_avec_images(pdf: Path) -> set[int]:
    """Pages contenant au moins une image significative (pdfimages -list ; les masques et les
    petites icônes sont ignorés). Ensemble vide si l'outil est absent."""
    try:
        r = subprocess.run(["pdfimages", "-list", str(pdf)], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return set()
    pages: set[int] = set()
    for ligne in r.stdout.splitlines()[2:]:
        champs = ligne.split()
        if len(champs) < 5 or not champs[0].isdigit():
            continue
        page, type_, largeur, hauteur = int(champs[0]), champs[2], int(champs[3]), int(champs[4])
        if type_ in ("image", "stencil") and largeur >= 150 and hauteur >= 50:
            pages.add(page)
    return pages


def _mots(texte: str) -> list[str]:
    return [m.lower() for m in re.findall(r"[^\W\d_]{3,}|\d+(?:[.,]\d+)*%?", texte)]


def lignes_hors_texte(lu: str, natif: str) -> str:
    """Lignes OCR (utiles) absentes du texte natif : texte présent seulement dans une image.
    Une ligne est retenue si moins de 60 % de ses mots se retrouvent dans le texte natif (une ligne
    du texte natif relue avec une ou deux erreurs en garde en général plus de 80 %)."""
    connus = set(_mots(natif))
    retenues = []
    for ligne in lignes_utiles(lu).splitlines():
        mots = _mots(ligne)
        if len(mots) >= 2 and sum(m in connus for m in mots) / len(mots) < 0.6:
            retenues.append(ligne)
    return "\n".join(retenues)


# ───────────────────── 8 ter. Images importées (photos, scans) ─────────────────────

LARGEUR_A4_PX = 2480           # largeur d'une page A4 rendue à 300 dpi
LARGEUR_MAX_PX = 5000


def image_vers_pdf(image: Path, destination: Path) -> bool:
    """Place l'image dans une page PDF dimensionnée pour que le rendu à 300 dpi donne entre
    2 480 px (A4 ; les petites images sont agrandies) et 5 000 px de large. Le reste du
    traitement est alors exactement celui des PDF numérisés. False si PyMuPDF est absent."""
    try:
        import fitz  # type: ignore
    except ImportError:
        return False
    with fitz.open(str(image)) as img:
        r = img[0].rect
        largeur, hauteur = r.width, r.height
    cible = min(max(largeur, LARGEUR_A4_PX), LARGEUR_MAX_PX)
    echelle = cible / largeur * 72 / DPI
    doc = fitz.open()
    page = doc.new_page(width=largeur * echelle, height=hauteur * echelle)
    page.insert_image(page.rect, filename=str(image))
    doc.save(str(destination))
    doc.close()
    return True


def extraire_image(image: str | Path, dossier_cache: str | Path = "cache_ocr") -> dict:
    """Extraction d'une image importée (JPEG, PNG) de la même façon que les pages scannées :
    rendu 300 dpi niveaux de gris, Tesseract fra+eng, nettoyage, lignes utiles, tableaux.
    Sans PyMuPDF, l'image est lue directement par Tesseract avec le même nettoyage."""
    image = Path(image)
    cle = "img-" + empreinte_md5(image)
    with tempfile.TemporaryDirectory(prefix="studymate-img-") as tmp:
        pdf = Path(tmp) / "image.pdf"
        if image_vers_pdf(image, pdf):
            return extraire(pdf, dossier_cache, cle=cle)
    moteur, langues, raison = choisir_moteur()
    if moteur is None:
        return {"ok": True, "pages_total": 1, "moteur": None, "langues": None, "cache": False, "ocr_indisponible": raison,
                "pages": [{"page": 1, "texte": "", "source": "vide", "a_verifier": [], "tableaux": [], "texte_images": ""}]}
    brut = ocr_tesseract(image, langues) if moteur == "tesseract" else ocr_easyocr(image)
    texte = lignes_utiles(nettoyer(brut))
    return {"ok": True, "pages_total": 1, "moteur": moteur, "langues": langues, "cache": False, "ocr_indisponible": None,
            "pages": [{"page": 1, "texte": texte, "source": "ocr" if texte else "vide", "a_verifier": [],
                       "tableaux": lignes_tableau(texte), "texte_images": ""}]}


# ───────────────────────────── 9. Interface ─────────────────────────────

def ocr_pdf(pdf: str | Path, moteur: Optional[str] = None, langues: Optional[str] = None, n_attendu: Optional[int] = None,
            dossier_cache: str | Path = "cache_ocr", cle: Optional[str] = None) -> tuple[Optional[list[str]], dict]:
    """OCR de toutes les pages. Renvoie (textes par page, infos) ; (None, {"raison": …}) en cas d'échec."""
    pdf = Path(pdf)
    n = nombre_de_pages(pdf)
    if n is None:
        return None, {"raison": "PDF illisible ou protégé"}
    if n_attendu is not None and n != n_attendu:
        return None, {"raison": f"{n} pages lues pour {n_attendu} attendues"}
    if n > MAX_PAGES:
        return None, {"raison": f"PDF trop long pour l'OCR ({n} pages, maximum {MAX_PAGES})"}
    if moteur is None:
        moteur, langues, raison = choisir_moteur()
        if moteur is None:
            return None, {"raison": raison}
    langues = langues or ("fra+eng" if moteur == "tesseract" else "fr+en")
    cle = cle or empreinte_md5(pdf)
    dossier_cache = Path(dossier_cache)
    en_cache = lire_cache(dossier_cache, cle, n, langues)
    if en_cache:
        return en_cache["pages"], {"moteur": en_cache["moteur"], "langues": langues, "cache": True}
    with tempfile.TemporaryDirectory(prefix="studymate-ocr-") as tmp:
        images = rendre_pages(pdf, Path(tmp))
        if len(images) != n:
            return None, {"raison": f"{len(images)} images rendues pour {n} pages"}
        pages = [nettoyer(t) for t in lire_images(images, moteur, langues)]
    ecrire_cache(dossier_cache, cle, {"dpi": DPI, "moteur": moteur, "langues": langues, "pages": pages})
    return pages, {"moteur": moteur, "langues": langues, "cache": False}


_NOMBRE_TEXTE = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)*%?")


def _normaliser_nombre(n: str) -> str:
    return n.replace(" ", "").replace(",", ".").rstrip("%")


# Une couche texte défectueuse (police mal encodée) fausse la plupart des nombres d'une page.
# Quelques nombres absents de l'OCR (graduations d'axes, numéros collés aux pointillés d'une
# table des matières, exposants) relèvent au contraire des limites de l'OCR : pas d'alerte.
SEUIL_DOUTEUX_MIN = 4
SEUIL_DOUTEUX_PART = 0.6


def nombres_a_verifier(natif: str, lu: str) -> list[str]:
    """Nombres du texte natif introuvables sur l'image, seulement si la page semble mal encodée."""
    # Côté OCR : tous les nombres, même collés à des points (« .....14 ») ou à des lettres.
    visibles = {_normaliser_nombre(x) for x in re.findall(r"\d+(?:[.,]\d+)*", lu)}
    chiffres = set(re.findall(r"\d+", lu))

    def vu(x: str) -> bool:
        n = _normaliser_nombre(x)
        # Une liste « 27,28,29 » est vue si chacun de ses nombres l'est.
        return n in visibles or all(p in chiffres for p in re.findall(r"\d+", x))

    candidats = {x for x in _NOMBRE_TEXTE.findall(natif) if len(_normaliser_nombre(x)) >= 2}
    douteux = sorted(x for x in candidats if not vu(x))
    if len(douteux) < SEUIL_DOUTEUX_MIN or len(douteux) < SEUIL_DOUTEUX_PART * len(candidats):
        return []
    return douteux[:50]


def extraire(pdf: str | Path, dossier_cache: str | Path = "cache_ocr", cle: Optional[str] = None) -> dict:
    """Extraction StudyMate d'un PDF de cours, page par page :
      - texte natif présent -> conservé tel quel (fidèle) ; les nombres qu'il contient sont
        cherchés dans l'OCR : un nombre absent de l'image est signalé « à vérifier » ;
      - page sans texte natif (scan, diapositive en image) -> texte OCR filtré par lignes_utiles,
        marqué « OCR, à vérifier » ;
      - page à texte natif contenant une image (figure, tableau ou extrait scanné) -> les lignes
        lues par l'OCR qui ne figurent pas dans le texte natif sont ajoutées, marquées « à vérifier » ;
      - lignes de tableau repérées sur le texte retenu.
    Aucune valeur illisible n'est devinée : une page illisible reste vide et est signalée."""
    pdf = Path(pdf)
    n = nombre_de_pages(pdf)
    if n is None:
        return {"ok": False, "raison": "PDF illisible ou protégé"}
    natifs = texte_natif(pdf, n)
    avec_images = pages_avec_images(pdf)
    ocr, infos = ocr_pdf(pdf, dossier_cache=dossier_cache, n_attendu=n, cle=cle)
    pages = []
    for i in range(n):
        natif = (natifs[i] if i < len(natifs) else "").strip()
        lu = ocr[i] if ocr else ""
        page = {"page": i + 1, "texte": "", "source": "vide", "a_verifier": [], "tableaux": [], "texte_images": ""}
        if sum(not c.isspace() for c in natif) >= MIN_TEXTE_NATIF:
            page["texte"] = re.sub(r"[ \t]{2,}", " ", natif)
            page["source"] = "texte"
            if ocr is not None:
                page["a_verifier"] = nombres_a_verifier(natif, lu)
                if (i + 1) in avec_images:
                    page["texte_images"] = lignes_hors_texte(lu, natif)
        elif lu.strip():
            page["texte"] = lignes_utiles(lu)
            page["source"] = "ocr" if page["texte"] else "vide"
        page["tableaux"] = lignes_tableau(page["texte"] + "\n" + page["texte_images"])
        pages.append(page)
    return {
        "ok": True,
        "pages_total": n,
        "moteur": infos.get("moteur"),
        "langues": infos.get("langues"),
        "cache": infos.get("cache", False),
        "ocr_indisponible": None if ocr is not None else infos.get("raison"),
        "pages": pages,
    }


def _principal(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "extraire":
        cache = argv[argv.index("--cache") + 1] if "--cache" in argv else "cache_ocr"
        print(json.dumps(extraire(argv[1], cache), ensure_ascii=False))
        return 0
    if len(argv) >= 2 and argv[0] == "image":
        cache = argv[argv.index("--cache") + 1] if "--cache" in argv else "cache_ocr"
        print(json.dumps(extraire_image(argv[1], cache), ensure_ascii=False))
        return 0
    if len(argv) == 7 and argv[0] == "zone":
        boite = tuple(float(v) for v in argv[3:7])
        print(json.dumps({"ok": True, "texte": ocr_zone(argv[1], int(argv[2]), boite)}, ensure_ascii=False))  # type: ignore[arg-type]
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(_principal(sys.argv[1:]))
