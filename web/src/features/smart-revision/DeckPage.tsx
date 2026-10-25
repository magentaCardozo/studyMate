import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { relativeDay } from '../../lib/format';
import type { Deck, Flashcard } from '../../types/api';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, PageHeader } from '../../components/ui/Misc';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { GeneratedBadge, ReportButton, Sources } from './shared';
import { PlacementPicker, type PlacementValue } from '../courses/PlacementPicker';

function CardDialog({ deckId, card, onClose }: { deckId: string; card?: Flashcard; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [question, setQuestion] = useState(card?.question ?? '');
  const [answer, setAnswer] = useState(card?.answer ?? '');
  const [tags, setTags] = useState(card?.tags.join(', ') ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { question, answer, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
      return card ? api.patch(`/flashcards/cards/${card.id}`, body) : api.post(`/flashcards/decks/${deckId}/cards`, body);
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['deck', deckId] }), qc.invalidateQueries({ queryKey: ['decks'] }), toast.show(card ? 'Carte modifiée.' : 'Carte ajoutée.'), onClose()),
    onError: toast.error,
  });
  return (
    <Dialog open onClose={onClose} title={card ? 'Modifier la carte' : 'Nouvelle carte'} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!question.trim() || !answer.trim()} loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Textarea label="Recto — question ou notion" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        <Textarea label="Verso — réponse ou explication" hint="Markdown et $maths$ acceptés." rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <Input label="Thèmes (séparés par des virgules)" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
    </Dialog>
  );
}

export function NewDeckDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: null, folderId: null, lessonId: null });
  const save = useMutation({
    mutationFn: () => api.post<{ id: string }>('/flashcards/decks', { title, ...placement }),
    onSuccess: (d) => (qc.invalidateQueries({ queryKey: ['decks'] }), toast.show('Paquet créé.'), navigate(`/revision/decks/${d.id}`)),
    onError: toast.error,
  });
  return (
    <Dialog open onClose={onClose} size="lg" title="Nouveau paquet de cartes" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!title.trim()} loading={save.isPending} onClick={() => save.mutate()}>Créer</Button></>}>
      <div className="space-y-4">
        <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <PlacementPicker value={placement} onChange={setPlacement} withLesson optionalCourse />
      </div>
    </Dialog>
  );
}

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: deck, isLoading, error, refetch } = useQuery({ queryKey: ['deck', id], queryFn: () => api.get<Deck>(`/flashcards/decks/${id}`) });
  useDocumentTitle(deck?.title ?? 'Cartes');
  const [editing, setEditing] = useState<Flashcard | null | undefined>(undefined);
  const [delCard, setDelCard] = useState<Flashcard | null>(null);
  const [delDeck, setDelDeck] = useState(false);
  if (isLoading) return <Loading />;
  if (error || !deck) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const limitations = Array.isArray(deck.sources) ? [] : deck.sources.limitations ?? [];
  const toStudy = deck.counts.due + deck.counts.new;

  return (
    <div className="page max-w-4xl">
      <Breadcrumbs items={[{ label: 'Révisions', to: '/revision' }, ...(deck.course ? [{ label: deck.course.title, to: `/courses/${deck.course.id}` }] : []), { label: deck.title }]} />
      <PageHeader
        eyebrow={<div className="flex flex-wrap gap-2">{deck.origin === 'ai' ? <GeneratedBadge provider={deck.provider} /> : <Badge tone="neutral">Créé manuellement</Badge>}{deck.lesson && <Link to={`/lessons/${deck.lesson.id}`} className="meta hover:text-crimson">Leçon : {deck.lesson.title}</Link>}</div>}
        title={deck.title}
        subtitle={`${deck.counts.total} cartes · ${deck.counts.due} à revoir · ${deck.counts.new} nouvelles`}
        actions={
          <>
            <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditing(null)}>Carte</Button>
            <ButtonLink to={`/revision/study?deckId=${deck.id}${toStudy ? '' : '&mode=all'}`} icon={<Play size={16} />} >{toStudy ? 'Étudier' : 'Tout revoir'}</ButtonLink>
          </>
        }
      />
      {limitations.length > 0 && <div className="mb-4"><Notice>{limitations.join(' ')}</Notice></div>}
      {!deck.cards?.length ? (
        <EmptyState title="Ce paquet est vide." description="Ajoutez vos propres cartes." action={<Button onClick={() => setEditing(null)}>Ajouter une carte</Button>} />
      ) : (
        <ul className="space-y-3">
          {deck.cards.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
                  <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Recto</p><Markdown className="prose-p:my-0">{c.question}</Markdown></div>
                  <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Verso</p><Markdown className="prose-p:my-0">{c.answer}</Markdown></div>
                </div>
                <div className="flex shrink-0">
                  <IconButton label="Modifier" onClick={() => setEditing(c)}><Pencil size={15} /></IconButton>
                  <IconButton label="Supprimer" onClick={() => setDelCard(c)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.sourceReference && <Sources refs={[c.sourceReference]} compact />}
                {c.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                <span className="meta ml-auto">{c.lastReviewedAt ? `Prochaine révision : ${relativeDay(c.dueAt)}` : 'Jamais révisée'}</span>
                {deck.origin === 'ai' && <ReportButton targetType="flashcard" targetId={c.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 border-t border-line pt-4">
        <Button variant="ghost" className="text-danger" icon={<Trash2 size={15} />} onClick={() => setDelDeck(true)}>Supprimer le paquet</Button>
      </div>
      {editing !== undefined && <CardDialog deckId={deck.id} card={editing ?? undefined} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog open={!!delCard} onClose={() => setDelCard(null)} title="Supprimer la carte ?" message="La carte et son historique de révision seront supprimés." onConfirm={async () => { await api.del(`/flashcards/cards/${delCard!.id}`); qc.invalidateQueries({ queryKey: ['deck', id] }); toast.show('Carte supprimée.'); }} />
      <ConfirmDialog open={delDeck} onClose={() => setDelDeck(false)} title="Supprimer le paquet ?" message={`« ${deck.title} » et toutes ses cartes seront supprimés.`} onConfirm={async () => { await api.del(`/flashcards/decks/${deck.id}`); qc.invalidateQueries({ queryKey: ['decks'] }); toast.show('Paquet supprimé.'); navigate('/revision'); }} />
    </div>
  );
}
