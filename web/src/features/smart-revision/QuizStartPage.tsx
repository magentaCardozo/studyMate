import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, ListChecks, Play, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, QUESTION_TYPE_LABEL } from '../../lib/format';
import type { Attempt, Question, Quiz } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, PageHeader } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { GeneratedBadge } from './shared';

export default function QuizStartPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const { data: quiz, isLoading, error, refetch } = useQuery({ queryKey: ['quiz', id], queryFn: () => api.get<Quiz & { questions: Question[]; attempts: Attempt[] }>(`/quizzes/${id}`) });
  useDocumentTitle(quiz?.title ?? 'Quiz');
  const start = useMutation({
    mutationFn: () => api.post<Attempt>(`/quizzes/${id}/attempts`),
    onSuccess: (a) => navigate(`/revision/attempts/${a.id}`),
    onError: toast.error,
  });
  if (isLoading) return <Loading />;
  if (error || !quiz) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const cfg = quiz.configuration;
  const running = quiz.attempts.find((a) => a.status === 'IN_PROGRESS');
  const types = [...new Set(quiz.questions.map((q) => q.questionType))];

  return (
    <div className="page max-w-3xl">
      <Breadcrumbs items={[{ label: 'Révisions', to: '/revision' }, ...(quiz.course ? [{ label: quiz.course.title, to: `/courses/${quiz.course.id}` }] : []), { label: quiz.title }]} />
      <PageHeader
        eyebrow={<div className="flex flex-wrap gap-2">{quiz.origin === 'ai' ? <GeneratedBadge provider={quiz.provider} /> : <Badge tone="neutral">Créé manuellement</Badge>}{cfg.isMockExam && <Badge tone="crimson">Examen blanc</Badge>}</div>}
        title={quiz.title}
      />
      <div className="card space-y-4 p-6">
        <ul className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2"><ListChecks size={16} className="text-muted" /> {quiz.questions.length} questions</li>
          <li className="flex items-center gap-2"><Clock size={16} className="text-muted" /> {cfg.timed && cfg.durationMinutes ? `${cfg.durationMinutes} minutes` : 'Sans limite de temps'}</li>
          <li>{cfg.mode === 'exam' ? 'Mode examen' : 'Mode entraînement'}</li>
        </ul>
        <p className="text-sm text-muted">Types : {types.map((t) => QUESTION_TYPE_LABEL[t]).join(', ')}</p>
        <Notice>
          {cfg.mode === 'exam'
            ? 'Les réponses et explications seront affichées uniquement après la remise. Vos réponses sont enregistrées automatiquement : vous pouvez reprendre si la connexion est interrompue.'
            : 'La correction et l’explication s’affichent après chaque réponse.'}
          {cfg.isMockExam && ' Cet examen blanc est généré à partir de vos sources : ce n’est pas un examen officiel de votre université.'}
        </Notice>
        {cfg.limitations && cfg.limitations.length > 0 && <Notice tone="warning">{cfg.limitations.join(' ')}</Notice>}
        <Button size="lg" icon={<Play size={17} />} loading={start.isPending} onClick={() => start.mutate()}>{running ? 'Reprendre la tentative' : 'Commencer'}</Button>
      </div>
      {quiz.attempts.filter((a) => a.status !== 'IN_PROGRESS').length > 0 && (
        <section className="mt-8">
          <h2 className="section-title mb-3">Tentatives précédentes</h2>
          <ul className="card divide-y divide-line">
            {quiz.attempts.filter((a) => a.status !== 'IN_PROGRESS').map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => navigate(`/revision/attempts/${a.id}`)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-ivory/60">
                  <span>{formatDateTime(a.completedAt ?? a.startedAt)}{a.status === 'EXPIRED' ? ' · temps écoulé' : ''}</span>
                  <span className="font-medium">{a.maxScore ? `${Math.round(((a.score ?? 0) / a.maxScore) * 100)} %` : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-8 border-t border-line pt-4">
        <Button variant="ghost" className="text-danger" icon={<Trash2 size={15} />} onClick={() => setDel(true)}>Supprimer le quiz</Button>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Supprimer ce quiz ?" message="Le quiz et l’historique de ses tentatives seront supprimés." onConfirm={async () => { await api.del(`/quizzes/${quiz.id}`); qc.invalidateQueries({ queryKey: ['quizzes'] }); toast.show('Quiz supprimé.'); navigate('/revision'); }} />
    </div>
  );
}
