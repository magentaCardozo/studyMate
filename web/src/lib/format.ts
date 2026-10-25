const locale = () => (document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR');

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale(), opts).format(new Date(d));
}

export const formatTime = (d: string | Date) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(d));
export const formatDateTime = (d: string | Date) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** « Aujourd'hui », « Hier », « Il y a 3 jours »… */
export function relativeDay(d: string | Date | null | undefined) {
  if (!d) return 'Jamais';
  const date = new Date(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(date)) / 86400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff === -1) return 'Demain';
  if (diff > 1 && diff < 7) return `Il y a ${diff} jours`;
  if (diff < -1 && diff > -7) return `Dans ${-diff} jours`;
  return formatDate(date);
}

export function daysUntil(d: string | Date) {
  const t = new Date(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOf(t) - startOf(new Date())) / 86400_000);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export const fileKind = (mime: string) =>
  mime === 'application/pdf' ? 'PDF' : mime.includes('wordprocessingml') ? 'Word' : mime.startsWith('image/') ? 'Image' : mime === 'text/markdown' ? 'Markdown' : 'Texte';

export const STATUS_LABEL: Record<string, string> = {
  PENDING_UPLOAD: 'Import en attente',
  UPLOADED: 'Importé',
  QUEUED: 'En file d’attente',
  PROCESSING: 'Analyse en cours',
  READY: 'Prêt',
  FAILED: 'Échec de l’analyse',
};

export const LESSON_STATUS: Record<string, string> = { NOT_STARTED: 'À commencer', IN_PROGRESS: 'En cours', COMPLETED: 'Terminée' };

export const ACTIVITY_LABEL: Record<string, string> = {
  lesson: 'Étude de leçon',
  flashcards: 'Cartes mémoire',
  quiz: 'Quiz',
  mock_exam: 'Examen blanc',
  summary: 'Résumé',
  free: 'Révision libre',
};

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Choix unique',
  MULTIPLE_CHOICE: 'Choix multiples',
  TRUE_FALSE: 'Vrai ou faux',
  SHORT_ANSWER: 'Réponse courte',
  FILL_BLANK: 'Texte à trous',
  MATCHING: 'Association',
};

export const sourceLabel = (s: { title: string; page: number | null }) => (s.page ? `${s.title}, p. ${s.page}` : s.title);
