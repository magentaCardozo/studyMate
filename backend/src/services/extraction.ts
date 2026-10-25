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
}

export interface ExtractionResult {
  method: 'pdf-text' | 'pdf-ocr' | 'docx' | 'text' | 'image-ocr';
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

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
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
  const { value: html } = await mammoth.convertToHtml({ buffer });
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
  // Un .docx n'a pas de pagination fiable : pas de numéro de page (on ne l'invente pas).
  return { method: 'docx', pageCount: null, pages: [{ page: null, text }], warnings: [] };
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
    case 'image/png':
      return withTmp(async (dir) => {
        const file = path.join(dir, mime === 'image/png' ? 'img.png' : 'img.jpg');
        await writeFile(file, buffer);
        const text = normalizeText(await tesseract(file));
        const warnings = text.replace(/\s/g, '').length < MIN_TEXT_PER_PAGE ? ["Peu ou pas de texte détecté dans l'image."] : [];
        return { method: 'image-ocr', pageCount: 1, pages: [{ page: 1, text }], warnings };
      });
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
