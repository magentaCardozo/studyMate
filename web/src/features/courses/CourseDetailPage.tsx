import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, ChevronRight, CircleCheck, Circle, CircleDot, FileText, Layers, ListChecks, Pencil, Sparkles } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { formatDate, formatTime, plural } from '../../lib/format';
import type { CourseRevisions, DocumentItem } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Breadcrumbs, DemoBadge, PageHeader, Tabs } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useCourse } from './hooks';
import { MoveDialog } from './dialogs';
import { CourseFormDialog } from './CourseFormDialog';
import { GenerateDialog, type GenerateKind } from '../smart-revision/GenerateDialog';
import { AddToKnowledgeBase, ImportButtons, KnowledgeBaseStatus, useKnowledgeBase } from '../documents/KnowledgeBase';
import { DocumentRow } from '../documents/DocumentRow';

export const LessonIcon = ({ status }: { status: string }) =>
  status === 'COMPLETED' ? <CircleCheck size={17} className="text-success" aria-label="Terminée" /> : status === 'IN_PROGRESS' ? <CircleDot size={17} className="text-warning" aria-label="En cours" /> : <Circle size={17} className="text-muted/60" aria-label="À commencer" />;

type MoveTarget = Parameters<typeof MoveDialog>[0]['item'];
type SubfolderId = 'qcm' | 'flashcards' | 'fiches';

/** Les trois sous-dossiers fixes de chaque dossier : uniquement du contenu généré à partir des documents. */
const SUBFOLDERS: { id: SubfolderId; name: string; kind: GenerateKind; kinds: GenerateKind[]; icon: React.ReactNode; hint: string; empty: string; cta: string }[] = [
  { id: 'qcm', name: 'QCM', kind: 'qcm', kinds: ['qcm', 'mock'], icon: <ListChecks size={16} />, hint: 'Questionnaires à choix multiple corrigés, avec explications et sources.', empty: 'Aucun QCM pour l’instant.', cta: 'Générer un QCM' },
  { id: 'flashcards', name: 'Flash-cards', kind: 'flashcards', kinds: ['flashcards'], icon: <Layers size={16} />, hint: 'Cartes question-réponse, révisées par répétition espacée.', empty: 'Aucun paquet de flash-cards pour l’instant.', cta: 'Générer des flash-cards' },
  { id: 'fiches', name: 'Fiches de révision', kind: 'summary', kinds: ['summary'], icon: <FileText size={16} />, hint: 'Notions clés, définitions, formules et exemples du cours.', empty: 'Aucune fiche de révision pour l’instant.', cta: 'Générer une fiche' },
];

