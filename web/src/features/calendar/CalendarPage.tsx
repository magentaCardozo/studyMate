import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { ACTIVITY_LABEL, formatTime } from '../../lib/format';
import type { Goal, StudySession } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { ErrorState, Loading } from '../../components/ui/Feedback';
import { PageHeader, Segmented } from '../../components/ui/Misc';
import { useDocumentTitle, usePersistentState } from '../../hooks/useUtils';

type View = 'month' | 'week' | 'day';
interface CalData {
  sessions: StudySession[];
  exams: Goal[];
  revisions: { id: string; title: string; revisionDate: string; course: { id: string; title: string; color: string | null } }[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // lundi

function range(view: View, cursor: Date) {
  if (view === 'day') return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === 'week') return [startOfWeek(cursor), addDays(startOfWeek(cursor), 7)];
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return [start, addDays(start, 42)];
}

const STATUS_CLS: Record<string, string> = { PLANNED: 'border-l-crimson', COMPLETED: 'border-l-success opacity-70', SKIPPED: 'border-l-muted opacity-60 line-through', MISSED: 'border-l-warning' };

function Events({ day, data, compact }: { day: Date; data: CalData; compact?: boolean }) {
  const exams = data.exams.filter((e) => e.targetDate && sameDay(new Date(e.targetDate), day));
  const sessions = data.sessions.filter((s) => sameDay(new Date(s.scheduledStart), day));
  const revisions = data.revisions.filter((r) => sameDay(new Date(r.revisionDate), day));
  const items = [
    ...exams.map((e) => <li key={e.id} className="truncate rounded bg-crimson px-1.5 py-0.5 text-[11.5px] font-medium text-white" title={e.title}>Examen · {e.title}</li>),
    ...sessions.map((s) => (
      <li key={s.id} className={`truncate rounded border-l-[3px] bg-white px-1.5 py-0.5 text-[11.5px] ${STATUS_CLS[s.status]}`} title={`${s.course?.title} — ${ACTIVITY_LABEL[s.activityType]}`}>
        {formatTime(s.scheduledStart)} {s.course?.title}
        {!compact && <span className="text-muted"> · {ACTIVITY_LABEL[s.activityType]}{s.lesson ? ` : ${s.lesson.title}` : ''}</span>}
      </li>
    )),
    ...revisions.map((r) => <li key={r.id} className="truncate rounded bg-warning-soft px-1.5 py-0.5 text-[11.5px]"><Link to={`/lessons/${r.id}`}>Révision · {r.title}</Link></li>),
  ];
  if (!items.length) return compact ? null : <p className="meta">Rien de prévu.</p>;
  return <ul className="space-y-1">{compact && items.length > 3 ? [...items.slice(0, 3), <li key="more" className="text-[11px] text-muted">+{items.length - 3}</li>] : items}</ul>;
}

export default function CalendarPage() {
  useDocumentTitle('Calendrier');
  const [view, setView] = usePersistentState<View>('calendar-view', 'week');
  const [cursor, setCursor] = useState(new Date());
  const [from, to] = useMemo(() => range(view, cursor), [view, cursor]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['calendar', from.toISOString(), to.toISOString()], queryFn: () => api.get<CalData>(`/calendar?from=${from.toISOString()}&to=${to.toISOString()}`) });
  const step = (n: number) => setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === 'week' ? 7 : 1))));
  const title = view === 'month' ? cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : view === 'week' ? `Semaine du ${from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const days = Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86400_000) }, (_, i) => addDays(from, i));

  return (
    <div className="page">
      <PageHeader title="Calendrier" subtitle="Examens, sessions d’étude et rappels de révision." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>Aujourd’hui</Button>
        <button type="button" aria-label="Précédent" className="rounded-md p-2 hover:bg-white" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Suivant" className="rounded-md p-2 hover:bg-white" onClick={() => step(1)}><ChevronRight size={18} /></button>
        <h2 className="font-serif text-lg font-medium capitalize">{title}</h2>
        <div className="ml-auto"><Segmented label="Vue" value={view} onChange={setView} options={[{ id: 'month', label: 'Mois' }, { id: 'week', label: 'Semaine' }, { id: 'day', label: 'Jour' }]} /></div>
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <Loading /> : view === 'month' ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-ivory text-center text-xs font-medium text-muted">{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => (
              <button type="button" key={d.toISOString()} onClick={() => (setCursor(d), setView('day'))} className={`min-h-[84px] border-b border-r border-line p-1.5 text-left align-top hover:bg-ivory/60 md:min-h-[110px] ${d.getMonth() !== cursor.getMonth() ? 'bg-ivory/40 text-muted' : ''}`}>
                <span className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${sameDay(d, new Date()) ? 'bg-crimson text-white' : ''}`}>{d.getDate()}</span>
                <div className="hidden sm:block"><Events day={d} data={data} compact /></div>
                <div className="sm:hidden">{(data.sessions.some((s) => sameDay(new Date(s.scheduledStart), d)) || data.exams.some((e) => e.targetDate && sameDay(new Date(e.targetDate), d))) && <span className="block h-1.5 w-1.5 rounded-full bg-crimson" />}</div>
              </button>
            ))}
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => (
            <div key={d.toISOString()} className={`card min-h-[120px] p-3 ${sameDay(d, new Date()) ? 'border-crimson/50' : ''}`}>
              <p className="mb-2 text-sm font-semibold capitalize">{d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</p>
              <Events day={d} data={data} compact />
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-5"><Events day={cursor} data={data} /></div>
      )}
      <p className="meta mt-4">Légende : <span className="text-crimson">examen</span> · sessions planifiées (bordure rouge), terminées (verte), manquées (ambre).</p>
    </div>
  );
}
