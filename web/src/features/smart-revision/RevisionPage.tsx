import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Layers, ListChecks, Play, Plus, Sparkles, Timer, TrendingDown } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, relativeDay, ACTIVITY_LABEL } from '../../lib/format';
import type { Deck, Quiz, StudySession } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Badge, PageHeader } from '../../components/ui/Misc';
import { Dialog } from '../../components/ui/Dialog';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useAllCourses } from '../courses/hooks';
import { AiStatusNotice, GenerateDialog, useAiStatus, type GenerateKind } from './GenerateDialog';
import { GeneratedBadge } from './shared';
import { NewDeckDialog } from './DeckPage';

interface SummaryItem {
  id: string;
  title: string;
  length: string;
  provider: string;
  createdAt: string;
  course: { title: string } | null;
}

function ScopePicker({ onPick, onClose, kind }: { onPick: (courseId: string, title: string) => void; onClose: () => void; kind: GenerateKind }) {
  const courses = useAllCourses();
  const [courseId, setCourseId] = useState('');
  return (
    <Dialog open onClose={onClose} title="Choisir les sources" description="Le contenu sera généré uniquement à partir de la base de connaissances du dossier choisi." size="sm" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!courseId} onClick={() => onPick(courseId, courses.data!.find((c) => c.id === courseId)!.title)}>Continuer</Button></>}>
      <Select label="Dossier" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        <option value="">Choisir…</option>
        {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </Select>
      {kind === 'mock' && <p className="mt-3 text-xs text-muted">Examen d’entraînement — distinct d’un examen officiel.</p>}
    </Dialog>
  );
}

