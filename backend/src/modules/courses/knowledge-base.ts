import { prisma } from '../../services/prisma';
import { loadExtraction } from '../documents/documents.service';

const SOURCE_LABEL: Record<string, string> = { file: 'Fichier', scan: 'Scan', text: 'Texte collé' };

export interface KnowledgeBasePage {
  page: number | null;
  text: string;
  source: 'texte' | 'ocr' | 'vide' | null;
  aVerifier: string[];
  texteImages: string | null;
}

export interface KnowledgeBaseDocument {
  id: string;
  fileName: string;
  source: string;
  mimeType: string;
  method: string | null;
  pageCount: number | null;
  createdAt: Date;
  warnings: string[];
  corrected: boolean;
  pages: KnowledgeBasePage[];
}

/**
 * Base de connaissances d'un dossier : le texte extrait de tous ses documents prêts (fichiers,
 * scans, textes collés), réuni au même endroit, dans l'ordre d'ajout. C'est exactement le
 * contenu sur lequel s'appuient les QCM, flash-cards et fiches de révision.
 */
export async function buildKnowledgeBase(userId: string, courseId: string) {
  const docs = await prisma.document.findMany({
    where: { userId, courseId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, source: true, mimeType: true, pageCount: true, createdAt: true, processingStatus: true },
  });
  const documents: KnowledgeBaseDocument[] = [];
  const pending: { id: string; fileName: string; status: string }[] = [];
  for (const d of docs) {
    const extraction = d.processingStatus === 'READY' ? await loadExtraction(userId, d.id) : null;
    if (!extraction) {
      pending.push({ id: d.id, fileName: d.fileName, status: d.processingStatus });
      continue;
    }
    documents.push({
      id: d.id,
      fileName: d.fileName,
      source: d.source,
      mimeType: d.mimeType,
      method: extraction.method ?? null,
      pageCount: extraction.pageCount ?? d.pageCount,
      createdAt: d.createdAt,
      warnings: extraction.warnings ?? [],
      corrected: !!extraction.corrected,
      pages: extraction.pages
        .filter((p) => p.text?.trim())
        .map((p) => ({ page: p.page, text: p.text, source: p.source ?? null, aVerifier: p.aVerifier ?? [], texteImages: p.texteImages ?? null })),
    });
  }
  const characters = documents.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.text.length, 0), 0);
  return { documents, pending, characters };
}

/** Version texte (Markdown) de la base, à télécharger ou à relire hors de l'application. */
export function knowledgeBaseMarkdown(title: string, kb: Awaited<ReturnType<typeof buildKnowledgeBase>>) {
  const out: string[] = [
    `# Base de connaissances — ${title}`,
    '',
    `${kb.documents.length} document(s) · ${kb.characters.toLocaleString('fr-FR')} caractères · exportée le ${new Date().toLocaleString('fr-FR', { timeZone: 'UTC' })} (UTC)`,
    '',
    'Texte extrait de tous les documents du dossier. Les passages « OCR » ont été lus sur une image : à vérifier.',
  ];
  if (kb.pending.length) out.push('', `Non inclus (analyse non terminée ou en échec) : ${kb.pending.map((p) => p.fileName).join(', ')}.`);
  kb.documents.forEach((d, i) => {
    out.push('', '---', '', `## ${i + 1}. ${d.fileName}`, '', `*${SOURCE_LABEL[d.source] ?? d.source}${d.pageCount ? ` · ${d.pageCount} page(s)` : ''}${d.corrected ? ' · texte corrigé' : ''}*`);
    for (const p of d.pages) {
      const tags = [p.source === 'ocr' ? 'OCR, à vérifier' : null, p.texteImages ? 'contient du texte lu dans une image' : null].filter(Boolean);
      if (p.page !== null) out.push('', `### Page ${p.page}${tags.length ? ` (${tags.join(' ; ')})` : ''}`);
      out.push('', p.text.trim());
      if (p.aVerifier.length) out.push('', `> Nombres à vérifier (absents de l'image de la page) : ${p.aVerifier.join(', ')}`);
    }
  });
  return out.join('\n') + '\n';
}
