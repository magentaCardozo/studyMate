import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, FileText, Layers, ListChecks, MessageCircleQuestion, NotebookPen, Pencil, Plus, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, LESSON_STATUS, relativeDay, ACTIVITY_LABEL } from '../../lib/format';
import type { Item, Lesson, LessonDetail } from '../../types/api';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, PageHeader, Tabs } from '../../components/ui/Misc';
import { Dialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useQuickActions } from '../documents/QuickActions';
import { GenerateDialog, type GenerateKind } from '../smart-revision/GenerateDialog';
import { DocumentRow } from '../documents/DocumentRow';
import { MoveDialog } from './dialogs';

type Tab = 'content' | 'notes' | 'revision';

function ItemsEditor({ label, items, onChange }: { label: string; items: Item[]; onChange: (v: Item[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">{label}</legend>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-[200px_1fr]">
            <input className="field" placeholder="Titre" aria-label={`${label} — titre ${i + 1}`} value={it.title} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <input className="field" placeholder="Contenu (Markdown et $maths$ acceptés)" aria-label={`${label} — contenu ${i + 1}`} value={it.body} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
          </div>
          <IconButton label="Retirer" onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={16} /></IconButton>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => onChange([...items, { title: '', body: '' }])}>Ajouter</Button>
    </fieldset>
  );
}

function LessonEditor({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    title: lesson.title,
    description: lesson.description ?? '',
    content: lesson.content,
    objectives: lesson.learningObjectives.join('\n'),
    definitions: lesson.definitions,
    formulas: lesson.formulas,
    examples: lesson.examples,
    exercises: lesson.exercises,
    estimatedMinutes: lesson.estimatedMinutes?.toString() ?? '',
    revisionDate: lesson.revisionDate?.slice(0, 10) ?? '',
  });
  const clean = (items: Item[]) => items.filter((i) => i.title.trim() || i.body.trim());
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/lessons/${lesson.id}`, {
        title: v.title.trim(),
        description: v.description.trim() || null,
        content: v.content,
        learningObjectives: v.objectives.split('\n').map((s) => s.trim()).filter(Boolean),
        definitions: clean(v.definitions),
        formulas: clean(v.formulas),
        examples: clean(v.examples),
        exercises: clean(v.exercises),
        estimatedMinutes: v.estimatedMinutes ? Number(v.estimatedMinutes) : null,
        revisionDate: v.revisionDate ? new Date(v.revisionDate).toISOString() : null,
      }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['lesson', lesson.id] }), qc.invalidateQueries({ queryKey: ['course'] }), toast.show('Leçon enregistrée.'), onDone()),
    onError: toast.error,
  });
  return (
    <form className="card space-y-5 p-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      <Input label="Titre" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required />
      <Textarea label="Description" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <Textarea label="Objectifs d’apprentissage (un par ligne)" rows={3} value={v.objectives} onChange={(e) => setV({ ...v, objectives: e.target.value })} />
      <Textarea label="Contenu de la leçon" hint="Markdown : # titres, **gras**, listes. Mathématiques entre $…$ ou $$…$$." rows={12} className="font-mono text-[13.5px]" value={v.content} onChange={(e) => setV({ ...v, content: e.target.value })} />
      <ItemsEditor label="Définitions importantes" items={v.definitions} onChange={(definitions) => setV({ ...v, definitions })} />
      <ItemsEditor label="Formules" items={v.formulas} onChange={(formulas) => setV({ ...v, formulas })} />
      <ItemsEditor label="Exemples" items={v.examples} onChange={(examples) => setV({ ...v, examples })} />
      <ItemsEditor label="Exercices d’entraînement" items={v.exercises} onChange={(exercises) => setV({ ...v, exercises })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Durée estimée (minutes)" type="number" min={1} value={v.estimatedMinutes} onChange={(e) => setV({ ...v, estimatedMinutes: e.target.value })} />
        <Input label="Date de révision" type="date" value={v.revisionDate} onChange={(e) => setV({ ...v, revisionDate: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Annuler</Button>
        <Button type="submit" loading={save.isPending}>Enregistrer</Button>
      </div>
    </form>
  );
}

function ScheduleDialog({ lesson, onClose }: { lesson: LessonDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState(45);
  const [activity, setActivity] = useState('lesson');
  const save = useMutation({
    mutationFn: () => {
      const start = new Date(`${date}T${time}:00`);
      return api.post('/study-sessions', { courseId: lesson.courseId, lessonId: lesson.id, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + duration * 60_000).toISOString(), activityType: activity, objective: `Réviser « ${lesson.title} »` });
    },
    onSuccess: () => (['lesson', 'calendar', 'sessions', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show('Session planifiée.'), onClose()),
    onError: toast.error,
  });
  return (
    <Dialog open onClose={onClose} title="Planifier une révision" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Planifier</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Input label="Durée (minutes)" type="number" min={10} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        <Select label="Activité" value={activity} onChange={(e) => setActivity(e.target.value)}>
          {['lesson', 'flashcards', 'quiz', 'summary'].map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
        </Select>
      </div>
    </Dialog>
  );
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const quick = useQuickActions();
  const { data: l, isLoading, error, refetch } = useQuery({ queryKey: ['lesson', id], queryFn: () => api.get<LessonDetail>(`/lessons/${id}`) });
  useDocumentTitle(l?.title ?? 'Leçon');
  const [tab, setTab] = useState<Tab>('content');
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [generate, setGenerate] = useState<GenerateKind | null>(null);
  const [schedule, setSchedule] = useState(false);
  const [move, setMove] = useState<Parameters<typeof MoveDialog>[0]['item']>(null);
  useEffect(() => {
    if (params.get('edit')) setParams({}, { replace: true });
  }, [params, setParams]);

  const complete = useMutation({
    mutationFn: (completed: boolean) => api.post(`/lessons/${id}/complete`, { completed }),
    onSuccess: (_d, completed) => (['lesson', 'course', 'courses', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show(completed ? 'Leçon marquée comme terminée.' : 'Leçon rouverte.')),
    onError: toast.error,
  });

  if (isLoading) return <Loading />;
  if (error || !l) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const done = l.status === 'COMPLETED';
  const hasStructured = l.definitions.length || l.formulas.length || l.examples.length || l.exercises.length;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Mes cours', to: '/courses' }, { label: l.course.title, to: `/courses/${l.course.id}` }, ...l.breadcrumb.map((b) => ({ label: b.name, to: `/folders/${b.id}` })), { label: l.title }]} />
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={done ? 'success' : l.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>{LESSON_STATUS[l.status]}</Badge>
            {l.estimatedMinutes && <span className="meta">{l.estimatedMinutes} min</span>}
            {l.revisionDate && <span className="meta">Révision prévue : {formatDate(l.revisionDate)}</span>}
          </div>
        }
        title={l.title}
        subtitle={l.description}
        actions={
          <>
            <Button variant={done ? 'secondary' : 'primary'} icon={done ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />} loading={complete.isPending} onClick={() => complete.mutate(!done)}>
              {done ? 'Rouvrir' : 'Marquer comme terminée'}
            </Button>
            {!editing && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Modifier</Button>}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<FileText size={15} />} onClick={() => setGenerate('summary')}>Résumé</Button>
        <Button size="sm" variant="secondary" icon={<Layers size={15} />} onClick={() => setGenerate('flashcards')}>Cartes</Button>
        <Button size="sm" variant="secondary" icon={<ListChecks size={15} />} onClick={() => setGenerate('quiz')}>Quiz</Button>
        <ButtonLink size="sm" variant="secondary" icon={<MessageCircleQuestion size={15} />} to={`/coach/chat?lessonId=${l.id}`}>Poser une question</ButtonLink>
        <ButtonLink size="sm" variant="secondary" icon={<NotebookPen size={15} />} to={`/notes/new?courseId=${l.courseId}&lessonId=${l.id}`}>Ajouter une note</ButtonLink>
        <Button size="sm" variant="secondary" icon={<CalendarPlus size={15} />} onClick={() => setSchedule(true)}>Planifier une révision</Button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'content', label: 'Contenu' },
          { id: 'notes', label: 'Mes notes', count: l.notes.length },
          { id: 'revision', label: 'Révisions', count: l.decks.length + l.quizzes.length + l.summaries.length },
        ]}
      />

      {tab === 'content' &&
        (editing ? (
          <LessonEditor lesson={l} onDone={() => setEditing(false)} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <article className="card p-5 md:p-7">
              {l.learningObjectives.length > 0 && (
                <div className="mb-6 rounded-md bg-ivory p-4">
                  <p className="mb-2 text-sm font-semibold">Objectifs d’apprentissage</p>
                  <ul className="list-disc space-y-1 pl-5 text-[14.5px]">{l.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul>
                </div>
              )}
              {l.content.trim() ? <Markdown>{l.content}</Markdown> : <p className="text-muted">Cette leçon n’a pas encore de contenu. <button type="button" className="text-crimson hover:underline" onClick={() => setEditing(true)}>Rédiger le contenu</button> ou importez un document.</p>}
            </article>
            {hasStructured ? (
              <aside className="space-y-4">
                {(
                  [
                    ['Définitions', l.definitions],
                    ['Formules', l.formulas],
                    ['Exemples', l.examples],
                    ['Exercices', l.exercises],
                  ] as const
                ).map(([title, items]) =>
                  items.length ? (
                    <div key={title} className="card p-4">
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
                      <dl className="space-y-2">
                        {items.map((it, i) => (
                          <div key={i}>
                            <dt className="text-sm font-medium">{it.title}</dt>
                            <dd><Markdown className="prose-p:my-0">{it.body}</Markdown></dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null,
                )}
              </aside>
            ) : null}
          </div>
        ))}

      {tab === 'notes' &&
        (l.notes.length ? (
          <ul className="card divide-y divide-line">
            {l.notes.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                  <NotebookPen size={17} className="text-muted" />
                  <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                  <span className="meta">{relativeDay(n.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<NotebookPen size={22} />} title="Aucune note personnelle." action={<ButtonLink to={`/notes/new?courseId=${l.courseId}&lessonId=${l.id}`}>Créer une note</ButtonLink>} />
        ))}

      {tab === 'revision' && (
        <div className="grid gap-6 md:grid-cols-3">
          <section>
            <h3 className="mb-2 font-serif text-lg font-medium">Résumés</h3>
            {l.summaries.length ? l.summaries.map((s) => <Link key={s.id} to={`/revision/summaries/${s.id}`} className="card mb-2 block p-3 text-sm hover:border-charcoal/25"><p className="font-medium">{s.title}</p><p className="meta">{relativeDay(s.createdAt)}</p></Link>) : <p className="meta">Aucun résumé.</p>}
          </section>
          <section>
            <h3 className="mb-2 font-serif text-lg font-medium">Cartes mémoire</h3>
            {l.decks.length ? l.decks.map((d) => <Link key={d.id} to={`/revision/decks/${d.id}`} className="card mb-2 block p-3 text-sm hover:border-charcoal/25"><p className="font-medium">{d.title}</p><p className="meta">{d._count.cards} cartes</p></Link>) : <p className="meta">Aucun paquet.</p>}
          </section>
          <section>
            <h3 className="mb-2 font-serif text-lg font-medium">Quiz</h3>
            {l.quizzes.length ? l.quizzes.map((q) => <Link key={q.id} to={`/revision/quizzes/${q.id}`} className="card mb-2 block p-3 text-sm hover:border-charcoal/25"><p className="font-medium">{q.title}</p><p className="meta">{q._count.questions} questions · {q.configuration.mode === 'exam' ? 'Examen' : 'Entraînement'}</p></Link>) : <p className="meta">Aucun quiz.</p>}
          </section>
          {l.sessions.length > 0 && (
            <section className="md:col-span-3">
              <h3 className="mb-2 font-serif text-lg font-medium">Sessions prévues</h3>
              <ul className="space-y-1 text-sm">{l.sessions.map((s) => <li key={s.id}>{formatDateTime(s.scheduledStart)} — {ACTIVITY_LABEL[s.activityType]}</li>)}</ul>
            </section>
          )}
          <div className="md:col-span-3">
            <Button icon={<Sparkles size={16} />} onClick={() => setGenerate('summary')}>Générer du matériel de révision</Button>
          </div>
        </div>
      )}

      {generate && <GenerateDialog open onClose={() => setGenerate(null)} scope={{ lessonId: l.id }} scopeLabel={`Leçon « ${l.title} »`} initialKind={generate} />}
      {schedule && <ScheduleDialog lesson={l} onClose={() => setSchedule(false)} />}
      <MoveDialog open={!!move} onClose={() => setMove(null)} item={move} />
      <div className="mt-10 border-t border-line pt-4">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-crimson"
          onClick={() => setMove({ kind: 'lesson', id: l.id, name: l.title, courseId: l.courseId, currentFolderId: l.folderId })}
        >
          Déplacer cette leçon vers un autre sous-dossier
        </button>
      </div>
    </div>
  );
}
