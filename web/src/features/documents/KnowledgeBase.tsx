import { useQuery } from '@tanstack/react-query';
import { ClipboardPaste, FileText, Layers, ListChecks, ScanLine, Timer, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { Spinner } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { useQuickActions } from './QuickActions';
import type { GenerateKind } from '../smart-revision/GenerateDialog';

export interface KnowledgeBaseStats {
  documents: number;
  bySource: { file: number; scan: number; text: number };
  ready: number;
  processing: number;
  failed: number;
  pages: number;
  characters: number;
  canGenerate: boolean;
}

export const useKnowledgeBase = (courseId: string | undefined, poll = false) =>
  useQuery({
    queryKey: ['knowledge-base', courseId],
    queryFn: () => api.get<KnowledgeBaseStats>(`/courses/${courseId}/knowledge-base`),
    enabled: !!courseId,
    // Suivi automatique tant que des documents sont en cours d'analyse.
    refetchInterval: (q) => (poll || (q.state.data?.processing ?? 0) > 0 ? 3000 : false),
  });

/** Les trois façons d'alimenter la base de connaissances d'un dossier. */
export function AddToKnowledgeBase({ courseId, folderId }: { courseId: string; folderId?: string | null }) {
  const quick = useQuickActions();
  const placement = { courseId, folderId: folderId ?? null };
  const cards = [
    { title: 'Importer un PDF', hint: 'Supports de cours, polycopiés (Word et texte acceptés)', icon: <Upload size={20} />, run: () => quick.openImport(placement) },
    { title: 'Scanner un document', hint: 'Photos de notes ou de pages imprimées, texte reconnu (OCR)', icon: <ScanLine size={20} />, run: () => quick.openScan(placement) },
    { title: 'Coller du texte', hint: 'Extrait de cours, notes, transcription', icon: <ClipboardPaste size={20} />, run: () => quick.openPaste(placement) },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <button key={c.title} type="button" onClick={c.run} className="card flex items-start gap-3 p-4 text-left transition-colors hover:border-crimson/40 hover:bg-crimson-soft/30">
          <span className="mt-0.5 text-crimson">{c.icon}</span>
          <span>
            <span className="block text-sm font-semibold">{c.title}</span>
            <span className="block text-[12.5px] leading-snug text-muted">{c.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Version compacte des trois modes d'ajout, quand le dossier contient déjà des documents. */
export function ImportButtons({ courseId }: { courseId: string }) {
  const quick = useQuickActions();
  const placement = { courseId, folderId: null };
  return (
    <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
      <Button size="sm" icon={<Upload size={15} />} onClick={() => quick.openImport(placement)} aria-label="Importer un PDF">
        <span className="sm:hidden">PDF</span><span className="hidden sm:inline">Importer un PDF</span>
      </Button>
      <Button size="sm" variant="secondary" icon={<ScanLine size={15} />} onClick={() => quick.openScan(placement)}>Scanner</Button>
      <Button size="sm" variant="secondary" icon={<ClipboardPaste size={15} />} onClick={() => quick.openPaste(placement)} aria-label="Coller du texte">
        <span className="sm:hidden">Texte</span><span className="hidden sm:inline">Coller du texte</span>
      </Button>
    </div>
  );
}

export function KnowledgeBaseStatus({ stats }: { stats?: KnowledgeBaseStats }) {
  if (!stats) return null;
  if (!stats.documents) return <p className="meta">La base de connaissances est vide : ajoutez au moins un document pour pouvoir générer des révisions.</p>;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
      <span>{plural(stats.documents, 'document')}</span>
      {stats.processing > 0 ? (
        <span className="inline-flex items-center gap-1 text-warning"><Spinner size={12} /> {stats.processing} en cours d’analyse</span>
      ) : (
        stats.ready === stats.documents && <span className="text-success">· tous analysés</span>
      )}
      {stats.failed > 0 && <span className="text-danger">· {stats.failed} en échec</span>}
    </p>
  );
}

/** Exploiter la base : QCM, fiches de révision, cartes mémoire, examen blanc. */
export function UseKnowledgeBase({ canGenerate, onGenerate }: { canGenerate: boolean; onGenerate: (kind: GenerateKind) => void }) {
  const actions: { kind: GenerateKind; title: string; hint: string; icon: React.ReactNode }[] = [
    { kind: 'qcm', title: 'Questionnaire à choix multiple', hint: 'QCM corrigé avec explications et sources', icon: <ListChecks size={20} /> },
    { kind: 'summary', title: 'Fiches de révision', hint: 'Notions clés, définitions, formules, exemples', icon: <FileText size={20} /> },
    { kind: 'flashcards', title: 'Cartes mémoire', hint: 'Questions-réponses avec répétition espacée', icon: <Layers size={20} /> },
    { kind: 'mock', title: 'Examen blanc', hint: 'Minuté, corrigé après la remise', icon: <Timer size={20} /> },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map((a) => (
        <button
          key={a.kind}
          type="button"
          disabled={!canGenerate}
          onClick={() => onGenerate(a.kind)}
          className="card flex flex-col items-start gap-2 p-4 text-left transition-colors enabled:hover:border-crimson/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-crimson">{a.icon}</span>
          <span className="text-sm font-semibold">{a.title}</span>
          <span className="text-[12.5px] leading-snug text-muted">{a.hint}</span>
        </button>
      ))}
    </div>
  );
}
