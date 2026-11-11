import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import { env } from '../config/env';

const run = promisify(execFile);

export interface ExtractedPage {
  page: number | null;
  text: string;
  /** texte = couche texte du PDF ; ocr = lu sur l'image (« OCR, à vérifier ») ; vide = illisible */
  source?: 'texte' | 'ocr' | 'vide';
  /** Nombres du texte natif non retrouvés sur l'image de la page : à vérifier. */
  aVerifier?: string[];
  /** Lignes « libellé + au moins 2 nombres » repérées sur la page. */
  tableaux?: string[][];
  /** Texte lu par OCR dans les images d'une page qui a aussi du texte (figures, extraits scannés). */
  texteImages?: string;
}

/** Intitulé ajouté devant le texte lu dans une image, pour qu'il rejoigne la base de connaissances. */
export const IMAGE_TEXT_HEADER = '[Texte lu dans une image — OCR, à vérifier]';

export interface ExtractionResult {
  method: 'pdf-text' | 'pdf-ocr' | 'docx' | 'text' | 'image-ocr';
  /** Moteur OCR utilisé par la méthode d'extraction locale (Tesseract fra+eng, EasyOCR…). */
  ocr?: { moteur: string | null; langues: string | null; indisponible: string | null };
  pageCount: number | null;
  pages: ExtractedPage[];
  // Pages pour lesquelles aucun texte fiable n'a pu être obtenu.
  warnings: string[];
}

export class ExtractionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MIN_TEXT_PER_PAGE = 25;

