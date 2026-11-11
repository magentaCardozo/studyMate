# Extraction du texte et base de connaissances (OCR local)

Tout ce qui est déposé dans le dossier d'un cours est converti en texte, puis réuni dans la
**base de connaissances** du dossier :

| Source | Extraction |
|---|---|
| PDF | Couche texte de chaque page ; pages numérisées lues par OCR ; texte des **images contenues dans les pages** (figures, tableaux en image, extraits scannés) lu par OCR et ajouté |
| Scan (web, Android) | Converti en PDF à la prise de vue, puis traité comme un PDF numérisé |
| Image importée (JPEG, PNG) | **Même méthode que les pages scannées** : placée dans une page dimensionnée pour 300 dpi, rendue en niveaux de gris, Tesseract fra+eng, nettoyage |
| Word (.docx) | Texte et titres ; les **images du document** sont lues par le même OCR |
| Texte collé, .txt, .md | Repris tel quel |

Les PDF et les images sont analysés par le module Python
[`backend/ocr/studymate_ocr.py`](../backend/ocr/studymate_ocr.py), appelé par le worker
(`backend/src/services/extraction.ts`). Rien n'est envoyé à un service externe.

## Méthode

1. **Cache** : empreinte MD5 du fichier → `cache_ocr/<md5>.json` (résolution, nombre de pages et
   langues vérifiés). Un PDF déjà traité est relu instantanément.
2. **Texte natif** de chaque page (`pdftotext`, sinon `pypdf`). Une page qui en contient au moins
   25 caractères est conservée telle quelle (`source = "texte"`).
3. **Rendu image** des pages : `pdftoppm -r 300 -gray -png` (repli : PyMuPDF à 300 dpi, niveaux de gris).
4. **OCR** : Tesseract `fra+eng` (sinon `fra`, sinon `eng`) avec un `tessdata` local si présent ;
   repli EasyOCR s'il est installé. Pages traitées en parallèle (`ThreadPoolExecutor`,
   `OMP_THREAD_LIMIT=1`, délai de 180 s par page : au-delà, la page est marquée vide).
5. **Nettoyage** : espaces, lignes parasites (règle des 60 % de caractères utiles) et confusions
   lettre/chiffre corrigées **uniquement** dans les jetons quasi numériques (O→0, l→1, S→5, B→8…).
6. **Vérification** : sur une page à texte natif, les nombres sont cherchés dans l'image OCR
   (y compris collés à des pointillés ou en liste « 27,28,29 »). La page n'est signalée « à vérifier »
   (`a_verifier`) que si au moins 4 nombres **et** 60 % de ses nombres sont introuvables : c'est le
   signe d'une couche texte mal encodée. Quelques absences (graduations d'axes, numéros d'une table
   des matières, exposants) sont des limites de l'OCR et ne déclenchent pas d'alerte.
   Rien n'est deviné : une page illisible reste vide (`source = "vide"`).
7. **Images dans les pages** : sur une page à texte natif qui contient une image significative
   (`pdfimages -list`, au moins 150 × 50 px), les lignes lues par l'OCR absentes du texte natif
   (moins de 60 % de leurs mots s'y retrouvent) sont ajoutées sous l'intitulé
   « [Texte lu dans une image — OCR, à vérifier] » (`texte_images`).
8. **Tableaux** : les lignes « libellé + au moins deux nombres » sont relevées (`tableaux`).

Résultat (une page) : `{ page, texte, source: texte|ocr|vide, a_verifier: [...], tableaux: [[...]], texte_images }`.

Dans l'application, les pages lues par OCR et les nombres à vérifier apparaissent en avertissement
sur le document. Si le module ne peut pas s'exécuter (Python absent), l'extraction intégrée
(poppler + Tesseract) prend le relais ; `OCR_ENGINE=builtin` force ce repli.

## La base de connaissances du dossier

Le texte de chaque document est conservé (page par page, avec sa provenance) et découpé en passages
pour la génération. Tout le texte d'un dossier est consultable **au même endroit** :

- web : dossier › « Voir la base de connaissances » (recherche, passages OCR signalés, téléchargement `.md`) ;
- Android : dossier › « Voir la base de connaissances » ;
- API : `GET /api/v1/courses/{id}/knowledge-base/content` (JSON) ou `?format=md` (fichier Markdown).

C'est exactement ce contenu qu'utilisent les boutons « Générer » des sous-dossiers QCM,
Flash-cards et Fiches de révision.

La conversion PowerPoint → PDF (LibreOffice) du prompt d'origine n'est pas utilisée : les documents
importés sont des PDF (Word et texte ont leur propre extraction).

## Installation

Docker (recommandé) : tout est inclus dans l'image du backend (Tesseract fra/eng/osd, poppler,
Python 3, pypdf, PyMuPDF). Sans PyMuPDF, une image importée est lue directement par Tesseract
(même nettoyage), sans la mise à l'échelle 300 dpi. EasyOCR n'y est pas installé (plusieurs centaines de Mo) : Tesseract suffit.

Poste de développement macOS :

```bash
brew install tesseract tesseract-lang poppler
```

```bash
pip3 install pypdf pymupdf
```

Facultatif (repli EasyOCR, volumineux) :

```bash
pip3 install easyocr
```

LibreOffice (`brew install --cask libreoffice`) n'est nécessaire que pour convertir soi-même des
présentations en PDF avant de les importer.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `OCR_ENGINE` | `python` | `python` (module ci-dessus) ou `builtin` (extraction intégrée) |
| `OCR_PYTHON` | `python3` | Interpréteur utilisé par le worker |
| `OCR_SCRIPT` | `backend/ocr/studymate_ocr.py` | Chemin du module |
| `OCR_CACHE_DIR` | `<tmp>/cache_ocr` | Cache MD5 (`/app/cache_ocr` dans l'image) |
| `STUDYMATE_TESSDATA` | — | Dossier `tessdata` local (`fra.traineddata`…) |
| `OCR_MAX_PAGES` | `300` | Nombre maximal de pages analysées |

## Exemples d'appel

Extraction complète (JSON sur la sortie standard) :

```bash
python3 backend/ocr/studymate_ocr.py extraire cours.pdf --cache ./cache_ocr
```

Image importée (photo, scan) :

```bash
python3 backend/ocr/studymate_ocr.py image photo.jpg --cache ./cache_ocr
```

OCR d'une zone (page 2 ; boîte x, y, largeur, hauteur en proportions de la page ; résultat mis en
cache dans `cours_zones.json`) :

```bash
python3 backend/ocr/studymate_ocr.py zone cours.pdf 2 0.10 0.20 0.50 0.30
```

Depuis Python :

```python
from studymate_ocr import extraire
resultat = extraire("cours.pdf", "cache_ocr")
for p in resultat["pages"]:
    print(p["page"], p["source"], p["a_verifier"], p["texte"][:80])
```

Dans le conteneur :

```bash
docker compose exec worker sh -c 'python3 $OCR_SCRIPT extraire /chemin/cours.pdf --cache $OCR_CACHE_DIR'
```

Tests automatisés : `backend/tests/ocr.test.ts` — PDF mixte (texte + page numérisée), PDF avec
figure contenant du texte, image importée, fichier Word avec image, et base réunie d'un dossier
(texte collé + scan + PDF).
