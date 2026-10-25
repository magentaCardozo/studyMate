import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleCheck, Circle, CircleDot, FilePlus2, Folder, FolderPlus, FolderInput, LayoutGrid, List, NotebookPen, Pencil, ScanLine, Sparkles, Trash2, Upload, Copy, FileText } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { LESSON_STATUS, plural, relativeDay } from '../../lib/format';
import type { DocumentItem, Note, TreeFolder, TreeLesson } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Breadcrumbs, DemoBadge, Menu, PageHeader, ProgressBar, Segmented } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle, usePersistentState } from '../../hooks/useUtils';
import { useCourse } from './hooks';
import { FolderFormDialog, LessonFormDialog, MoveDialog } from './dialogs';
import { CourseFormDialog } from './CourseFormDialog';
import { useQuickActions } from '../documents/QuickActions';
import { GenerateDialog, type GenerateKind } from '../smart-revision/GenerateDialog';
import { AddToKnowledgeBase, KnowledgeBaseStatus, UseKnowledgeBase, useKnowledgeBase } from '../documents/KnowledgeBase';
import { DocumentRow } from '../documents/DocumentRow';

export const LessonIcon = ({ status }: { status: string }) =>
  status === 'COMPLETED' ? <CircleCheck size={17} className="text-success" aria-label="Terminée" /> : status === 'IN_PROGRESS' ? <CircleDot size={17} className="text-warning" aria-label="En cours" /> : <Circle size={17} className="text-muted/60" aria-label="À commencer" />;