async function withTmp<T>(fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sm-extract-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function tesseract(imagePath: string) {
  try {
    const { stdout } = await run('tesseract', [imagePath, 'stdout', '-l', env.OCR_LANGUAGES, '--psm', '3'], { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') throw new ExtractionError('OCR_UNAVAILABLE', "Le moteur OCR (Tesseract) n'est pas installé sur ce serveur.");
    throw new ExtractionError('OCR_FAILED', 'La reconnaissance de texte a échoué.');
  }
}

export function normalizeText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Réponse du module Python backend/ocr/studymate_ocr.py (commande « extraire »). */
interface PythonExtraction {
  ok: boolean;
  raison?: string;
  pages_total: number;
  moteur: string | null;
  langues: string | null;
  ocr_indisponible: string | null;
  pages: { page: number; texte: string; source: 'texte' | 'ocr' | 'vide'; a_verifier: string[]; tableaux: string[][]; texte_images?: string }[];
}

const OCR_SCRIPT = process.env.OCR_SCRIPT ?? path.resolve(__dirname, '../../ocr/studymate_ocr.py');
const OCR_CACHE_DIR = process.env.OCR_CACHE_DIR ?? path.join(tmpdir(), 'cache_ocr');

/**
 * Méthode d'extraction principale des PDF et des images : OCR local en Python (rendu 300 dpi, Tesseract
 * fra+eng, cache MD5, nettoyage, vérification des nombres, tableaux). Renvoie null si le
 * module n'est pas utilisable (Python ou dépendances absents) : l'extraction de repli prend le relais.
 */
async function extractWithPython(buffer: Buffer, kind: 'pdf' | 'png' | 'jpg'): Promise<ExtractionResult | null> {
  if (env.OCR_ENGINE !== 'python') return null;
  return withTmp(async (dir) => {
    const file = path.join(dir, `doc.${kind}`);
    await writeFile(file, buffer);
    let out: string;
    try {
      ({ stdout: out } = await run(env.OCR_PYTHON, [OCR_SCRIPT, kind === 'pdf' ? 'extraire' : 'image', file, '--cache', OCR_CACHE_DIR], {
        maxBuffer: 128 * 1024 * 1024,
        timeout: 60 * 60 * 1000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      }));
    } catch {
      return null; // module indisponible : repli
    }
    const r = JSON.parse(out) as PythonExtraction;
    if (!r.ok) throw new ExtractionError('PDF_UNREADABLE', r.raison ?? 'Ce PDF est illisible ou protégé.');
    const warnings: string[] = [];
    const ocrPages = r.pages.filter((p) => p.source === 'ocr').map((p) => p.page);
    const emptyPages = r.pages.filter((p) => p.source === 'vide').map((p) => p.page);
    const imagePages = r.pages.filter((p) => p.texte_images?.trim()).map((p) => p.page);
    if (kind !== 'pdf') {
      if (ocrPages.length) warnings.push("Texte lu sur l'image (OCR, à vérifier).");
      else warnings.push("Peu ou pas de texte détecté dans l'image.");
    } else if (ocrPages.length) warnings.push(`Page(s) ${ocrPages.join(', ')} : texte lue(s) sur l'image (OCR, à vérifier).`);
    if (imagePages.length) warnings.push(`Page(s) ${imagePages.join(', ')} : texte trouvé dans une image de la page et ajouté (OCR, à vérifier).`);
    if (kind === 'pdf' && emptyPages.length) warnings.push(`Page(s) ${emptyPages.join(', ')} : aucun texte lisible.`);
    for (const p of r.pages) if (p.a_verifier.length) warnings.push(`Page ${p.page} : nombre(s) non visibles sur l'image, à vérifier : ${p.a_verifier.slice(0, 8).join(', ')}.`);
    if (r.ocr_indisponible) warnings.push(`Vérification OCR impossible : ${r.ocr_indisponible}.`);
    return {
      method: kind !== 'pdf' ? 'image-ocr' : ocrPages.length || imagePages.length ? 'pdf-ocr' : 'pdf-text',
      pageCount: r.pages_total,
      pages: r.pages.map((p) => {
        const images = normalizeText(p.texte_images ?? '');
        const text = normalizeText(p.texte);
        return {
          page: p.page,
          // Le texte des images rejoint le texte de la page : il est donc dans la base de connaissances.
          text: images ? `${text}\n\n${IMAGE_TEXT_HEADER}\n${images}` : text,
          source: p.source,
          aVerifier: p.a_verifier,
          tableaux: p.tableaux,
          ...(images ? { texteImages: images } : {}),
        };
      }),
      warnings,
      ocr: { moteur: r.moteur, langues: r.langues, indisponible: r.ocr_indisponible },
    };
  });
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const viaPython = await extractWithPython(buffer, 'pdf');
  if (viaPython) return viaPython;
  return withTmp(async (dir) => {
    const file = path.join(dir, 'doc.pdf');
    await writeFile(file, buffer);
    let pageCount: number;
    try {
      const { stdout } = await run('pdfinfo', [file], { timeout: 30_000 });
      pageCount = Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] ?? 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ExtractionError('PDF_TOOLS_UNAVAILABLE', 'Outils PDF (poppler) indisponibles.');
      throw new ExtractionError('PDF_UNREADABLE', 'Ce PDF est illisible ou protégé.');
    }
    if (!pageCount) throw new ExtractionError('PDF_EMPTY', 'Ce PDF ne contient aucune page.');
    const limit = Math.min(pageCount, 400);
    const pages: ExtractedPage[] = [];
    const warnings: string[] = [];
    let ocrUsed = false;
    for (let p = 1; p <= limit; p++) {
      const { stdout } = await run('pdftotext', ['-f', String(p), '-l', String(p), '-layout', '-enc', 'UTF-8', file, '-'], { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 });
      let text = normalizeText(stdout);
      if (text.replace(/\s/g, '').length < MIN_TEXT_PER_PAGE) {
        // Page probablement numérisée : rendu en image puis OCR.
        const prefix = path.join(dir, `p${p}`);
        await run('pdftoppm', ['-f', String(p), '-l', String(p), '-r', '200', '-png', file, prefix], { timeout: 120_000 });
        const img = (await readdir(dir)).find((f) => f.startsWith(`p${p}`) && f.endsWith('.png'));
        if (img) {
          text = normalizeText(await tesseract(path.join(dir, img)));
          ocrUsed = true;
        }
        if (text.replace(/\s/g, '').length < MIN_TEXT_PER_PAGE) warnings.push(`Page ${p} : texte absent ou illisible.`);
      }
      pages.push({ page: p, text });
    }
    if (pageCount > limit) warnings.push(`Seules les ${limit} premières pages ont été analysées.`);
    return { method: ocrUsed ? 'pdf-ocr' : 'pdf-text', pageCount, pages, warnings };
  });
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  // Conversion en HTML pour conserver titres et paragraphes, puis en texte structuré.
  // Les images du document (captures, schémas, pages scannées) sont lues par le même OCR.
  const images: { buffer: Buffer; kind: 'png' | 'jpg' }[] = [];
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const kind = image.contentType === 'image/png' ? 'png' : image.contentType === 'image/jpeg' ? 'jpg' : null;
        if (kind && images.length < 50) images.push({ buffer: Buffer.from(await image.readAsArrayBuffer()), kind });
        return { src: '' };
      }),
    },
  );
  const text = normalizeText(
    html
      .replace(/<h([1-6])[^>]*>/g, (_m, n) => '\n\n' + '#'.repeat(Number(n)) + ' ')
      .replace(/<\/h[1-6]>/g, '\n')
      .replace(/<li[^>]*>/g, '\n- ')
      .replace(/<\/(p|li|tr)>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
  const imageTexts: string[] = [];
  for (const img of images) {
    const r = await extractWithPython(img.buffer, img.kind).catch(() => null);
    const t = r?.pages.map((p) => p.text).join('\n').trim();
    if (t) imageTexts.push(t);
  }
  const warnings = imageTexts.length ? [`${imageTexts.length} image(s) du document lue(s) par OCR et ajoutée(s) (à vérifier).`] : [];
  const full = imageTexts.length ? `${text}\n\n${imageTexts.map((t) => `${IMAGE_TEXT_HEADER}\n${t}`).join('\n\n')}` : text;
  // Un .docx n'a pas de pagination fiable : pas de numéro de page (on ne l'invente pas).
  return {
    method: 'docx',
    pageCount: null,
    pages: [{ page: null, text: full, ...(imageTexts.length ? { texteImages: imageTexts.join('\n\n') } : {}) }],
    warnings,
  };
}

export async function extractText(buffer: Buffer, mime: string): Promise<ExtractionResult> {
  switch (mime) {
    case 'application/pdf':
      return extractPdf(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractDocx(buffer);
    case 'text/plain':
    case 'text/markdown':
      return { method: 'text', pageCount: null, pages: [{ page: null, text: normalizeText(buffer.toString('utf-8')) }], warnings: [] };
    case 'image/jpeg':
    case 'image/png': {
      // Même méthode que les pages scannées des PDF (300 dpi, niveaux de gris, Tesseract fra+eng, nettoyage).
      const viaPython = await extractWithPython(buffer, mime === 'image/png' ? 'png' : 'jpg');
      if (viaPython) return viaPython;
      return withTmp(async (dir) => {
        const file = path.join(dir, mime === 'image/png' ? 'img.png' : 'img.jpg');
        await writeFile(file, buffer);
        const text = normalizeText(await tesseract(file));
        const warnings = text.replace(/\s/g, '').length < MIN_TEXT_PER_PAGE ? ["Peu ou pas de texte détecté dans l'image."] : [];
        return { method: 'image-ocr', pageCount: 1, pages: [{ page: 1, text }], warnings };
      });
    }
    default:
      throw new ExtractionError('UNSUPPORTED_TYPE', 'Type de fichier non pris en charge.');
  }
}

export interface Chunk {
  page: number | null;
  content: string;
}

/** Découpe le texte en passages d'environ 1 200 caractères, sans couper au milieu d'un paragraphe si possible. */
export function chunkPages(pages: ExtractedPage[], target = 1200): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    if (!text.trim()) continue;
    const paragraphs = text.split(/\n{2,}/);
    let current = '';
    const flush = () => {
      if (current.trim()) chunks.push({ page, content: current.trim() });
      current = '';
    };
    for (const para of paragraphs) {
      if (para.length > target * 1.5) {
        flush();
        const sentences = para.split(/(?<=[.!?;:])\s+/);
        for (const s of sentences) {
          if ((current + ' ' + s).length > target) flush();
          current += (current ? ' ' : '') + s;
        }
        flush();
        continue;
      }
      if ((current + '\n\n' + para).length > target) flush();
      current += (current ? '\n\n' : '') + para;
    }
    flush();
  }
  return chunks;
}