const dayKey = (d: string) => new Date(d).toDateString();
function dayLabel(d: string) {
  const day = new Date(d);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return 'Aujourd’hui';
  if (day.toDateString() === yesterday.toDateString()) return 'Hier';
  return formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

interface Row {
  id: string;
  title: string;
  createdAt: string;
  to: string;
  meta: string;
}

/** Contenu d'un sous-dossier, regroupé par jour de génération (le plus récent en premier). */
function DatedList({ rows, empty }: { rows: Row[]; empty: React.ReactNode }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">{empty}</div>;
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(r);
    else groups.push({ key, label: dayLabel(r.createdAt), rows: [r] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h4 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted first-letter:uppercase">{g.label}</h4>
          <ul className="card divide-y divide-line">
            {g.rows.map((r) => (
              <li key={r.id}>
                <Link to={r.to} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium">{r.title}</p>
                    <p className="meta truncate">{formatTime(r.createdAt)} · {r.meta}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const LENGTH: Record<string, string> = { brief: 'brève', standard: 'standard', detailed: 'détaillée' };

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { data: course, isLoading, error, refetch } = useCourse(id);
  useDocumentTitle(course?.title ?? 'Dossier');
  const [move, setMove] = useState<MoveTarget>(null);
  const [editCourse, setEditCourse] = useState(false);
  const [generate, setGenerate] = useState<(typeof SUBFOLDERS)[number] | null>(null);
  const kb = useKnowledgeBase(id);
  const docs = useQuery({
    queryKey: ['documents', 'course', id],
    queryFn: () => api.page<DocumentItem>(`/documents${qs({ courseId: id, pageSize: 100 })}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.data.some((d) => ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(d.processingStatus)) ? 3000 : false),
  });
  const revisions = useQuery({ queryKey: ['revisions', id], queryFn: () => api.get<CourseRevisions>(`/courses/${id}/revisions`), enabled: !!id });

  if (isLoading) return <Loading />;
  if (error || !course) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const current = SUBFOLDERS.find((s) => s.id === params.get('s')) ?? SUBFOLDERS[0];
  const open = (s: SubfolderId) => setParams((p) => (p.set('s', s), p), { replace: true });
  const rev = revisions.data;
  const rowsOf = (s: SubfolderId): Row[] => {
    if (!rev) return [];
    if (s === 'qcm') return rev.qcm.map((q) => ({ id: q.id, title: q.title, createdAt: q.createdAt, to: `/revision/quizzes/${q.id}`, meta: `${plural(q.questions, 'question')}${q.lastScore !== null ? ` · dernier score ${q.lastScore} %` : ''}` }));
    if (s === 'flashcards') return rev.flashcards.map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt, to: `/revision/decks/${d.id}`, meta: plural(d.cards, 'carte') }));
    return rev.fiches.map((f) => ({ id: f.id, title: f.title, createdAt: f.createdAt, to: `/revision/summaries/${f.id}`, meta: `fiche ${LENGTH[f.length] ?? f.length}` }));
  };
  const canGenerate = !!kb.data?.canGenerate;
  const documents = docs.data?.data ?? [];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Mes dossiers', to: '/courses' }, { label: course.title }]} />
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: course.color ?? '#A51C30' }} aria-hidden />
            {[course.code, course.semester?.name, course.academicYear?.name].filter(Boolean).join(' · ') || 'Dossier de cours'}
            {course.isDemo && <DemoBadge />}
          </div>
        }
        title={course.title}
        subtitle={course.description}
        actions={
          <>
            {!!kb.data?.ready && (
              <ButtonLink variant="secondary" icon={<BookOpenText size={16} />} to={`/courses/${course.id}/base`}>
                Base de connaissances
              </ButtonLink>
            )}
            <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => setEditCourse(true)}>Modifier</Button>
          </>
        }
      />

      {/* 1. Documents du cours : seul endroit où l'on dépose des PDF (base de connaissances). */}
      <section className="mb-12" aria-labelledby="kb-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="kb-title" className="section-title">Documents du cours</h2>
            <KnowledgeBaseStatus stats={kb.data} />
          </div>
          {documents.length > 0 && <ImportButtons courseId={course.id} />}
        </div>
        {documents.length > 0 ? (
          <ul className="card divide-y divide-line" aria-label="Documents du dossier">
            {documents.map((d) => (
              <DocumentRow key={d.id} doc={d} onMove={() => setMove({ kind: 'document', id: d.id, name: d.fileName, placement: { courseId: d.courseId, folderId: null, lessonId: null } })} />
            ))}
          </ul>
        ) : (
          // Dossier vide : les trois façons d'ajouter du contenu, mises en avant.
          <AddToKnowledgeBase courseId={course.id} />
        )}
      </section>

      {/* 2. Les trois sous-dossiers : QCM, Flash-cards, Fiches de révision. */}
      <section aria-labelledby="sub-title">
        <h2 id="sub-title" className="section-title mb-3">Révisions générées</h2>
        <Tabs
          label="Sous-dossiers"
          controls="subfolder-panel"
          value={current.id}
          onChange={open}
          tabs={SUBFOLDERS.map((sf) => ({ id: sf.id, label: sf.name, shortLabel: sf.id === 'fiches' ? 'Fiches' : undefined, icon: sf.icon, count: rev ? rowsOf(sf.id).length : undefined }))}
        />
        <div id="subfolder-panel" role="tabpanel" aria-label={current.name}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <p className="meta mr-auto max-w-xl">
              {current.hint} Généré à partir de tous les documents prêts du dossier.
            </p>
            <Button icon={<Sparkles size={16} />} disabled={!canGenerate} onClick={() => setGenerate(current)}>{current.cta}</Button>
          </div>
          {!canGenerate && (
            <Notice tone="info">
              {kb.data?.processing ? 'Analyse des documents en cours… la génération sera disponible dans un instant.' : 'Ajoutez au moins un document lisible (PDF, scan ou texte collé) dans ce dossier pour pouvoir générer.'}
            </Notice>
          )}
          {revisions.error ? (
            <ErrorState error={revisions.error} onRetry={revisions.refetch} />
          ) : revisions.isLoading ? (
            <Loading />
          ) : (
            <DatedList
              rows={rowsOf(current.id)}
              empty={
                <>
                  <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-crimson-soft text-crimson">{current.icon}</span>
                  <p className="font-medium">{current.empty}</p>
                  {canGenerate && <p className="meta mt-1">Utilisez « {current.cta} » : le résultat sera rangé ici, classé par date.</p>}
                </>
              }
            />
          )}
        </div>
      </section>

      <MoveDialog open={!!move} onClose={() => setMove(null)} item={move} />
      {editCourse && <CourseFormDialog open onClose={() => setEditCourse(false)} course={course} />}
      {generate && (
        <GenerateDialog
          open
          onClose={() => setGenerate(null)}
          scope={{ courseId: course.id }}
          scopeLabel={`dossier « ${course.title} »`}
          initialKind={generate.kind}
          kinds={generate.kinds}
          onGenerated={() => open(generate.id)}
        />
      )}
    </div>
  );
}
