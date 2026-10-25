import { prisma } from '../../services/prisma';
import { storage, documentPrefix } from '../../services/storage';
import { chunkPages, extractText, ExtractionError, type ExtractedPage } from '../../services/extraction';
import { notify } from '../../services/notifications';
import { logger } from '../../config/logger';

export const originalKey = (userId: string, documentId: string) => documentPrefix(userId, documentId) + 'original';
export const extractedKey = (userId: string, documentId: string) => documentPrefix(userId, documentId) + 'extracted.json';

export interface StoredExtraction {
  method: string;
  pageCount: number | null;
  pages: ExtractedPage[];
  warnings: string[];
  corrected?: boolean;
  updatedAt: string;
}

export async function enqueueProcessing(documentId: string, jobType = 'extract') {
  await prisma.$transaction([
    prisma.document.update({ where: { id: documentId }, data: { processingStatus: 'QUEUED', processingError: null } }),
    prisma.documentProcessingJob.create({ data: { documentId, jobType } }),
  ]);
}

export async function saveExtraction(userId: string, documentId: string, data: StoredExtraction) {
  await storage.put(extractedKey(userId, documentId), Buffer.from(JSON.stringify(data)), 'application/json');
  const chunks = chunkPages(data.pages);
  await prisma.$transaction([
    prisma.documentChunk.deleteMany({ where: { documentId } }),
    prisma.documentChunk.createMany({ data: chunks.map((c, i) => ({ documentId, userId, ordinal: i, page: c.page, content: c.content })) }),
  ]);
  return chunks.length;
}

export async function loadExtraction(userId: string, documentId: string): Promise<StoredExtraction | null> {
  try {
    return JSON.parse((await storage.get(extractedKey(userId, documentId))).toString('utf-8'));
  } catch {
    return null;
  }
}

/** Traitement asynchrone d'un document : extraction, OCR si nécessaire, découpage en passages. */
export async function processDocument(documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: 'PROCESSING' } });
  const buffer = await storage.get(doc.storageKey);
  const result = await extractText(buffer, doc.mimeType);
  const totalChars = result.pages.reduce((n, p) => n + p.text.replace(/\s/g, '').length, 0);
  const chunkCount = await saveExtraction(doc.userId, doc.id, { ...result, updatedAt: new Date().toISOString() });
  const insufficient = totalChars < 40;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      processingStatus: 'READY',
      pageCount: result.pageCount,
      extractionMethod: result.method,
      extractedTextKey: extractedKey(doc.userId, doc.id),
      processingError: insufficient
        ? "Aucun texte exploitable n'a été trouvé. Vous pouvez corriger ou saisir le texte manuellement."
        : result.warnings.length
          ? result.warnings.slice(0, 5).join(' ')
          : null,
    },
  });
  logger.info({ documentId, method: result.method, chunkCount, totalChars }, 'Document traité');
  await notify(doc.userId, {
    type: 'document_ready',
    title: 'Document prêt',
    body: `« ${doc.fileName} » a été analysé${insufficient ? ', mais aucun texte exploitable n’a été trouvé' : ''}.`,
    link: `/documents/${doc.id}`,
    dedupeKey: `document_ready:${doc.id}:${Date.now()}`,
    preference: 'documents',
  });
}

export async function markProcessingFailed(documentId: string, err: unknown) {
  const message = err instanceof ExtractionError ? err.message : "Le traitement du document a échoué. Vous pouvez relancer l'analyse.";
  const doc = await prisma.document.update({ where: { id: documentId }, data: { processingStatus: 'FAILED', processingError: message } });
  await notify(doc.userId, {
    type: 'document_failed',
    title: 'Échec du traitement',
    body: `« ${doc.fileName} » n'a pas pu être analysé : ${message}`,
    link: `/documents/${doc.id}`,
    dedupeKey: `document_failed:${doc.id}:${Date.now()}`,
    preference: 'documents',
  });
}

export const isRetryable = (err: unknown) => !(err instanceof ExtractionError);
