import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, HelpCircle, RotateCcw, XCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { QUESTION_TYPE_LABEL } from '../../lib/format';
import type { AttemptView, Question, Results } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs } from '../../components/ui/Misc';
import { Dialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { GeneratedBadge, ReportButton, Sources } from './shared';

type Feedback = { isCorrect: boolean | null; needsReview?: boolean; correctAnswer: unknown; explanation?: string | null };

const optionsOf = (q: Question) => (Array.isArray(q.options) ? q.options : []);
const matchOf = (q: Question) => (!Array.isArray(q.options) ? q.options : { left: [], right: [] });

export function formatAnswer(q: Question, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
      return optionsOf(q)[Number(value)] ?? '—';
    case 'MULTIPLE_CHOICE':
      return (value as number[]).map((i) => optionsOf(q)[i]).join(' ; ');
    case 'TRUE_FALSE':
      return value ? 'Vrai' : 'Faux';
    case 'SHORT_ANSWER':
    case 'FILL_BLANK':
      return Array.isArray(value) ? (value as string[]).join(' / ') : String(value);
    case 'MATCHING': {
      const m = matchOf(q);
      return (value as number[]).map((r, i) => `${m.left[i]} → ${m.right[r] ?? '?'}`).join(' ; ');
    }
  }
}

function AnswerInput({ q, value, onChange, disabled }: { q: Question; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const name = `q-${q.id}`;
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const opts = q.questionType === 'TRUE_FALSE' ? ['Vrai', 'Faux'] : optionsOf(q);
      const toValue = (i: number) => (q.questionType === 'TRUE_FALSE' ? i === 0 : i);
      return (
        <div role="radiogroup" className="space-y-2">
          {opts.map((o, i) => {
            const checked = value === toValue(i);
            return (
              <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors ${checked ? 'border-crimson bg-crimson-soft' : 'border-line bg-white hover:border-charcoal/30'}`}>
                <input type="radio" name={name} className="mt-1 accent-crimson" checked={checked} disabled={disabled} onChange={() => onChange(toValue(i))} />
                <span className="text-[15px]"><Markdown className="prose-p:my-0">{o}</Markdown></span>
              </label>
            );
          })}
        </div>
      );
    }
    case 'MULTIPLE_CHOICE': {
      const sel = (Array.isArray(value) ? value : []) as number[];
      return (
        <div className="space-y-2">
          <p className="meta">Plusieurs réponses possibles.</p>
          {optionsOf(q).map((o, i) => (
            <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 ${sel.includes(i) ? 'border-crimson bg-crimson-soft' : 'border-line bg-white hover:border-charcoal/30'}`}>
              <input type="checkbox" className="mt-1 accent-crimson" checked={sel.includes(i)} disabled={disabled} onChange={() => onChange(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort())} />
              <span className="text-[15px]"><Markdown className="prose-p:my-0">{o}</Markdown></span>
            </label>
          ))}
        </div>
      );
    }
    case 'SHORT_ANSWER':
    case 'FILL_BLANK':
      return <input className="field" aria-label="Votre réponse" placeholder="Votre réponse" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case 'MATCHING': {
      const m = matchOf(q);
      const sel = (Array.isArray(value) ? value : m.left.map(() => -1)) as number[];
      return (
        <div className="space-y-2">
          {m.left.map((l, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-2">
              <span className="text-[15px] font-medium">{l}</span>
              <select className="field" aria-label={`Correspondance pour ${l}`} value={sel[i] ?? -1} disabled={disabled} onChange={(e) => onChange(sel.map((v, j) => (j === i ? Number(e.target.value) : v)))}>
                <option value={-1}>Choisir…</option>
                {m.right.map((r, j) => <option key={j} value={j}>{r}</option>)}
              </select>
            </div>
          ))}
        </div>
      );
    }
  }
}

const answered = (q: Question, v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && (v.length === 0 || (q.questionType === 'MATCHING' && v.some((x) => x === -1))));