type MoveTarget = Parameters<typeof MoveDialog>[0]['item'];

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const quick = useQuickActions();
  const { data: course, isLoading, error, refetch } = useCourse(id);
  useDocumentTitle(course?.title ?? 'Dossier');
  const [view, setView] = usePersistentState<'list' | 'grid'>('course-view', 'list');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [folderDialog, setFolderDialog] = useState<{ parent?: string | null; folder?: TreeFolder } | null>(null);
  const [lessonDialog, setLessonDialog] = useState<{ folderId?: string | null } | null>(null);
  const [move, setMove] = useState<MoveTarget>(null);
  const [del, setDel] = useState<{ kind: 'folder' | 'lesson'; id: string; name: string } | null>(null);
  const [editCourse, setEditCourse] = useState(false);
  const [generate, setGenerate] = useState<GenerateKind | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const kb = useKnowledgeBase(id);
  const docs = useQuery({
    queryKey: ['documents', 'course', id],
    queryFn: () => api.page<DocumentItem>(`/documents${qs({ courseId: id, pageSize: 100 })}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.data.some((d) => ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(d.processingStatus)) ? 3000 : false),
  });
  const notes = useQuery({ queryKey: ['notes', 'course', id], queryFn: () => api.page<Note>(`/notes${qs({ courseId: id, pageSize: 50 })}`), enabled: !!id });

  const invalidate = () => ['course', 'folder', 'courses', 'documents'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post(`/courses/${id}/folders/reorder`, { folderIds: ids }),
    onSuccess: invalidate,
    onError: toast.error,
  });
  const duplicate = useMutation({ mutationFn: (fid: string) => api.post(`/folders/${fid}/duplicate`), onSuccess: () => (invalidate(), toast.show('Structure dupliquée.')), onError: toast.error });

  if (isLoading) return <Loading />;
  if (error || !course) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const siblingsOf = (parentId: string | null): TreeFolder[] => {
    if (!parentId) return course.tree.folders;
    const find = (fs: TreeFolder[]): TreeFolder | undefined => fs.reduce<TreeFolder | undefined>((acc, f) => acc ?? (f.id === parentId ? f : find(f.children)), undefined);
    return find(course.tree.folders)?.children ?? [];
  };
  const shift = (f: TreeFolder, delta: number) => {
    const sib = siblingsOf(f.parentFolderId).map((x) => x.id);
    const i = sib.indexOf(f.id);
    if (i + delta < 0 || i + delta >= sib.length) return;
    [sib[i], sib[i + delta]] = [sib[i + delta], sib[i]];
    reorder.mutate(sib);
  };
  const dropOn = (target: TreeFolder) => {
    if (!dragId || dragId === target.id) return;
    const sib = siblingsOf(target.parentFolderId).map((x) => x.id);
    if (!sib.includes(dragId)) return; // réordonnancement au même niveau uniquement
    const without = sib.filter((x) => x !== dragId);
    without.splice(without.indexOf(target.id), 0, dragId);
    reorder.mutate(without);
  };
  const toggle = (fid: string) => setCollapsed((s) => (s.has(fid) ? (s.delete(fid), new Set(s)) : new Set(s).add(fid)));

  const lessonRow = (l: TreeLesson, depth: number, folderId: string | null) => (
    <li key={l.id} className="group flex items-center gap-2 py-1.5 pr-2 hover:bg-ivory/70" style={{ paddingLeft: 12 + depth * 22 }}>
      <LessonIcon status={l.status} />
      <Link to={`/lessons/${l.id}`} className="min-w-0 flex-1 truncate text-[14.5px] hover:text-crimson">
        {l.title}
      </Link>
      <Menu
        label={`Actions pour ${l.title}`}
        items={[
          { label: 'Déplacer', icon: <FolderInput size={15} />, onClick: () => setMove({ kind: 'lesson', id: l.id, name: l.title, courseId: course.id, currentFolderId: folderId }) },
          { label: 'Supprimer', icon: <Trash2 size={15} />, danger: true, onClick: () => setDel({ kind: 'lesson', id: l.id, name: l.title }) },
        ]}
      />
    </li>
  );

  const folderRow = (f: TreeFolder, depth: number): React.ReactNode => {
    const open = !collapsed.has(f.id);
    return (
      <li key={f.id}>
        <div
          draggable
          onDragStart={() => setDragId(f.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropOn(f)}
          className={`group flex items-center gap-2 py-2 pr-2 hover:bg-ivory/70 ${dragId === f.id ? 'opacity-50' : ''}`}
          style={{ paddingLeft: 4 + depth * 22 }}
        >
          <button type="button" onClick={() => toggle(f.id)} aria-expanded={open} aria-label={open ? `Replier ${f.name}` : `Déplier ${f.name}`} className="rounded p-1 text-muted hover:text-charcoal">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <Folder size={17} className="shrink-0 text-crimson" style={f.color ? { color: f.color } : undefined} aria-hidden />
          <Link to={`/folders/${f.id}`} className="min-w-0 flex-1 truncate text-[14.5px] font-medium hover:text-crimson">
            {f.name}
          </Link>
          <span className="meta hidden sm:inline">
            {plural(f.counts.lessons, 'leçon')} · {plural(f.counts.documents, 'doc')}
          </span>
          <Menu
            label={`Actions pour ${f.name}`}
            items={[
              { label: 'Nouvelle leçon ici', icon: <FilePlus2 size={15} />, onClick: () => setLessonDialog({ folderId: f.id }) },
              { label: 'Nouveau sous-dossier', icon: <FolderPlus size={15} />, onClick: () => setFolderDialog({ parent: f.id }) },
              { label: 'Renommer', icon: <Pencil size={15} />, onClick: () => setFolderDialog({ folder: f }) },
              { label: 'Déplacer', icon: <FolderInput size={15} />, onClick: () => setMove({ kind: 'folder', id: f.id, name: f.name, courseId: course.id, currentFolderId: f.parentFolderId }) },
              { label: 'Monter', icon: <ArrowUp size={15} />, onClick: () => shift(f, -1) },
              { label: 'Descendre', icon: <ArrowDown size={15} />, onClick: () => shift(f, 1) },
              { label: 'Dupliquer la structure', icon: <Copy size={15} />, onClick: () => duplicate.mutate(f.id) },
              { label: 'Supprimer', icon: <Trash2 size={15} />, danger: true, onClick: () => setDel({ kind: 'folder', id: f.id, name: f.name }) },
            ]}
          />
        </div>
        {open && (f.children.length > 0 || f.lessons.length > 0) && (
          <ul>
            {f.children.map((c) => folderRow(c, depth + 1))}
            {f.lessons.map((l) => lessonRow(l, depth + 1, f.id))}
          </ul>
        )}
      </li>
    );
  };

  const empty = !course.tree.folders.length && !course.tree.lessons.length;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Mes dossiers', to: '/courses' }, { label: course.title }]} />
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="h-3 w-3 rounded-full" style={{ background: course.color ?? '#A51C30' }} aria-hidden />
            Dossier{[course.code, course.semester?.name, course.academicYear?.name].filter(Boolean).map((x) => ` · ${x}`).join('')}
            {course.isDemo && <DemoBadge />}
          </div>
        }
        title={course.title}
        subtitle={course.description}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditCourse(true)}>Modifier</Button>
            <Button icon={<Sparkles size={16} />} disabled={!kb.data?.canGenerate} onClick={() => setGenerate('qcm')}>Générer un QCM</Button>
          </>
        }
      />
      {course.stats && course.stats.progress !== null && (
        <div className="mb-6 max-w-md">
          <div className="mb-1 flex justify-between text-[13px] text-muted">
            <span>Leçons terminées</span>
            <span>{course.stats.completedLessons} / {course.stats.lessons}</span>
          </div>
          <ProgressBar value={course.stats.progress} tone="success" label="Progression des leçons" />
        </div>
      )}

      {/* 1. Base de connaissances : tous les documents du dossier */}
      <section className="mb-10 space-y-4" aria-labelledby="kb-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="kb-title" className="section-title">Base de connaissances</h2>
            <KnowledgeBaseStatus stats={kb.data} />
          </div>
        </div>
        <AddToKnowledgeBase courseId={course.id} />
        {docs.data && docs.data.data.length > 0 && (
          <ul className="card divide-y divide-line">
            {docs.data.data.map((d) => (
              <DocumentRow key={d.id} doc={d} onMove={() => setMove({ kind: 'document', id: d.id, name: d.fileName, placement: { courseId: d.courseId, folderId: d.folderId, lessonId: null } })} />
            ))}
          </ul>
        )}
      </section>

      {/* 2. Exploiter la base */}
      <section className="mb-10 space-y-3" aria-labelledby="use-title">
        <h2 id="use-title" className="section-title">Réviser à partir de cette base</h2>
        {!kb.data?.canGenerate && <p className="meta">{kb.data?.processing ? 'Analyse des documents en cours… les révisions seront disponibles dans un instant.' : 'Ajoutez au moins un document lisible (PDF, scan ou texte collé) pour générer un QCM ou des fiches de révision.'}</p>}
        <UseKnowledgeBase canGenerate={!!kb.data?.canGenerate} onGenerate={setGenerate} />
      </section>

      {/* 3. Organisation facultative : sous-dossiers, leçons, notes */}
      <section aria-labelledby="org-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="org-title" className="section-title mr-auto">Organisation</h2>
          <Button size="sm" variant="secondary" icon={<FolderPlus size={15} />} onClick={() => setFolderDialog({})}>Sous-dossier</Button>
          <Button size="sm" variant="secondary" icon={<FilePlus2 size={15} />} onClick={() => setLessonDialog({})}>Leçon</Button>
          <ButtonLink size="sm" variant="secondary" icon={<NotebookPen size={15} />} to={`/notes/new?courseId=${course.id}`}>Note</ButtonLink>
          <Segmented label="Affichage" value={view} onChange={setView} options={[{ id: 'list', label: 'Liste', icon: <List size={15} /> }, { id: 'grid', label: 'Grille', icon: <LayoutGrid size={15} /> }]} />
        </div>
        {empty ? (
          <p className="meta">Facultatif : créez des sous-dossiers (chapitres, examens précédents…) pour ranger les documents, ou des leçons pour structurer votre étude.</p>
        ) : view === 'list' ? (
          <div className="card py-1">
            <ul aria-label="Sous-dossiers et leçons">
              {course.tree.folders.map((f) => folderRow(f, 0))}
              {course.tree.lessons.map((l) => lessonRow(l, 0, null))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Astuce : glissez-déposez les sous-dossiers pour les réordonner, ou utilisez « Monter / Descendre » dans le menu.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {course.tree.folders.map((f) => (
              <Link key={f.id} to={`/folders/${f.id}`} className="card group p-5 hover:border-charcoal/25">
                <Folder size={22} className="text-crimson" style={f.color ? { color: f.color } : undefined} aria-hidden />
                <p className="mt-3 font-serif text-[17px] font-semibold group-hover:text-crimson">{f.name}</p>
                <p className="meta mt-1">
                  {plural(f.counts.documents, 'document')} · {plural(f.counts.lessons, 'leçon')}
                  {f.counts.subfolders ? ` · ${plural(f.counts.subfolders, 'sous-dossier')}` : ''}
                </p>
                <p className="meta mt-2">Modifié : {relativeDay(f.updatedAt)}</p>
              </Link>
            ))}
            {course.tree.lessons.map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="card group p-5 hover:border-charcoal/25">
                <LessonIcon status={l.status} />
                <p className="mt-3 font-serif text-[17px] font-semibold group-hover:text-crimson">{l.title}</p>
                <p className="meta mt-1">{LESSON_STATUS[l.status]}</p>
              </Link>
            ))}
          </div>
        )}
        {notes.data && notes.data.data.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Notes</h3>
            <ul className="card divide-y divide-line">
              {notes.data.data.map((n) => (
                <li key={n.id}>
                  <Link to={`/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                    <FileText size={17} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="meta truncate">{n.lesson?.title ?? n.folder?.name ?? course.title} · {relativeDay(n.updatedAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {folderDialog && <FolderFormDialog open onClose={() => setFolderDialog(null)} courseId={course.id} parentFolderId={folderDialog.parent} folder={folderDialog.folder} />}
      {lessonDialog && <LessonFormDialog open onClose={() => setLessonDialog(null)} courseId={course.id} folderId={lessonDialog.folderId} />}
      <MoveDialog open={!!move} onClose={() => setMove(null)} item={move} />
      {editCourse && <CourseFormDialog open onClose={() => setEditCourse(false)} course={course} />}
      {generate && <GenerateDialog open onClose={() => setGenerate(null)} scope={{ courseId: course.id }} scopeLabel={`dossier « ${course.title} »`} initialKind={generate} />}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={del?.kind === 'folder' ? 'Supprimer le sous-dossier ?' : 'Supprimer la leçon ?'}
        message={
          del?.kind === 'folder'
            ? `« ${del?.name} », ses sous-dossiers et ses leçons seront supprimés. Les documents et notes qu’il contient seront conservés à la racine du dossier.`
            : `« ${del?.name} » sera supprimée. Les notes liées seront conservées dans le dossier.`
        }
        onConfirm={async () => {
          await api.del(del!.kind === 'folder' ? `/folders/${del!.id}` : `/lessons/${del!.id}`);
          invalidate();
          toast.show(del!.kind === 'folder' ? 'Sous-dossier supprimé.' : 'Leçon supprimée.');
        }}
      />
    </div>
  );
}
