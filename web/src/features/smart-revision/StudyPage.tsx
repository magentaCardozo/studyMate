import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, Shuffle } from 'lucide-react';
import { api } from '../../lib/api';
import type { Flashcard } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { ProgressBar } from '../../components/ui/Misc';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { Sources } from './shared';

const RATINGS = [
  { value: 0, label: 'À revoir', hint: 'dans quelques minutes', key: '1', cls: 'border-danger/30 hover:bg-danger-soft' },
  { value: 1, label: 'Difficile', hint: 'bientôt', key: '2', cls: 'border-warning/40 hover:bg-warning-soft' },
  { value: 2, label: 'Compris', hint: 'plus tard', key: '3', cls: 'border-success/40 hover:bg-success-soft' },
  { value: 3, label: 'Facile', hint: 'bien plus tard', key: '4', cls: 'border-line hover:bg-ivory' },
] as const;

/** Mode étude : révéler, s'auto-évaluer ; l'intervalle suivant dépend des réponses réelles (SM-2). */
export default function StudyPage() {
  useDocumentTitle('Étude des cartes');
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const deckId = params.get('deckId') ?? undefined;
  const [mode, setMode] = useState(params.get('mode') ?? 'due');
  const [shuffle, setShuffle] = useState(false);
  const [tag, setTag] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['study', deckId, mode, shuffle, tag],
    queryFn: () => api.get<Flashcard[]>(`/flashcards/study?${new URLSearchParams({ ...(deckId ? { deckId } : {}), mode, shuffle: String(shuffle), ...(tag ? { tag } : {}) })}`),
    refetchOnMount: 'always',
  });
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) (setQueue(data), setIndex(0), setRevealed(false), setResults([]));
  }, [data]);
  const tags = useMemo(() => [...new Set((data ?? []).flatMap((c) => c.tags))], [data]);
  const card = queue[index];

  const rate = async (rating: number) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await api.post(`/flashcards/cards/${card.id}/review`, { rating, clientOpId: crypto.randomUUID() });
      setResults((r) => [...r, rating]);
      // « À revoir » : la carte revient en fin de séance.
      if (rating === 0) setQueue((q) => [...q, card]);
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === ' ' && !revealed) (e.preventDefault(), setRevealed(true));
      if (revealed) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const finished = queue.length > 0 && index >= queue.length;
  const header = (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <h1 className="font-serif text-2xl font-semibold">Étude des cartes</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select aria-label="Cartes à étudier" value={mode} onChange={(e) => (setMode(e.target.value), setParams((p) => (p.set('mode', e.target.value), p)))} className="h-9 text-sm">
          <option value="due">À réviser</option>
          <option value="difficult">Difficiles</option>
          <option value="all">Toutes</option>
        </Select>
        {tags.length > 0 && (
          <Select aria-label="Filtrer par thème" value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 text-sm">
            <option value="">Tous les thèmes</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
        <Button size="sm" variant={shuffle ? 'primary' : 'secondary'} icon={<Shuffle size={14} />} onClick={() => setShuffle((s) => !s)} aria-pressed={shuffle}>Mélanger</Button>
      </div>
    </div>
  );

  if (!queue.length)
    return (
      <div className="page max-w-3xl">
        {header}
        <EmptyState icon={<CheckCircle2 size={22} />} title="Aucune carte à réviser pour le moment." description="Revenez plus tard : les cartes réapparaissent quand il est temps de les revoir." action={<><Button variant="secondary" onClick={() => setMode('all')}>Revoir toutes les cartes</Button><ButtonLink to="/revision" variant="ghost">Retour</ButtonLink></>} />
      </div>
    );

  if (finished) {
    const known = results.filter((r) => r >= 2).length;
    return (
      <div className="page max-w-3xl">
        {header}
        <div className="card p-8 text-center">
          <CheckCircle2 size={36} className="mx-auto text-success" />
          <h2 className="mt-3 font-serif text-2xl font-semibold">Séance terminée</h2>
          <p className="mt-2 text-muted">{results.length} réponses · {known} comprises ou faciles · {results.length - known} à retravailler.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => (qc.invalidateQueries({ queryKey: ['decks'] }), refetch())}>Nouvelle séance</Button>
            <ButtonLink to={deckId ? `/revision/decks/${deckId}` : '/revision'}>Terminer</ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page max-w-3xl">
      {header}
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>Carte {index + 1} / {queue.length}</span>
        {card.deck && <Link to={`/revision/decks/${card.deck.id}`} className="hover:text-crimson">{card.deck.title}</Link>}
      </div>
      <ProgressBar value={(index / queue.length) * 100} label="Avancement de la séance" />
      <div className="card mt-5 flex min-h-[320px] flex-col p-6 md:p-8" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Question</p>
        <div className="mt-2 text-lg"><Markdown>{card.question}</Markdown></div>
        {revealed && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Réponse</p>
            <div className="mt-2"><Markdown>{card.answer}</Markdown></div>
            {card.sourceReference && <Sources refs={[card.sourceReference]} />}
          </div>
        )}
        <div className="mt-auto pt-6">
          {!revealed ? (
            <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>Afficher la réponse <span className="ml-1 hidden text-xs opacity-70 md:inline">(Espace)</span></Button>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {RATINGS.map((r) => (
                <button key={r.value} type="button" disabled={busy} onClick={() => rate(r.value)} className={`rounded-md border bg-white px-3 py-2.5 text-center transition-colors ${r.cls}`}>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-[11.5px] text-muted">{r.hint} <span className="hidden md:inline">· {r.key}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
