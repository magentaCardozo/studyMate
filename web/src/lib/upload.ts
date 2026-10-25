import { api, ApiError } from './api';
import type { DocumentItem } from '../types/api';

/** Import de fichiers : PDF en priorité (Word et texte acceptés). Les images passent par le scan. */
export const ACCEPT = '.pdf,.docx,.txt,.md,.markdown';
export const MAX_MB = 25;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Validation côté client (le serveur revalide systématiquement). */
export function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return `« ${file.name} » est une image : utilisez « Scanner un document ».`;
  if (!MIME_BY_EXT[ext]) return `« ${file.name} » : format non pris en charge (PDF, Word, texte).`;
  if (file.size > MAX_MB * 1024 * 1024) return `« ${file.name} » dépasse ${MAX_MB} Mo.`;
  if (file.size === 0) return `« ${file.name} » est vide.`;
  return null;
}

/** Un document appartient toujours à un dossier (courseId), éventuellement à un sous-dossier. */
export interface Placement {
  courseId: string | null;
  folderId?: string | null;
}

/** Import sécurisé en trois étapes : autorisation, envoi vers l'URL signée, confirmation. */
export async function uploadDocument(file: File | Blob, fileName: string, placement: Placement, onProgress?: (pct: number) => void, source: 'file' | 'scan' = 'file'): Promise<DocumentItem> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = MIME_BY_EXT[ext] ?? file.type;
  const auth = await api.post<{ document: DocumentItem; upload: { url: string; method: string; headers: Record<string, string> } }>('/documents/upload-url', {
    fileName,
    mimeType,
    fileSize: file.size,
    courseId: placement.courseId,
    folderId: placement.folderId ?? null,
    source,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', auth.upload.url);
    for (const [k, v] of Object.entries(auth.upload.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        const err = JSON.parse(xhr.responseText).error;
        reject(new ApiError(xhr.status, err.code, err.message));
      } catch {
        reject(new ApiError(xhr.status, 'UPLOAD_FAILED', "L'envoi du fichier a échoué."));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', "Connexion interrompue pendant l'envoi. Réessayez."));
    xhr.send(file);
  });
  return api.post<DocumentItem>(`/documents/${auth.document.id}/confirm-upload`);
}

/** Ouvre ou télécharge un document via une URL signée à courte durée de vie. */
export async function openDocument(id: string, inline = true) {
  const { url } = await api.post<{ url: string }>(`/documents/${id}/download-url`, { inline });
  return url;
}
