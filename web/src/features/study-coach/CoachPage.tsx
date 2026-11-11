import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, MessageCircle, Plus, RefreshCw, SkipForward, Sparkles, Trash2, Clock, Target } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { ACTIVITY_LABEL, daysUntil, formatDate, formatTime } from '../../lib/format';
import type { Goal, StudySession, UserSettings } from '../../types/api';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Badge, PageHeader } from '../../components/ui/Misc';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useAllCourses } from '../courses/hooks';

const DAYS: { id: keyof NonNullable<UserSettings['availability']>; label: string }[] = [
  { id: 'mon', label: 'Lun' }, { id: 'tue', label: 'Mar' }, { id: 'wed', label: 'Mer' }, { id: 'thu', label: 'Jeu' }, { id: 'fri', label: 'Ven' }, { id: 'sat', label: 'Sam' }, { id: 'sun', label: 'Dim' },
];

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function GoalDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const courses = useAllCourses();
  const [v, setV] = useState({ kind: 'exam', title: '', courseId: '', targetDate: '', targetGrade: '' });
  const save = useMutation({
    mutationFn: () => api.post('/goals', { ...v, courseId: v.courseId || null, targetDate: v.targetDate ? new Date(`${v.targetDate}T08:00:00`).toISOString() : null, targetGrade: v.targetGrade || null }),
    onSuccess: () => (['goals', 'dashboard', 'calendar'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show('Enregistré.'), onClose()),
    onError: toast.error,
  });
  return (
    <Dialog open onClose={onClose} title="Ajouter un examen ou un objectif" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!v.title.trim() || (v.kind === 'exam' && !v.targetDate)} loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Select label="Type" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          <option value="exam">Examen</option>
          <option value="goal">Objectif académique</option>
        </Select>
        <Input label="Intitulé" placeholder={v.kind === 'exam' ? 'Examen de première session' : 'Maîtriser les intégrales'} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <Select label="Dossier" value={v.courseId} onChange={(e) => setV({ ...v, courseId: e.target.value })}>
          <option value="">Aucune</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Input label={v.kind === 'exam' ? "Date de l'examen" : 'Échéance (facultatif)'} type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} />
        <Input label="Note visée (facultatif)" placeholder="Ex. 14/20" value={v.targetGrade} onChange={(e) => setV({ ...v, targetGrade: e.target.value })} hint="Un repère personnel : l’application ne peut pas garantir un résultat." />
      </div>
    </Dialog>
  );
}

function AvailabilityCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const s = user?.settings ?? {};
  const [avail, setAvail] = useState<Record<string, number>>({ mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 180, sun: 60, ...(s.availability ?? {}) });
  const [len, setLen] = useState(s.preferredSessionMinutes ?? 45);
  const [start, setStart] = useState(s.preferredStartTime ?? '18:00');
  const save = useMutation({
    mutationFn: () => api.patch('/users/me/settings', { availability: avail, preferredSessionMinutes: len, preferredStartTime: start }),
    onSuccess: () => (refresh(), toast.show('Disponibilités enregistrées.')),
    onError: toast.error,
  });
  const total = Object.values(avail).reduce((a, b) => a + b, 0);
  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-serif text-lg font-medium"><Clock size={18} className="text-crimson" /> Mes disponibilités</h2>
      <p className="meta mb-4">Temps d’étude par jour (minutes). Le programme ne dépassera jamais ces durées. Total : {Math.round(total / 60)} h par semaine.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {DAYS.map((d) => (
          <label key={d.id} className="text-center">
            <span className="mb-1 block text-xs font-medium text-muted">{d.label}</span>
            <input type="number" min={0} max={720} step={15} value={avail[d.id]} onChange={(e) => setAvail({ ...avail, [d.id]: Number(e.target.value) })} className="field px-1 text-center" aria-label={`Minutes le ${d.label}`} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Select label="Durée d’une session" value={len} onChange={(e) => setLen(Number(e.target.value))}>
          {[25, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
        </Select>
        <Input label="Heure de début préférée" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <Button className="mt-4" size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>
    </section>
  );
}

interface PlanPreview {
  preview: boolean;
  summary: { sessionCount: number; totalMinutes: number; missedSessions: number; courses: { id: string; title: string; examDate: string | null; sessions: number; remainingLessons: number }[]; note: string | null };
  sessions: (StudySession & { course: { id: string; title: string } })[];
}

function PlanDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const courses = useAllCourses();
  const goals = useQuery({ queryKey: ['goals', 'upcoming'], queryFn: () => api.get<Goal[]>('/goals?upcoming=true') });
  const [selected, setSelected] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(14);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (goals.data) setSelected([...new Set(goals.data.filter((g) => g.kind === 'exam' && g.courseId).map((g) => g.courseId!))]);
  }, [goals.data]);
  const run = useMutation({
    mutationFn: (accept: boolean) => api.post<PlanPreview>('/study-plans/generate', { courseIds: selected, preview: !accept, horizonDays: horizon }),
    onSuccess: (r, accept) => {
      if (accept) {
        ['sessions', 'calendar', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        toast.show(`Programme enregistré : ${r.summary.sessionCount} sessions.`);
        onClose();
      } else (setPreview(r), setError(null));
    },
    onError: (e) => setError(e as ApiError),
  });
  const byDay = (preview?.sessions ?? []).reduce<Record<string, PlanPreview['sessions']>>((acc, s) => ((acc[dayKey(s.scheduledStart)] ??= []).push(s), acc), {});
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Programme de révision"
      description="Proposé selon vos examens, disponibilités, leçons restantes et résultats réels."
      footer={
        preview ? (
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>Modifier</Button>
            <Button disabled={!preview.sessions.length} loading={run.isPending} onClick={() => run.mutate(true)}>Accepter le programme</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button disabled={!selected.length} loading={run.isPending} onClick={() => run.mutate(false)}>Voir la proposition</Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="space-y-4">
          <fieldset>
            <legend className="label">Dossiers à réviser</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {courses.data?.map((c) => {
                const exam = goals.data?.find((g) => g.courseId === c.id && g.kind === 'exam');
                return <Checkbox key={c.id} label={c.title} description={exam ? `Examen le ${formatDate(exam.targetDate)}` : 'Pas de date d’examen'} checked={selected.includes(c.id)} onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} />;
              })}
            </div>
          </fieldset>
          <Select label="Horizon (sans date d’examen)" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[7, 14, 21, 30].map((d) => <option key={d} value={d}>{d} jours</option>)}
          </Select>
          {error && <Notice tone="warning">{error.message}</Notice>}
        </div>
      ) : (
        <div className="space-y-4">
          <Notice>
            {preview.summary.sessionCount} sessions · {Math.round(preview.summary.totalMinutes / 60)} h au total.
            {preview.summary.missedSessions > 0 && ` ${preview.summary.missedSessions} session(s) manquée(s) ont été redistribuées dans le temps disponible.`}
          </Notice>
          {preview.summary.note && <Notice tone="warning">{preview.summary.note}</Notice>}
          {Object.entries(byDay).map(([day, list]) => (
            <div key={day}>
              <p className="mb-1.5 text-sm font-semibold capitalize">{day}</p>
              <ul className="space-y-1.5">
                {list.map((s, i) => (
                  <li key={i} className="rounded-md border border-line px-3 py-2 text-sm">
                    <span className="font-medium tabular-nums">{formatTime(s.scheduledStart)}</span> · {s.course.title} — {ACTIVITY_LABEL[s.activityType]}{s.lesson ? ` : ${s.lesson.title}` : ''}
                    <p className="meta">{s.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function RescheduleDialog({ session, onClose }: { session: StudySession; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const d = new Date(session.scheduledStart);
  const [date, setDate] = useState(d.toLocaleDateString('en-CA'));
  const [time, setTime] = useState(d.toTimeString().slice(0, 5));
  const save = useMutation({
    mutationFn: () => api.patch(`/study-sessions/${session.id}`, { scheduledStart: new Date(`${date}T${time}:00`).toISOString() }),
    onSuccess: () => (['sessions', 'calendar', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show('Session replanifiée.'), onClose()),
    onError: toast.error,
  });
  return (
    <Dialog open onClose={onClose} title="Replanifier la session" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
    </Dialog>
  );
}

export default function CoachPage() {
  useDocumentTitle('Mon coach');
  const qc = useQueryClient();
  const toast = useToast();
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals') });
  const sessions = useQuery({ queryKey: ['sessions', 'coach'], queryFn: () => api.get<StudySession[]>(`/study-sessions?from=${new Date(Date.now() - 7 * 86400_000).toISOString()}`) });
  const insights = useQuery({ queryKey: ['progress', 'courses'], queryFn: () => api.get<{ id: string; title: string; quizAverage: number | null; quizAttempts: number; lessons: { total: number; completed: number } }[]>('/progress/courses') });
  const overview = useQuery({ queryKey: ['progress', 'overview'], queryFn: () => api.get<{ sessions: { plannedLast30Days: number; completedLast30Days: number } }>('/progress/overview') });
  const [goalDialog, setGoalDialog] = useState(false);
  const [plan, setPlan] = useState(false);
  const [resched, setResched] = useState<StudySession | null>(null);
  const [delGoal, setDelGoal] = useState<Goal | null>(null);
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/study-sessions/${id}`, { status }),
    onSuccess: (_d, v) => (['sessions', 'dashboard', 'calendar', 'progress'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show(v.status === 'COMPLETED' ? 'Session terminée. Bravo !' : 'Session passée.')),
    onError: toast.error,
  });

  if (goals.error) return <div className="page"><ErrorState error={goals.error} onRetry={goals.refetch} /></div>;
  const upcoming = sessions.data?.filter((s) => s.status === 'PLANNED' && new Date(s.scheduledEnd) > new Date()) ?? [];
  const missed = sessions.data?.filter((s) => s.status === 'MISSED') ?? [];
  const grouped = upcoming.reduce<Record<string, StudySession[]>>((acc, s) => ((acc[dayKey(s.scheduledStart)] ??= []).push(s), acc), {});
  const activeGoals = goals.data?.filter((g) => g.status === 'active') ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Mon coach"
        subtitle="Décidez quoi étudier, et quand."
        actions={
          <>
            <ButtonLink to="/coach/chat" variant="secondary" icon={<MessageCircle size={16} />}>Tuteur IA</ButtonLink>
            <Button icon={<Sparkles size={16} />} onClick={() => setPlan(true)}>{upcoming.length ? 'Demander un plan révisé' : 'Générer mon programme'}</Button>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          {missed.length > 0 && (
            <Notice tone="warning" title={`${missed.length} session(s) manquée(s) cette semaine`}>
              Pas d’inquiétude : demandez un plan révisé, les révisions seront redistribuées dans votre temps disponible, sans surcharge.
              <Button size="sm" variant="secondary" className="ml-2 mt-2" icon={<RefreshCw size={14} />} onClick={() => setPlan(true)}>Réorganiser</Button>
            </Notice>
          )}
          <section>
            <h2 className="section-title mb-3">Prochaines sessions</h2>
            {sessions.isLoading ? <Loading /> : !upcoming.length ? (
              <EmptyState icon={<CalendarClock size={22} />} title="Vous n’avez pas encore de programme de révision." description="Choisissez un dossier et une date d’examen pour commencer." action={<><Button onClick={() => setGoalDialog(true)}>Ajouter un examen</Button><Button variant="secondary" onClick={() => setPlan(true)}>Générer un programme</Button></>} />
            ) : (
              <div className="space-y-5">
                {Object.entries(grouped).map(([day, list]) => (
                  <div key={day}>
                    <p className="mb-2 text-sm font-semibold capitalize text-muted">{day}</p>
                    <ul className="space-y-2">
                      {list.map((s) => (
                        <li key={s.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                          <div className="w-16 shrink-0 text-sm font-medium tabular-nums">{formatTime(s.scheduledStart)}<span className="block text-xs text-muted">{Math.round((new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime()) / 60000)} min</span></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{s.course?.title} — {ACTIVITY_LABEL[s.activityType]}</p>
                            {s.lesson && <Link to={`/lessons/${s.lesson.id}`} className="text-sm text-crimson hover:underline">{s.lesson.title}</Link>}
                            {s.objective && <p className="text-sm text-charcoal/80">{s.objective}</p>}
                            {s.reason && <p className="meta mt-1">{s.reason}</p>}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" icon={<Check size={14} />} onClick={() => update.mutate({ id: s.id, status: 'COMPLETED' })}>Fait</Button>
                            <IconButton label="Replanifier" onClick={() => setResched(s)}><CalendarClock size={16} /></IconButton>
                            <IconButton label="Passer" onClick={() => update.mutate({ id: s.id, status: 'SKIPPED' })}><SkipForward size={16} /></IconButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
          <AvailabilityCard />
        </div>

        <aside className="space-y-6">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted"><Target size={15} /> Examens et objectifs</h2>
              <IconButton label="Ajouter" onClick={() => setGoalDialog(true)}><Plus size={16} /></IconButton>
            </div>
            {!activeGoals.length ? <p className="meta">Ajoutez vos dates d’examen pour un programme adapté.</p> : (
              <ul className="space-y-3">
                {activeGoals.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{g.title}</p>
                      <p className="meta">{g.kind === 'exam' ? 'Examen' : 'Objectif'}{g.course ? ` · ${g.course.title}` : ''}{g.targetDate ? ` · ${formatDate(g.targetDate)}` : ''}{g.targetGrade ? ` · visé : ${g.targetGrade}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {g.targetDate && daysUntil(g.targetDate) >= 0 && <Badge tone={daysUntil(g.targetDate) <= 7 ? 'crimson' : 'neutral'}>J-{daysUntil(g.targetDate)}</Badge>}
                      <IconButton label="Supprimer" onClick={() => setDelGoal(g)}><Trash2 size={14} /></IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Bilan (30 derniers jours)</h2>
            {overview.data && (
              <p className="text-sm">{overview.data.sessions.completedLast30Days} session(s) faite(s) sur {overview.data.sessions.plannedLast30Days} prévue(s).</p>
            )}
            <ul className="mt-3 space-y-2">
              {insights.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.title}</span>
                  <span className="meta shrink-0">{c.quizAverage !== null ? `quiz ${c.quizAverage} %` : 'pas de quiz'} · {c.lessons.completed}/{c.lessons.total} leçons</span>
                </li>
              ))}
            </ul>
            <Link to="/progress" className="mt-3 inline-block text-sm text-crimson hover:underline">Voir la progression détaillée</Link>
          </section>
        </aside>
      </div>
      {goalDialog && <GoalDialog onClose={() => setGoalDialog(false)} />}
      {plan && <PlanDialog onClose={() => setPlan(false)} />}
      {resched && <RescheduleDialog session={resched} onClose={() => setResched(null)} />}
      <ConfirmDialog open={!!delGoal} onClose={() => setDelGoal(null)} title="Supprimer cet objectif ?" message={`« ${delGoal?.title} » sera supprimé.`} onConfirm={async () => { await api.del(`/goals/${delGoal!.id}`); qc.invalidateQueries({ queryKey: ['goals'] }); toast.show('Supprimé.'); }} />
    </div>
  );
}
