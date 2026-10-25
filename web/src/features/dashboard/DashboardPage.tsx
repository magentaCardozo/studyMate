import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ClipboardPaste, CalendarClock, CheckCircle2, FileText, ScanLine, Sparkles, Upload, CalendarPlus, Lightbulb, History } from 'lucide-react';
import { api } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { ACTIVITY_LABEL, daysUntil, formatDate, formatTime, plural, relativeDay, STATUS_LABEL } from '../../lib/format';
import type { Goal, StudySession } from '../../types/api';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Badge, DemoBadge } from '../../components/ui/Misc';
import { useQuickActions } from '../documents/QuickActions';
import { useDocumentTitle } from '../../hooks/useUtils';

interface Dashboard {
  firstName: string;
  todaySessions: StudySession[];
  continueLearning: { type: 'quiz_attempt' | 'lesson' | 'document'; id: string; title: string; subtitle: string } | null;
  courses: { id: string; title: string; code: string | null; color: string | null; isDemo: boolean; lastOpenedAt: string | null; semester: { name: string } | null; _count: { lessons: number; documents: number; folders: number } }[];
  coursesCount: number;
  exams: Goal[];
  recentDocuments: { id: string; fileName: string; processingStatus: string; createdAt: string; course: { id: string; title: string } | null }[];
  dueCards: number;
  recommendations: { type: string; title: string; description: string; link: string }[];
  activity: { type: string; date: string; label: string }[];
}

