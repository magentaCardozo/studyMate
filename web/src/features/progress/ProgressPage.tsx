import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { PageHeader, ProgressBar } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useUtils';
import { LineChart as LineIcon } from 'lucide-react';

interface Overview {
  courses: number;
  lessons: { total: number; completed: number };
  quizzes: { attemptsLast30Days: number; averageLast30Days: number | null };
  flashcards: { total: number; mastered: number; reviewsLast7Days: number };
  sessions: { plannedLast30Days: number; completedLast30Days: number };
}
interface CourseStat { id: string; title: string; lessons: { total: number; completed: number; progress: number | null }; quizAverage: number | null; quizAttempts: number }
interface CourseDetail {
  quizTrend: { id: string; date: string; percentage: number | null; title: string }[];
  frequentlyMissed: { topic: string; count: number }[];
  lessonsToRevisit: { id: string; title: string }[];
  flashcards: { total: number; mastered: number; due: number; difficult: number };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-serif text-[26px] font-medium">{value}</p>
      {hint && <p className="meta">{hint}</p>}
    </div>
  );
}

/** Indicateurs calculés uniquement à partir des activités enregistrées — aucun chiffre simulé. */
export default function ProgressPage() {
  useDocumentTitle('Progression');
  const overview = useQuery({ queryKey: ['progress', 'overview'], queryFn: () => api.get<Overview>('/progress/overview') });
  const courses = useQuery({ queryKey: ['progress', 'courses'], queryFn: () => api.get<CourseStat[]>('/progress/courses') });
  const history = useQuery({ queryKey: ['progress', 'history'], queryFn: () => api.get<{ date: string; reviews: number; quizzes: number; sessions: number; studyMinutes: number }[]>('/progress/history?days=30') });
  const [courseId, setCourseId] = useState('');
  const detail = useQuery({ queryKey: ['progress', 'course', courseId], queryFn: () => api.get<CourseDetail>(`/progress/courses/${courseId}`), enabled: !!courseId });

  if (overview.error) return <div className="page"><ErrorState error={overview.error} onRetry={overview.refetch} /></div>;
  if (overview.isLoading || !overview.data) return <Loading />;
  const o = overview.data;
  const noActivity = !o.quizzes.attemptsLast30Days && !o.flashcards.reviewsLast7Days && !o.sessions.completedLast30Days && !o.lessons.completed;

  return (
    <div className="page">
      <PageHeader title="Progression" subtitle="Ce que vous avez réellement accompli — pour savoir où concentrer vos efforts." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leçons terminées" value={`${o.lessons.completed} / ${o.lessons.total}`} />
        <Stat label="Moyenne aux quiz" value={o.quizzes.averageLast30Days !== null ? `${o.quizzes.averageLast30Days} %` : '—'} hint={`${o.quizzes.attemptsLast30Days} tentative(s) sur 30 jours`} />
        <Stat label="Cartes maîtrisées" value={`${o.flashcards.mastered} / ${o.flashcards.total}`} hint={`${o.flashcards.reviewsLast7Days} révisions cette semaine`} />
        <Stat label="Sessions faites" value={`${o.sessions.completedLast30Days} / ${o.sessions.plannedLast30Days}`} hint="30 derniers jours" />
      </div>

      {noActivity ? (
        <div className="mt-8"><EmptyState icon={<LineIcon size={22} />} title="Pas encore de données" description="Vos indicateurs apparaîtront dès que vous terminerez des leçons, des quiz ou des révisions de cartes." /></div>
      ) : (
        <section className="card mt-8 p-5">
          <h2 className="section-title mb-4">Activité des 30 derniers jours</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.data ?? []} margin={{ left: -20, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip labelFormatter={(d) => formatDate(d)} />
                <Bar dataKey="reviews" name="Cartes révisées" stackId="a" fill="#1F2937" />
                <Bar dataKey="quizzes" name="Quiz" stackId="a" fill="#A51C30" />
                <Bar dataKey="sessions" name="Sessions" stackId="a" fill="#287D55" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="section-title mb-3">Par dossier</h2>
        <div className="card divide-y divide-line">
          {courses.data?.map((c) => (
            <div key={c.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_200px_140px]">
              <Link to={`/courses/${c.id}`} className="font-medium hover:text-crimson">{c.title}</Link>
              <div>
                {c.lessons.progress !== null ? <><ProgressBar value={c.lessons.progress} tone="success" label={`Leçons ${c.title}`} /><p className="meta mt-1">{c.lessons.completed}/{c.lessons.total} leçons</p></> : <p className="meta">Aucune leçon</p>}
              </div>
              <p className="text-sm sm:text-right">{c.quizAverage !== null ? <span className={c.quizAverage >= 60 ? 'text-success' : 'text-warning'}>{c.quizAverage} % aux quiz</span> : <span className="meta">Pas de quiz</span>}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="section-title">Analyse détaillée</h2>
          <Select aria-label="Dossier à analyser" className="h-9 w-auto text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Choisir un dossier…</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </div>
        {courseId && (detail.isLoading ? <Loading /> : detail.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">Évolution des résultats aux quiz</h3>
              {detail.data.quizTrend.length < 2 ? <p className="meta">Au moins deux tentatives sont nécessaires pour afficher une tendance.</p> : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={detail.data.quizTrend} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { day: 'numeric', month: 'short' })} tick={{ fontSize: 11, fill: '#6B7280' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B7280' }} />
                      <Tooltip formatter={(v) => `${v} %`} labelFormatter={(d) => formatDate(d)} />
                      <Line dataKey="percentage" name="Score" stroke="#A51C30" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card space-y-4 p-5">
              <div>
                <h3 className="mb-2 font-semibold">Notions souvent manquées</h3>
                {detail.data.frequentlyMissed.length ? <ul className="space-y-1 text-sm">{detail.data.frequentlyMissed.map((m) => <li key={m.topic} className="flex justify-between"><span>{m.topic}</span><span className="meta">{m.count} erreur(s)</span></li>)}</ul> : <p className="meta">Aucune erreur récurrente enregistrée.</p>}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Leçons à revoir</h3>
                {detail.data.lessonsToRevisit.length ? <ul className="space-y-1 text-sm">{detail.data.lessonsToRevisit.map((l) => <li key={l.id}><Link to={`/lessons/${l.id}`} className="text-crimson hover:underline">{l.title}</Link></li>)}</ul> : <p className="meta">Rien à signaler.</p>}
              </div>
              <p className="text-sm">Cartes : {detail.data.flashcards.mastered} maîtrisées · {detail.data.flashcards.due} à revoir · {detail.data.flashcards.difficult} difficiles.</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
