import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, FileText, Folder, FolderPlus, NotebookPen, Pencil, ScanLine, Search, Sparkles, Upload } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { LESSON_STATUS, plural, relativeDay } from '../../lib/format';
import type { FolderDetail } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Breadcrumbs, PageHeader } from '../../components/ui/Misc';
import { useDebounce, useDocumentTitle } from '../../hooks/useUtils';
import { FolderFormDialog, LessonFormDialog, MoveDialog } from './dialogs';
import { useQuickActions } from '../documents/QuickActions';
import { GenerateDialog, type GenerateKind } from '../smart-revision/GenerateDialog';
import { AddToKnowledgeBase, UseKnowledgeBase } from '../documents/KnowledgeBase';
import { DocumentRow } from '../documents/DocumentRow';
import { LessonIcon } from './CourseDetailPage';

export default function FolderPage() {
  const { id } = useParams<{ id: string }>();
  const quick = useQuickActions();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data: f, isLoading, error, refetch } = useQuery({ queryKey: ['folder', id, q], queryFn: () => api.get<FolderDetail>(`/folders/${id}${qs({ q })}`), placeholderData: (prev) => prev });
  useDocumentTitle(f?.name ?? 'Sous-dossier');
  const [dialog, setDialog] = useState<'folder' | 'lesson' | 'rename' | null>(null);
  const [kind, setKind] = useState<GenerateKind | null>(null);
  const [move, setMove] = useState<Parameters<typeof MoveDialog>[0]['item']>(null);

  if (isLoading) return <Loading />;
  if (error || !f) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const empty = !f.children.length && !f.lessons.length && !f.documents.length && !f.notes.length;
  const canGenerate = f.documents.some((d) => d.processingStatus === 'READY');

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Mes dossiers', to: '/courses' }, { label: f.course.title, to: `/courses/${f.course.id}` }, ...f.breadcrumb.map((b) => ({ label: b.name, to: `/folders/${b.id}` }))]} />
      <PageHeader
        title={f.name}
        subtitle={f.description}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setDialog('rename')}>Renommer</Button>
            <Button icon={<Sparkles size={16} />} disabled={!canGenerate} onClick={() => setKind('qcm')}>Générer un QCM</Button>
          </>
        }
      />
      <section className="mb-8 space-y-3">
        <h2 className="section-title">Ajouter à la base de connaissances</h2>
        <p className="meta">Les documents ajoutés ici font partie de la base du dossier « {f.course.title} ».</p>
        <AddToKnowledgeBase courseId={f.courseId} folderId={f.id} />
      </section>
      <section className="mb-8 space-y-3">
        <h2 className="section-title">Réviser ce sous-dossier</h2>
        {!canGenerate && <p className="meta">Ajoutez au moins un document lisible pour générer un QCM ou des fiches à partir de ce sous-dossier.</p>}
        <UseKnowledgeBase canGenerate={canGenerate} onGenerate={setKind} />
      </section>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<FolderPlus size={15} />} onClick={() => setDialog('folder')}>Sous-dossier</Button>
        <Button size="sm" variant="secondary" icon={<FilePlus2 size={15} />} onClick={() => setDialog('lesson')}>Leçon</Button>
        <ButtonLink size="sm" variant="secondary" icon={<NotebookPen size={15} />} to={`/notes/new?courseId=${f.courseId}&folderId=${f.id}`}>Note</ButtonLink>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans ce sous-dossier" aria-label="Rechercher dans ce sous-dossier" className="field h-9 pl-9 text-sm" />
        </div>
      </div>

      {empty ? (
        q ? (
          <EmptyState icon={<Search size={22} />} title="Aucun résultat dans ce sous-dossier" />
        ) : (
          <EmptyState icon={<Folder size={22} />} title="Aucun document dans ce sous-dossier." description="Importez un PDF, scannez vos notes ou collez du texte ci-dessus." />
        )
      ) : (
        <div className="space-y-8">
          {f.children.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Sous-dossiers</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {f.children.map((c) => (
                  <Link key={c.id} to={`/folders/${c.id}`} className="card flex items-center gap-3 p-4 hover:border-charcoal/25">
                    <Folder size={20} className="text-crimson" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="meta">{plural(c._count.lessons, 'leçon')} · {plural(c._count.documents, 'doc')}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {f.lessons.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Leçons</h2>
              <ul className="card divide-y divide-line">
                {f.lessons.map((l) => (
                  <li key={l.id}>
                    <Link to={`/lessons/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                      <LessonIcon status={l.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{l.title}</p>
                        <p className="meta">{LESSON_STATUS[l.status]}{l.estimatedMinutes ? ` · ${l.estimatedMinutes} min` : ''}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {f.documents.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Documents</h2>
              <ul className="card divide-y divide-line">
                {f.documents.map((d) => <DocumentRow key={d.id} doc={d} onMove={() => setMove({ kind: 'document', id: d.id, name: d.fileName, placement: { courseId: d.courseId, folderId: d.folderId, lessonId: null } })} />)}
              </ul>
            </section>
          )}
          {f.notes.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Notes</h2>
              <ul className="card divide-y divide-line">
                {f.notes.map((n) => (
                  <li key={n.id}>
                    <Link to={`/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/60">
                      <FileText size={17} className="text-muted" />
                      <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                      <span className="meta">{relativeDay(n.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {dialog === 'folder' && <FolderFormDialog open onClose={() => setDialog(null)} courseId={f.courseId} parentFolderId={f.id} />}
      {dialog === 'rename' && <FolderFormDialog open onClose={() => setDialog(null)} courseId={f.courseId} folder={f} />}
      {dialog === 'lesson' && <LessonFormDialog open onClose={() => setDialog(null)} courseId={f.courseId} folderId={f.id} />}
      {kind && <GenerateDialog open onClose={() => setKind(null)} scope={{ folderId: f.id }} scopeLabel={`sous-dossier « ${f.name} »`} initialKind={kind} />}
      <MoveDialog open={!!move} onClose={() => setMove(null)} item={move} />
    </div>
  );
}
