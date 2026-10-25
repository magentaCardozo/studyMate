export interface AllowedType {
  mime: string;
  extensions: string[];
  label: string;
}

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'], label: 'Word' },
  { mime: 'text/plain', extensions: ['txt'], label: 'Texte' },
  { mime: 'text/markdown', extensions: ['md', 'markdown'], label: 'Markdown' },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'Image JPEG' },
  { mime: 'image/png', extensions: ['png'], label: 'Image PNG' },
];

export function extensionOf(fileName: string) {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** Type autorisé correspondant au nom de fichier ET au type MIME déclaré. */
export function matchAllowedType(fileName: string, mime: string): AllowedType | null {
  const ext = extensionOf(fileName);
  const type = ALLOWED_TYPES.find((t) => t.extensions.includes(ext));
  if (!type) return null;
  // Certains navigateurs envoient un type vide ou générique pour .md : on se fie à l'extension.
  const genericMimes = ['', 'application/octet-stream', 'text/x-markdown'];
  if (type.mime !== mime && !genericMimes.includes(mime)) return null;
  return type;
}

/**
 * Vérifie la signature binaire réelle du fichier (on ne se fie jamais au seul type déclaré).
 */
export function sniffMatches(buffer: Buffer, mime: string): boolean {
  const startsWith = (bytes: number[]) => bytes.every((b, i) => buffer[i] === b);
  switch (mime) {
    case 'application/pdf':
      return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith([0x50, 0x4b, 0x03, 0x04]) && buffer.includes(Buffer.from('word/'));
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'text/plain':
    case 'text/markdown': {
      const sample = buffer.subarray(0, 64 * 1024);
      if (sample.includes(0)) return false;
      try {
        // stream: true tolère un caractère multi-octets coupé en fin d'échantillon.
        new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
        return true;
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'document';
}
