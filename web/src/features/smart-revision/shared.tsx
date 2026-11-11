import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { api } from '../../lib/api';
import { sourceLabel } from '../../lib/format';
import type { SourceRef } from '../../types/api';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';

/** Références de sources : uniquement celles réellement fournies par l'extraction. */
export function Sources({ refs, compact = false }: { refs?: SourceRef[] | null; compact?: boolean }) {
  if (!refs?.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${compact ? '' : 'mt-1'}`}>
      {refs.map((r, i) => {
        const to = r.documentId ? `/documents/${r.documentId}` : r.lessonId ? `/lessons/${r.lessonId}` : null;
        const label = sourceLabel(r);
        return to ? (
          <Link key={i} to={to} className="chip hover:border-crimson hover:text-crimson" title="Ouvrir la source">
            {label}
          </Link>
        ) : (
          <span key={i} className="chip">{label}</span>
        );
      })}
    </span>
  );
}

export function ReportButton({ targetType, targetId }: { targetType: 'summary' | 'flashcard' | 'quiz_question' | 'chat_message'; targetId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('incorrect');
  const [comment, setComment] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/ai/feedback', { targetType, targetId, reason, comment: comment || undefined }),
    onSuccess: () => (setOpen(false), toast.show('Merci, le signalement a été enregistré.')),
    onError: toast.error,
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-crimson">
        <Flag size={12} /> Signaler une erreur
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Signaler un contenu incorrect" size="sm" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={() => send.mutate()} loading={send.isPending}>Envoyer</Button></>}>
        <div className="space-y-4">
          <Select label="Problème" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="incorrect">Information incorrecte</option>
            <option value="not_in_source">Absent de mes sources</option>
            <option value="unclear">Pas clair</option>
            <option value="offensive">Contenu inapproprié</option>
            <option value="other">Autre</option>
          </Select>
          <Textarea label="Précisions (facultatif)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Dialog>
    </>
  );
}

export function GeneratedBadge({ provider }: { provider?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 text-[11.5px] font-medium text-muted" title="Contenu généré automatiquement — à vérifier, ce n’est pas un contenu officiel de l’enseignant">
      {provider === 'demo' ? 'Généré · mode démo' : 'Généré par l’IA'}
    </span>
  );
}

const SUBFOLDER_LABEL = { qcm: 'QCM', flashcards: 'Flash-cards', fiches: 'Fiches de révision' } as const;
export type Subfolder = keyof typeof SUBFOLDER_LABEL;

/** Fil d'Ariane d'un contenu généré : il est rangé dans un sous-dossier de son dossier. */
export function revisionCrumbs(course: { id: string; title: string } | null | undefined, sub: Subfolder, current: string) {
  if (!course) return [{ label: 'Révisions', to: '/revision' }, { label: current }];
  return [
    { label: 'Mes dossiers', to: '/courses' },
    { label: course.title, to: `/courses/${course.id}` },
    { label: SUBFOLDER_LABEL[sub], to: `/courses/${course.id}?s=${sub}` },
    { label: current },
  ];
}

/** Page à rejoindre après suppression d'un contenu généré : son sous-dossier, sinon Révisions. */
export const revisionHome = (course: { id: string } | null | undefined, sub: Subfolder) => (course ? `/courses/${course.id}?s=${sub}` : '/revision');

/** La mention « mode démonstration » est déjà portée par le badge : on ne la répète pas en bandeau. */
export const withoutDemoNote = (limitations: string[] | undefined) => (limitations ?? []).filter((l) => !/^\s*Mode démonstration/i.test(l));