export default function RevisionPage() {
  useDocumentTitle('Révisions');
  const [params, setParams] = useSearchParams();
  const status = useAiStatus();
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/flashcards/decks') });
  const quizzes = useQuery({ queryKey: ['quizzes'], queryFn: () => api.get<Quiz[]>('/quizzes') });
  const summaries = useQuery({ queryKey: ['summaries'], queryFn: () => api.get<SummaryItem[]>('/summaries') });
  const upcoming = useQuery({ queryKey: ['sessions', 'upcoming'], queryFn: () => api.get<StudySession[]>(`/study-sessions?status=PLANNED&from=${new Date().toISOString()}`) });
  const weak = useQuery({ queryKey: ['progress', 'courses'], queryFn: () => api.get<{ id: string; title: string; quizAverage: number | null; quizAttempts: number }[]>('/progress/courses') });
  const [picking, setPicking] = useState<GenerateKind | null>(null);
  const [generate, setGenerate] = useState<{ kind: GenerateKind; courseId: string; title: string } | null>(null);
  const [newDeck, setNewDeck] = useState(false);

  useEffect(() => {
    const g = params.get('generate') as GenerateKind | null;
    if (g) (setPicking(g), setParams({}, { replace: true }));
  }, [params, setParams]);

  if (decks.error) return <div className="page"><ErrorState error={decks.error} onRetry={decks.refetch} /></div>;
  const dueTotal = decks.data?.reduce((n, d) => n + d.counts.due + d.counts.new, 0) ?? 0;
  const weakCourses = weak.data?.filter((c) => c.quizAverage !== null && c.quizAverage < 60) ?? [];
  const mocks = quizzes.data?.filter((q) => q.configuration.isMockExam) ?? [];
  const regular = quizzes.data?.filter((q) => !q.configuration.isMockExam) ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Révisions"
        subtitle="Transformez vos supports de cours en apprentissage actif."
        actions={dueTotal > 0 ? <ButtonLink to="/revision/study" icon={<Play size={16} />}>Réviser {dueTotal} carte{dueTotal > 1 ? 's' : ''}</ButtonLink> : undefined}
      />
      <div className="mb-6"><AiStatusNotice status={status.data} /></div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { kind: 'qcm' as const, label: 'Générer un QCM', icon: <ListChecks size={18} /> },
          { kind: 'summary' as const, label: 'Fiches de révision', icon: <FileText size={18} /> },
          { kind: 'flashcards' as const, label: 'Cartes mémoire', icon: <Layers size={18} /> },
          { kind: 'mock' as const, label: 'Examen blanc', icon: <Timer size={18} /> },
        ].map((a) => (
          <button key={a.kind} type="button" onClick={() => setPicking(a.kind)} className="card flex flex-col items-start gap-2 p-4 text-left hover:border-crimson/40">
            <span className="text-crimson">{a.icon}</span>
            <span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Cartes mémoire</h2>
              <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setNewDeck(true)}>Paquet manuel</Button>
            </div>
            {decks.isLoading ? <Loading /> : !decks.data?.length ? (
              <EmptyState icon={<Layers size={22} />} title="Aucun paquet de cartes" description="Générez des cartes depuis une leçon ou créez-les vous-même." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {decks.data.map((d) => (
                  <li key={d.id} className="card flex flex-col p-4">
                    <Link to={`/revision/decks/${d.id}`} className="font-medium hover:text-crimson">{d.title}</Link>
                    <p className="meta">{d.course?.title ?? 'Sans dossier'} · {d.counts.total} cartes</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.origin === 'ai' && <GeneratedBadge provider={d.provider} />}
                      {d.counts.due > 0 && <Badge tone="crimson">{d.counts.due} à revoir</Badge>}
                      {d.counts.new > 0 && <Badge tone="neutral">{d.counts.new} nouvelles</Badge>}
                    </div>
                    {d.counts.due + d.counts.new > 0 && <ButtonLink to={`/revision/study?deckId=${d.id}`} size="sm" variant="secondary" className="mt-3 self-start">Étudier</ButtonLink>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="section-title mb-3">Quiz</h2>
            {quizzes.isLoading ? <Loading /> : !regular.length ? (
              <p className="meta">Aucun quiz pour le moment.</p>
            ) : (
              <ul className="card divide-y divide-line">
                {regular.map((q) => (
                  <li key={q.id}>
                    <Link to={`/revision/quizzes/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                      <ListChecks size={17} className="text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{q.title}</p>
                        <p className="meta">{q._count?.questions} questions · {q.configuration.mode === 'exam' ? 'Examen' : 'Entraînement'} · {relativeDay(q.createdAt)}</p>
                      </div>
                      {q.lastAttempt?.maxScore ? <Badge tone={(q.lastAttempt.score ?? 0) / q.lastAttempt.maxScore >= 0.6 ? 'success' : 'warning'}>{Math.round(((q.lastAttempt.score ?? 0) / q.lastAttempt.maxScore) * 100)} %</Badge> : q.lastAttempt?.status === 'IN_PROGRESS' ? <Badge tone="neutral">En cours</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mocks.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Examens blancs</h2>
              <ul className="card divide-y divide-line">
                {mocks.map((q) => (
                  <li key={q.id}><Link to={`/revision/quizzes/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60"><Timer size={17} className="text-muted" /><span className="flex-1 truncate text-sm font-medium">{q.title}</span><span className="meta">{q.configuration.durationMinutes} min</span></Link></li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="section-title mb-3">Résumés</h2>
            {!summaries.data?.length ? <p className="meta">Aucun résumé généré.</p> : (
              <ul className="card divide-y divide-line">
                {summaries.data.map((s) => (
                  <li key={s.id}><Link to={`/revision/summaries/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60"><FileText size={17} className="text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{s.title}</p><p className="meta">{s.course?.title ?? ''} · {relativeDay(s.createdAt)}</p></div></Link></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Sessions à venir</h2>
            {upcoming.data?.length ? (
              <ul className="space-y-2.5">{upcoming.data.slice(0, 5).map((s) => <li key={s.id}><p className="text-sm font-medium">{s.course?.title}</p><p className="meta">{formatDateTime(s.scheduledStart)} · {ACTIVITY_LABEL[s.activityType]}</p></li>)}</ul>
            ) : <p className="meta">Aucune session prévue. <Link to="/coach" className="text-crimson hover:underline">Planifier</Link></p>}
          </div>
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><TrendingDown size={15} /> Dossiers à renforcer</h2>
            {weakCourses.length ? (
              <ul className="space-y-2">{weakCourses.map((c) => <li key={c.id} className="flex justify-between text-sm"><Link to={`/courses/${c.id}`} className="hover:text-crimson">{c.title}</Link><span className="text-warning">{c.quizAverage} %</span></li>)}</ul>
            ) : <p className="meta">Les dossiers dont la moyenne aux quiz est inférieure à 60 % apparaîtront ici, d’après vos résultats réels.</p>}
          </div>
          <div className="card p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><Sparkles size={15} className="text-crimson" /> Conseil</p>
            <p className="meta mt-1">Générez depuis une leçon ou un document précis : le contenu sera plus ciblé et les sources plus faciles à vérifier.</p>
          </div>
        </aside>
      </div>

      {picking && <ScopePicker kind={picking} onClose={() => setPicking(null)} onPick={(courseId, title) => (setGenerate({ kind: picking, courseId, title }), setPicking(null))} />}
      {generate && <GenerateDialog open onClose={() => setGenerate(null)} scope={{ courseId: generate.courseId }} scopeLabel={`dossier « ${generate.title} »`} initialKind={generate.kind} />}
      {newDeck && <NewDeckDialog onClose={() => setNewDeck(false)} />}
    </div>
  );
}
