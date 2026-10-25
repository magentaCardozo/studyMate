import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, BookOpen, LayoutGrid, List, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { plural, relativeDay } from '../../lib/format';
import type { Course } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, SkeletonCards } from '../../components/ui/Feedback';
import { DemoBadge, Menu, PageHeader, ProgressBar, Segmented } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useDebounce, useDocumentTitle, usePersistentState } from '../../hooks/useUtils';
import { useCourses, useYears } from './hooks';
import { CourseFormDialog } from './CourseFormDialog';

export default function CoursesPage() {
  useDocumentTitle('Mes dossiers');
  const qc = useQueryClient();
  const toast = useToast();
  const years = useYears();
  const [view, setView] = usePersistentState<'grid' | 'list'>('courses-view', 'grid');
  const [search, setSearch] = useState('');
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Course | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const q = useDebounce(search);
  const { data, isLoading, error, refetch } = useCourses(qs({ q, academicYearId: yearId, semesterId, sort, archived: archived ? 'true' : 'false', pageSize: 100 }));
  const semesters = years.data?.find((y) => y.id === yearId)?.semesters ?? years.data?.flatMap((y) => y.semesters) ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const archive = useMutation({
    mutationFn: (c: Course) => api.patch(`/courses/${c.id}`, { archived: !c.archivedAt }),
    onSuccess: (_d, c) => (invalidate(), toast.show(c.archivedAt ? 'Dossier restauré.' : 'Dossier archivé.')),
    onError: toast.error,
  });

  const menu = (c: Course) => (
    <Menu
      label={`Actions pour ${c.title}`}
      items={[
        { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => setEditing(c) },
        { label: c.archivedAt ? 'Restaurer' : 'Archiver', icon: c.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />, onClick: () => archive.mutate(c) },
        { label: 'Supprimer', icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleting(c) },
      ]}
    />
  );

  return (
    <div className="page">
      <PageHeader
        title="Mes dossiers"
        subtitle="Un dossier par cours : sa base de connaissances alimente vos QCM et fiches de révision."
        actions={
          <Button icon={<Plus size={17} />} onClick={() => setEditing(null)}>
            Nouveau dossier
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="relative min-w-0 flex-1 xl:min-w-[260px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un dossier, un code…" aria-label="Rechercher un dossier" className="field pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <Select aria-label="Année académique" value={yearId} onChange={(e) => (setYearId(e.target.value), setSemesterId(''))}>
            <option value="">Toutes les années</option>
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Semestre" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            <option value="">Tous les semestres</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'alpha')}>
            <option value="recent">Activité récente</option>
            <option value="alpha">Ordre alphabétique</option>
          </Select>
          <Segmented label="Affichage" value={view} onChange={setView} options={[{ id: 'grid', label: 'Grille', icon: <LayoutGrid size={15} /> }, { id: 'list', label: 'Liste', icon: <List size={15} /> }]} />
        </div>
      </div>
      <label className="mb-4 inline-flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="accent-crimson" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Afficher les dossiers archivés
      </label>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <SkeletonCards />
      ) : !data?.data.length ? (
        search || semesterId || yearId || archived ? (
          <EmptyState icon={<Search size={22} />} title="Aucun dossier trouvé" description="Modifiez la recherche ou les filtres." />
        ) : (
          <EmptyState icon={<BookOpen size={22} />} title="Votre espace académique est prêt." description="Commencez par créer un dossier (par exemple « Statistique ») : vous y importerez vos PDF, scans et textes." action={<Button onClick={() => setEditing(null)}>Créer un dossier</Button>} />
        )
      ) : view === 'grid' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((c) => (
            <li key={c.id} className="card flex flex-col">
              <div className="h-1 rounded-t-lg" style={{ background: c.color ?? '#A51C30' }} aria-hidden />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {c.code && <p className="text-xs font-medium uppercase tracking-wide text-muted">{c.code}</p>}
                    <Link to={`/courses/${c.id}`} className="font-serif text-lg font-semibold leading-snug hover:text-crimson">
                      {c.title}
                    </Link>
                  </div>
                  {menu(c)}
                </div>
                <p className="meta mt-1">
                  {[c.faculty, c.semester?.name, c.academicYear?.name].filter(Boolean).join(' · ') || 'Sans semestre'}
                </p>
                <p className="mt-3 text-sm text-charcoal/80">
                  {plural(c.stats!.documents, 'document')}{c.stats!.folders ? ` · ${plural(c.stats!.folders, 'sous-dossier')}` : ''}{c.stats!.lessons ? ` · ${plural(c.stats!.lessons, 'leçon')}` : ''}
                </p>
                {c.stats!.progress !== null && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>Leçons terminées</span>
                      <span>{c.stats!.completedLessons}/{c.stats!.lessons}</span>
                    </div>
                    <ProgressBar value={c.stats!.progress} label={`Progression ${c.title}`} tone="success" />
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="meta">Activité : {relativeDay(c.lastActivityAt)}</span>
                  <span className="flex gap-1">{c.isDemo && <DemoBadge />}{c.archivedAt && <span className="chip">Archivée</span>}</span>
                </div>
                <Link to={`/courses/${c.id}`} className="mt-3 text-sm font-medium text-crimson hover:underline">
                  Ouvrir le dossier →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Dossier</th>
                <th className="px-4 py-3 font-medium">Semestre</th>
                <th className="px-4 py-3 font-medium">Contenu</th>
                <th className="px-4 py-3 font-medium">Activité</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.data.map((c) => (
                <tr key={c.id} className="hover:bg-ivory/50">
                  <td className="px-4 py-3">
                    <Link to={`/courses/${c.id}`} className="flex items-center gap-3 font-medium hover:text-crimson">
                      <span className="h-6 w-1 rounded-full" style={{ background: c.color ?? '#A51C30' }} aria-hidden />
                      {c.title}
                      {c.code && <span className="text-xs text-muted">{c.code}</span>}
                      {c.isDemo && <DemoBadge />}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.semester?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {c.stats!.documents} docs · {c.stats!.folders} sous-dossiers
                  </td>
                  <td className="px-4 py-3 text-muted">{relativeDay(c.lastActivityAt)}</td>
                  <td className="px-2">{menu(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && <CourseFormDialog open onClose={() => setEditing(undefined)} course={editing ?? undefined} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Supprimer le dossier ?"
        message={
          <>
            <p>
              « {deleting?.title} » sera supprimé définitivement, avec sa base de connaissances (documents), ses sous-dossiers, leçons, notes et révisions.
            </p>
            <p className="mt-2 text-muted">Pour la conserver sans l’afficher, préférez l’archivage.</p>
          </>
        }
        onConfirm={async () => {
          await api.del(`/courses/${deleting!.id}`);
          invalidate();
          toast.show('Dossier supprimé.');
        }}
      />
    </div>
  );
}