const continueLink = (c: NonNullable<Dashboard['continueLearning']>) => (c.type === 'quiz_attempt' ? `/revision/attempts/${c.id}` : c.type === 'lesson' ? `/lessons/${c.id}` : `/documents/${c.id}`);

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Accueil');
  const t = useT();
  const quick = useQuickActions();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

  if (error) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const quickActions = [
    { label: t('action.newCourse'), icon: <BookOpen size={18} />, onClick: () => quick.openNewCourse() },
    { label: t('action.import'), icon: <Upload size={18} />, onClick: () => quick.openImport() },
    { label: t('action.scan'), icon: <ScanLine size={18} />, onClick: () => quick.openScan() },
    { label: t('action.paste'), icon: <ClipboardPaste size={18} />, onClick: () => quick.openPaste() },
    { label: t('action.quiz'), icon: <Sparkles size={18} />, to: '/revision?generate=quiz' },
    { label: t('action.plan'), icon: <CalendarPlus size={18} />, to: '/coach' },
  ];

  return (
    <div className="page">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">{isLoading ? <Skeleton className="h-9 w-56" /> : `${t('dashboard.hello')}, ${data?.firstName}`}</h1>
          <p className="mt-1.5 text-muted">{t('dashboard.subtitle')}</p>
        </div>
        {data?.continueLearning && (
          <ButtonLink to={continueLink(data.continueLearning)} size="lg" icon={<ArrowRight size={18} />}>
            {t('dashboard.continue')}
          </ButtonLink>
        )}
      </header>

      {data && data.coursesCount === 0 ? (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="Votre espace académique est prêt."
          description="Commencez par créer un dossier (par exemple « Statistique »), puis ajoutez-y vos PDF, scans ou textes : ils formeront sa base de connaissances."
          action={
            <>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md bg-crimson px-4 text-sm font-medium text-white hover:bg-crimson-dark" onClick={() => quick.openNewCourse()}>
                Créer un dossier
              </button>
              <ButtonLink to="/settings#demo" variant="secondary">
                Voir un exemple
              </ButtonLink>
            </>
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            <Section title="Programme du jour" action={<Link to="/coach" className="text-sm text-crimson hover:underline">Mon coach</Link>}>
              {isLoading ? (
                <Skeleton className="h-24" />
              ) : data!.todaySessions.length ? (
                <ul className="card divide-y divide-line">
                  {data!.todaySessions.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-14 shrink-0 text-sm font-medium tabular-nums">{formatTime(s.scheduledStart)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{s.lesson?.title ?? s.course?.title}</p>
                        <p className="meta truncate">
                          {ACTIVITY_LABEL[s.activityType]} · {s.course?.title}
                        </p>
                      </div>
                      {s.status === 'COMPLETED' ? <Badge tone="success"><CheckCircle2 size={12} /> Fait</Badge> : s.status === 'MISSED' ? <Badge tone="warning">Manquée</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Vous n’avez pas encore de programme de révision.</p>
                    <p className="meta">Choisissez un dossier et une date d’examen pour commencer.</p>
                  </div>
                  <ButtonLink to="/coach" variant="secondary" size="sm">
                    Planifier
                  </ButtonLink>
                </div>
              )}
            </Section>

            <Section title="Mes dossiers" action={<Link to="/courses" className="text-sm text-crimson hover:underline">Tout voir</Link>}>
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data!.courses.map((c) => (
                    <Link key={c.id} to={`/courses/${c.id}`} className="card group flex gap-3 p-4 transition-colors hover:border-charcoal/25">
                      <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: c.color ?? '#A51C30' }} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate font-serif text-[17px] font-semibold group-hover:text-crimson">{c.title}</p>
                        <p className="meta">
                          {plural(c._count.documents, 'document')}{c._count.folders ? ` · ${plural(c._count.folders, 'sous-dossier')}` : ''}
                        </p>
                        <p className="meta mt-0.5 flex items-center gap-2">
                          {c.semester?.name ?? 'Sans semestre'} · Ouvert : {relativeDay(c.lastOpenedAt)} {c.isDemo && <DemoBadge />}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Documents récents">
              {data && !data.recentDocuments.length ? (
                <p className="meta">Aucun document pour le moment. Ouvrez un dossier pour importer un PDF, scanner ou coller du texte.</p>
              ) : (
                <ul className="card divide-y divide-line">
                  {data?.recentDocuments.map((d) => (
                    <li key={d.id}>
                      <Link to={`/documents/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                        <FileText size={18} className="shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.fileName}</p>
                          <p className="meta truncate">{d.course?.title} · {relativeDay(d.createdAt)}</p>
                        </div>
                        {d.processingStatus !== 'READY' && <Badge tone={d.processingStatus === 'FAILED' ? 'danger' : 'warning'}>{STATUS_LABEL[d.processingStatus]}</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {data && data.activity.length > 0 && (
              <Section title="Activité récente">
                <ul className="space-y-2">
                  {data.activity.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <History size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                      <span className="flex-1">{a.label}</span>
                      <span className="meta shrink-0">{relativeDay(a.date)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          <aside className="space-y-6">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Actions rapides</h2>
              <div className="grid gap-1">
                {quickActions.map((a) =>
                  a.to ? (
                    <Link key={a.label} to={a.to} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-ivory">
                      <span className="text-crimson">{a.icon}</span>
                      {a.label}
                    </Link>
                  ) : (
                    <button key={a.label} type="button" onClick={a.onClick} className="flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-ivory">
                      <span className="text-crimson">{a.icon}</span>
                      {a.label}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <CalendarClock size={15} /> Examens à venir
              </h2>
              {data?.exams.length ? (
                <ul className="space-y-3">
                  {data.exams.map((e) => {
                    const d = daysUntil(e.targetDate!);
                    return (
                      <li key={e.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="meta">{formatDate(e.targetDate)}{e.course ? ` · ${e.course.title}` : ''}</p>
                        </div>
                        <Badge tone={d <= 3 ? 'crimson' : d <= 10 ? 'warning' : 'neutral'}>{d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `J-${d}`}</Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="meta">Aucun examen enregistré. <Link to="/coach" className="text-crimson hover:underline">Ajouter une date</Link></p>
              )}
            </div>

            {data && data.recommendations.length > 0 && (
              <div className="card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                  <Lightbulb size={15} /> Recommandations
                </h2>
                <ul className="space-y-3">
                  {data.recommendations.map((r) => (
                    <li key={r.title}>
                      <Link to={r.link} className="group block">
                        <p className="text-sm font-medium group-hover:text-crimson">{r.title}</p>
                        <p className="meta">{r.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
