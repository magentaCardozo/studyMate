import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, CircleAlert, Layers, ListChecks, Play, RotateCcw, Timer } from 'lucide-react';
import { api } from '../../lib/api';
import { plural, relativeDay } from '../../lib/format';
import type { Attempt } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Badge, PageHeader, ProgressBar } from '../../components/ui/Misc';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';

interface ToFinish {
  quizId: string;
  title: string;
  course: { id: string; title: string } | null;
  isMockExam: boolean;
  isReview: boolean;
  totalQuestions: number;
  status: 'in_progress' | 'not_started';
  attemptId: string | null;
  answered: number;
  startedAt: string | null;
  deadlineAt: string | null;
  createdAt: string;
}
interface Mistake {
  questionId: string;
  question: string;
  quiz: { id: string; title: string };
  course: { id: string; title: string } | null;
  wrongCount: number;
  lastAnsweredAt: string;
}
interface ReviewData {
  toFinish: ToFinish[];
  mistakes: Mistake[];
  cards: { due: number; new: number };
}

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: 'crimson' | 'warning' | 'neutral' }) {
  const color = tone === 'crimson' ? 'text-crimson bg-crimson-soft' : tone === 'warning' ? 'text-warning bg-warning/10' : 'text-charcoal bg-charcoal/[0.06]';
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${color}`} aria-hidden>{icon}</span>
      <span>
        <span className="block font-serif text-2xl font-medium leading-none tabular-nums">{value}</span>
        <span className="text-[13px] text-muted">{label}</span>
      </span>
    </div>
  );
}

/**
 * Onglet Révisions : on n'y génère rien (la génération se fait dans les dossiers).
 * On y termine les QCM commencés ou jamais faits, et on y retravaille les questions ratées.
 */
export default function RevisionPage() {
  useDocumentTitle('Révisions');
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  // Toujours à jour en arrivant sur l'onglet (réponses données entre-temps dans un QCM).
  const review = useQuery({ queryKey: ['review'], queryFn: () => api.get<ReviewData>('/review'), staleTime: 0 });
  // Démarre (ou reprend) la tentative d'un QCM puis ouvre la page de réponse.
  const start = useMutation({
    mutationFn: (quizId: string) => api.post<Attempt>(`/quizzes/${quizId}/attempts`),
    onSuccess: (a) => navigate(`/revision/attempts/${a.id}`),
    onError: toast.error,
  });
  // QCM de rattrapage avec les questions ratées (toutes, ou celles d'un dossier).
  const retry = useMutation({
    mutationFn: async (courseId?: string) => {
      const quiz = await api.post<{ id: string }>('/review/mistakes-quiz', courseId ? { courseId } : {});
      return api.post<Attempt>(`/quizzes/${quiz.id}/attempts`);
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['review'] });
      navigate(`/revision/attempts/${a.id}`);
    },
    onError: toast.error,
  });

  // Questions ratées regroupées par dossier.
  const byCourse = useMemo(() => {
    const groups = new Map<string, { course: Mistake['course']; items: Mistake[] }>();
    for (const m of review.data?.mistakes ?? []) {
      const key = m.course?.id ?? '—';
      if (!groups.has(key)) groups.set(key, { course: m.course, items: [] });
      groups.get(key)!.items.push(m);
    }
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
  }, [review.data]);

  if (review.isLoading) return <Loading />;
  if (review.error || !review.data) return <div className="page"><ErrorState error={review.error} onRetry={review.refetch} /></div>;
  const { toFinish, mistakes, cards } = review.data;
  const cardsToStudy = cards.due + cards.new;
  const allDone = !toFinish.length && !mistakes.length && !cardsToStudy;

  return (
    <div className="page">
      <PageHeader
        title="Révisions"
        subtitle="Terminez vos QCM et retravaillez les questions ratées jusqu’à les réussir. Pour générer du contenu, ouvrez un dossier."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat icon={<ListChecks size={18} />} value={toFinish.length} label="QCM à terminer" tone="crimson" />
        <Stat icon={<CircleAlert size={18} />} value={mistakes.length} label={mistakes.length > 1 ? 'questions ratées' : 'question ratée'} tone="warning" />
        <Stat icon={<Layers size={18} />} value={cardsToStudy} label="flash-cards à réviser" tone="neutral" />
      </div>

      {allDone ? (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title="Tout est à jour"
          description="Aucun QCM en attente, aucune question ratée, aucune carte à revoir. Générez de nouveaux QCM depuis un dossier pour continuer à vous entraîner."
          action={<ButtonLink to="/courses" variant="secondary">Ouvrir mes dossiers</ButtonLink>}
        />
      ) : (
        <div className="space-y-10">
          {/* 1. QCM à terminer */}
          <section aria-labelledby="finish-title">
            <h2 id="finish-title" className="section-title mb-1">QCM à terminer</h2>
            <p className="meta mb-3">Un QCM commencé reprend là où vous vous êtes arrêté.</p>
            {!toFinish.length ? (
              <p className="meta rounded-lg border border-dashed border-line px-4 py-6 text-center">Tous vos QCM sont terminés.</p>
            ) : (
              <ul className="card divide-y divide-line">
                {toFinish.map((t) => {
                  const pct = t.totalQuestions ? Math.round((t.answered / t.totalQuestions) * 100) : 0;
                  return (
                    <li key={t.quizId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <Link to={`/revision/quizzes/${t.quizId}`} className="block truncate text-[14.5px] font-medium hover:text-crimson">{t.title}</Link>
                        <p className="meta flex flex-wrap items-center gap-x-2">
                          <span>{t.course?.title ?? (t.isReview ? 'Rattrapage' : 'Sans dossier')}</span>
                          {t.isMockExam && <Badge tone="crimson">Examen blanc</Badge>}
                          <span>· {t.status === 'in_progress' ? `commencé ${relativeDay(t.startedAt).toLowerCase()}` : 'jamais commencé'}</span>
                        </p>
                        {t.status === 'in_progress' && (
                          <div className="mt-2 flex max-w-sm items-center gap-3">
                            <div className="flex-1"><ProgressBar value={pct} label={`Progression ${t.title}`} /></div>
                            <span className="text-[12.5px] tabular-nums text-muted">{t.answered}/{t.totalQuestions}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={t.status === 'in_progress' ? 'primary' : 'secondary'}
                        icon={t.isMockExam ? <Timer size={15} /> : <Play size={15} />}
                        loading={start.isPending && start.variables === t.quizId}
                        onClick={() => start.mutate(t.quizId)}
                      >
                        {t.status === 'in_progress' ? 'Reprendre' : 'Commencer'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 2. Questions ratées */}
          <section aria-labelledby="mistakes-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="mistakes-title" className="section-title mb-1">Questions ratées</h2>
                <p className="meta">Une question quitte cette liste dès que vous y répondez juste.</p>
              </div>
              {mistakes.length > 0 && (
                <Button icon={<RotateCcw size={16} />} loading={retry.isPending && retry.variables === undefined} onClick={() => retry.mutate(undefined)}>
                  Retravailler {plural(mistakes.length, 'question')}
                </Button>
              )}
            </div>
            {!mistakes.length ? (
              <p className="meta rounded-lg border border-dashed border-line px-4 py-6 text-center">Aucune question ratée : bravo.</p>
            ) : (
              <div className="space-y-4">
                {byCourse.map((g) => (
                  <div key={g.course?.id ?? 'none'} className="card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                      <p className="mr-auto font-medium">
                        {g.course ? <Link to={`/courses/${g.course.id}`} className="hover:text-crimson">{g.course.title}</Link> : 'Sans dossier'}
                        <span className="meta ml-2">{plural(g.items.length, 'question')}</span>
                      </p>
                      {g.course && byCourse.length > 1 && (
                        <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} loading={retry.isPending && retry.variables === g.course.id} onClick={() => retry.mutate(g.course!.id)}>
                          Retravailler ce dossier
                        </Button>
                      )}
                    </div>
                    <ul className="divide-y divide-line">
                      {g.items.map((m) => (
                        <li key={m.questionId} className="flex items-start gap-3 px-4 py-3">
                          <CircleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14.5px] leading-snug">{m.question}</p>
                            <p className="meta mt-0.5">
                              {m.quiz.title} · ratée {m.wrongCount > 1 ? `${m.wrongCount} fois` : 'une fois'} · {relativeDay(m.lastAnsweredAt).toLowerCase()}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Flash-cards à réviser (répétition espacée) */}
          {cardsToStudy > 0 && (
            <section aria-labelledby="cards-title">
              <h2 id="cards-title" className="section-title mb-3">Flash-cards</h2>
              <Link to="/revision/study" className="card flex items-center gap-4 p-4 hover:border-charcoal/25">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-crimson-soft text-crimson" aria-hidden><Layers size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Réviser {plural(cardsToStudy, 'carte')}</span>
                  <span className="meta">
                    {[cards.due > 0 ? `${cards.due} à revoir aujourd’hui` : null, cards.new > 0 ? `${cards.new} nouvelle${cards.new > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