function Countdown({ deadline, offset, onExpire }: { deadline: string; offset: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => new Date(deadline).getTime() - (Date.now() + offset));
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(deadline).getTime() - (Date.now() + offset);
      setLeft(l);
      if (l <= 0 && !fired.current) (fired.current = true, onExpire());
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, offset, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return <span role="timer" aria-label={`Temps restant ${text}`} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm tabular-nums ${s < 120 ? 'bg-danger-soft text-danger' : 'bg-white text-charcoal'} border border-line`}><Clock size={14} /> {text}</span>;
}

function ResultsView({ attemptId }: { attemptId: string }) {
  const navigate = useNavigate();
  const { data: r, isLoading, error, refetch } = useQuery({ queryKey: ['results', attemptId], queryFn: () => api.get<Results>(`/quiz-attempts/${attemptId}/results`) });
  if (isLoading) return <Loading />;
  if (error || !r) return <ErrorState error={error} onRetry={refetch} />;
  const pct = r.attempt.percentage ?? 0;
  return (
    <div className="space-y-6">
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">{r.attempt.status === 'EXPIRED' ? 'Temps écoulé — tentative remise automatiquement' : 'Résultat'}</p>
        <p className={`mt-1 font-serif text-5xl font-medium ${pct >= 60 ? 'text-success' : 'text-warning'}`}>{pct} %</p>
        <p className="mt-1 text-muted">{r.attempt.score} / {r.attempt.maxScore} points</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          <Badge tone="success">{r.summary.correct} correctes</Badge>
          <Badge tone="danger">{r.summary.incorrect} incorrectes</Badge>
          {r.summary.unanswered > 0 && <Badge tone="neutral">{r.summary.unanswered} sans réponse</Badge>}
          {r.summary.toVerify > 0 && <Badge tone="warning">{r.summary.toVerify} à vérifier</Badge>}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => navigate(`/revision/quizzes/${r.quiz.id}`)}>Recommencer</Button>
          {r.quiz.lesson && <Link to={`/lessons/${r.quiz.lesson.id}`} className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-crimson hover:bg-crimson-soft">Revoir la leçon</Link>}
        </div>
      </div>
      {(r.summary.missedTopics.length > 0 || r.suggestedLessons.length > 0) && (
        <div className="card p-5">
          <h2 className="mb-2 font-serif text-lg font-medium">À retravailler</h2>
          {r.summary.missedTopics.length > 0 && <p className="text-sm">Notions manquées : {r.summary.missedTopics.join(', ')}.</p>}
          {r.suggestedLessons.length > 0 && <p className="mt-2 text-sm">Leçons suggérées : {r.suggestedLessons.map((l, i) => <span key={l.id}>{i > 0 && ', '}<Link to={`/lessons/${l.id}`} className="text-crimson hover:underline">{l.title}</Link></span>)}</p>}
        </div>
      )}
      <ol className="space-y-4">
        {r.items.map((q, i) => (
          <li key={q.id} className="card p-5">
            <div className="flex items-start gap-3">
              {q.needsReview ? <HelpCircle className="mt-0.5 shrink-0 text-warning" size={20} aria-label="À vérifier" /> : q.isCorrect ? <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={20} aria-label="Correct" /> : <XCircle className="mt-0.5 shrink-0 text-danger" size={20} aria-label="Incorrect" />}
              <div className="min-w-0 flex-1">
                <p className="meta">Question {i + 1} · {QUESTION_TYPE_LABEL[q.questionType]}</p>
                <div className="mt-1 font-medium"><Markdown className="prose-p:my-0">{q.question}</Markdown></div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted">Votre réponse</dt><dd className={q.isCorrect ? 'text-success' : q.answered ? 'text-danger' : 'text-muted'}>{formatAnswer(q, q.response)}</dd></div>
                  <div><dt className="text-muted">Réponse attendue</dt><dd>{formatAnswer(q, q.correctAnswer)}</dd></div>
                </dl>
                {q.uncertain && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-warning"><AlertTriangle size={14} /> Question potentiellement ambiguë : plusieurs interprétations sont possibles.</p>}
                {q.needsReview && !q.uncertain && <p className="mt-2 text-[13px] text-warning">Réponse libre proche de la réponse attendue : vérifiez-la vous-même.</p>}
                {q.explanation && <div className="mt-3 rounded-md bg-ivory p-3 text-sm"><Markdown className="prose-p:my-0">{q.explanation}</Markdown></div>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <Sources refs={q.sourceReference?.all ?? (q.sourceReference ? [q.sourceReference] : [])} compact />
                  {r.quiz.origin === 'ai' && <ReportButton targetType="quiz_question" targetId={q.id} />}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['attempt', id], queryFn: () => api.get<AttemptView>(`/quiz-attempts/${id}`), refetchOnWindowFocus: false });
  useDocumentTitle(data?.quiz.title ?? 'Quiz');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<Record<string, unknown>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const storageKey = `studymate:attempt:${id}`;

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, unknown> = {};
    const fb: Record<string, Feedback> = {};
    for (const q of data.questions) {
      if (q.response !== null && q.response !== undefined) initial[q.id] = q.response;
      if (q.correctAnswer !== undefined && data.attempt.mode === 'practice' && q.response !== null) fb[q.id] = { isCorrect: q.isCorrect ?? null, correctAnswer: q.correctAnswer, explanation: q.explanation };
    }
    // Réponses locales non encore envoyées (coupure réseau) : on les restaure.
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      Object.assign(initial, local);
      pending.current = local;
    } catch { /* ignore */ }
    setAnswers(initial);
    setFeedback(fb);
  }, [data, storageKey]);

  const flush = useCallback(async () => {
    const entries = Object.entries(pending.current);
    if (!entries.length) return true;
    setSaving('saving');
    for (const [questionId, response] of entries) {
      try {
        // En entraînement, la correction n'est affichée que sur demande (bouton « Vérifier »).
        await api.post(`/quiz-attempts/${id}/responses`, { questionId, response });
        delete pending.current[questionId];
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          refetch();
          return false;
        }
        setSaving('offline');
        localStorage.setItem(storageKey, JSON.stringify(pending.current));
        return false;
      }
    }
    localStorage.removeItem(storageKey);
    setSaving('saved');
    return true;
  }, [id, refetch, storageKey]);

  const setAnswer = (q: Question, v: unknown) => {
    setAnswers((a) => ({ ...a, [q.id]: v }));
    pending.current[q.id] = v;
    localStorage.setItem(storageKey, JSON.stringify(pending.current));
    clearTimeout(timers.current[q.id]);
    timers.current[q.id] = setTimeout(flush, q.questionType === 'SHORT_ANSWER' || q.questionType === 'FILL_BLANK' ? 900 : 150);
  };

  const check = async (q: Question) => {
    try {
      const r = await api.post<Feedback>(`/quiz-attempts/${id}/responses`, { questionId: q.id, response: answers[q.id] });
      delete pending.current[q.id];
      setFeedback((f) => ({ ...f, [q.id]: r }));
    } catch (e) {
      toast.error(e);
    }
  };

  const submit = useCallback(async () => {
    setSubmitting(true);
    await flush();
    try {
      await api.post(`/quiz-attempts/${id}/submit`);
      localStorage.removeItem(storageKey);
      for (const k of ['quizzes', 'dashboard', 'review', 'revisions']) qc.invalidateQueries({ queryKey: [k] });
      await refetch();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
      setConfirm(false);
    }
  }, [flush, id, qc, refetch, storageKey, toast]);

  useEffect(() => {
    const retry = () => flush();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [flush]);

  if (isLoading) return <Loading />;
  if (error || !data) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const { attempt, quiz, questions } = data;
  const header = (
    <>
      <Breadcrumbs items={[{ label: 'Révisions', to: '/revision' }, { label: quiz.title, to: `/revision/quizzes/${quiz.id}` }, { label: attempt.status === 'IN_PROGRESS' ? 'Tentative' : 'Résultats' }]} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl font-medium">{quiz.title}</h1>
        {quiz.origin === 'review' ? <Badge tone="warning">Rattrapage</Badge> : quiz.origin === 'ai' ? <GeneratedBadge provider={quiz.provider} /> : <Badge tone="neutral">Créé manuellement</Badge>}
      </div>
    </>
  );
  if (attempt.status !== 'IN_PROGRESS') return <div className="page max-w-3xl">{header}<ResultsView attemptId={attempt.id} /></div>;

  const q = questions[current];
  const offset = new Date(data.serverTime).getTime() - Date.now();
  const unanswered = questions.filter((x) => !answered(x, answers[x.id])).length;
  const fb = feedback[q.id];
  const practice = attempt.mode === 'practice';

  return (
    <div className="page max-w-3xl">
      {header}
      <div className="sticky top-14 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-line bg-ivory/95 px-4 py-2 md:top-16">
        <span className="text-sm text-muted">Question {current + 1} / {questions.length} · {practice ? 'Entraînement' : 'Examen'}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted" aria-live="polite">{saving === 'saving' ? 'Enregistrement…' : saving === 'saved' ? 'Réponses enregistrées' : saving === 'offline' ? 'Hors ligne — enregistré sur cet appareil' : ''}</span>
          {attempt.deadlineAt && <Countdown deadline={attempt.deadlineAt} offset={offset} onExpire={submit} />}
        </div>
      </div>
      <nav aria-label="Navigation entre les questions" className="mb-5 flex flex-wrap gap-1.5">
        {questions.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setCurrent(i)} aria-current={i === current} aria-label={`Question ${i + 1}${answered(x, answers[x.id]) ? ', répondue' : ''}`} className={`h-8 w-8 rounded-md border text-xs font-medium ${i === current ? 'border-crimson bg-crimson text-white' : answered(x, answers[x.id]) ? 'border-charcoal/20 bg-charcoal/[0.06]' : 'border-line bg-white'}`}>
            {i + 1}
          </button>
        ))}
      </nav>
      <div className="card p-6">
        <p className="meta mb-2">{QUESTION_TYPE_LABEL[q.questionType]}{q.points !== 1 ? ` · ${q.points} pts` : ''}</p>
        <div className="mb-5 text-[17px] font-medium"><Markdown className="prose-p:my-0">{q.question}</Markdown></div>
        <AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q, v)} disabled={practice && !!fb} />
        {practice && !fb && answered(q, answers[q.id]) && <Button className="mt-4" variant="secondary" onClick={() => check(q)}>Vérifier</Button>}
        {practice && fb && (
          <div className={`mt-4 rounded-md border p-4 text-sm ${fb.needsReview ? 'border-warning/40 bg-warning-soft' : fb.isCorrect ? 'border-success/40 bg-success-soft' : 'border-danger/30 bg-danger-soft'}`} role="status">
            <p className="font-medium">{fb.needsReview ? 'À vérifier vous-même' : fb.isCorrect ? 'Bonne réponse' : 'Réponse incorrecte'}</p>
            <p className="mt-1">Réponse attendue : {formatAnswer(q, fb.correctAnswer)}</p>
            {fb.explanation && <div className="mt-2"><Markdown className="prose-p:my-0">{fb.explanation}</Markdown></div>}
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="secondary" icon={<ChevronLeft size={16} />} disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Précédente</Button>
        {current < questions.length - 1 ? (
          <Button variant="secondary" onClick={() => setCurrent((c) => c + 1)}>Suivante <ChevronRight size={16} /></Button>
        ) : (
          <Button onClick={() => setConfirm(true)}>Remettre</Button>
        )}
      </div>
      <div className="mt-4 text-center"><button type="button" className="text-sm text-crimson hover:underline" onClick={() => setConfirm(true)}>Remettre maintenant</button></div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Remettre la tentative ?" size="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Continuer</Button><Button loading={submitting} onClick={submit}>Remettre</Button></>}>
        {unanswered > 0 ? <Notice tone="warning">{unanswered} question{unanswered > 1 ? 's sont' : ' est'} sans réponse.</Notice> : <p className="text-sm">Toutes les questions ont une réponse.</p>}
        <p className="mt-3 text-sm text-muted">Vous ne pourrez plus modifier vos réponses après la remise.</p>
      </Dialog>
    </div>
  );
}
