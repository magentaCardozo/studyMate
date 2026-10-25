import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, Folder, Layers, NotebookPen, Search, GraduationCap, Quote } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { useDebounce, useDocumentTitle } from '../../hooks/useUtils';

interface Results {
  courses: { id: string; title: string; code: string | null; semester: { name: string } | null }[];
  folders: { id: string; name: string; course: { id: string; title: string }; parent: { name: string } | null }[];
  lessons: { id: string; title: string; course: { title: string }; folder: { name: string } | null }[];
  documents: { id: string; fileName: string; course: { title: string } | null; folder: { name: string } | null }[];
  notes: { id: string; title: string; snippet: string; course: { title: string } | null; folder: { name: string } | null }[];
  flashcards: { id: string; question: string; deck: { id: string; title: string; course: { title: string } | null } }[];
  passages: { id: string; page: number | null; snippet: string; document: { id: string; fileName: string; course: { title: string } | null } }[];
}

const path = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' › ');

function Group({ title, icon, children, count }: { title: string; icon: React.ReactNode; children: React.ReactNode; count: number }) {
  if (!count) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">{icon} {title} <span className="font-normal">({count})</span></h2>
      <ul className="card divide-y divide-line">{children}</ul>
    </section>
  );
}

function Row({ to, title, sub }: { to: string; title: string; sub?: string }) {
  return (
    <li>
      <Link to={to} className="block px-4 py-3 hover:bg-ivory/60">
        <p className="text-sm font-medium">{title}</p>
        {sub && <p className="meta">{sub}</p>}
      </Link>
    </li>
  );
}

/** Recherche globale : chaque résultat indique le dossier et le sous-dossier auxquels il appartient. */
export default function SearchPage() {
  useDocumentTitle('Recherche');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounce(q.trim(), 300);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['search', query], queryFn: () => api.get<Results>(`/search${qs({ q: query })}`), enabled: query.length >= 2 });
  const total = data ? Object.values(data).reduce((n, arr) => n + arr.length, 0) : 0;
  return (
    <div className="page max-w-3xl">
      <h1 className="page-title mb-4">Recherche</h1>
      <div className="relative mb-6">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus type="search" value={q} onChange={(e) => (setQ(e.target.value), setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }))} placeholder="Dossiers, documents, contenu des documents, notes, cartes…" aria-label="Rechercher" className="field h-12 pl-10 text-base" />
      </div>
      {query.length < 2 ? <p className="meta">Saisissez au moins deux caractères.</p> : error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <Loading /> : !total ? (
        <EmptyState icon={<Search size={22} />} title={`Aucun résultat pour « ${query} »`} description="Essayez un autre mot-clé ou vérifiez l’orthographe." />
      ) : (
        <div className="space-y-6">
          <Group title="Dossiers" icon={<GraduationCap size={15} />} count={data!.courses.length}>{data!.courses.map((c) => <Row key={c.id} to={`/courses/${c.id}`} title={c.title} sub={path(c.code, c.semester?.name)} />)}</Group>
          <Group title="Sous-dossiers" icon={<Folder size={15} />} count={data!.folders.length}>{data!.folders.map((f) => <Row key={f.id} to={`/folders/${f.id}`} title={f.name} sub={path(f.course.title, f.parent?.name)} />)}</Group>
          <Group title="Leçons" icon={<BookOpen size={15} />} count={data!.lessons.length}>{data!.lessons.map((l) => <Row key={l.id} to={`/lessons/${l.id}`} title={l.title} sub={path(l.course.title, l.folder?.name)} />)}</Group>
          <Group title="Documents" icon={<FileText size={15} />} count={data!.documents.length}>{data!.documents.map((d) => <Row key={d.id} to={`/documents/${d.id}`} title={d.fileName} sub={path(d.course?.title ?? 'Non classé', d.folder?.name)} />)}</Group>
          <Group title="Dans le contenu des documents" icon={<Quote size={15} />} count={data!.passages.length}>{data!.passages.map((p) => <Row key={p.id} to={`/documents/${p.document.id}`} title={`${p.document.fileName}${p.page ? ` — p. ${p.page}` : ''}`} sub={p.snippet} />)}</Group>
          <Group title="Notes" icon={<NotebookPen size={15} />} count={data!.notes.length}>{data!.notes.map((n) => <Row key={n.id} to={`/notes/${n.id}`} title={n.title} sub={path(n.course?.title, n.folder?.name, n.snippet)} />)}</Group>
          <Group title="Cartes mémoire" icon={<Layers size={15} />} count={data!.flashcards.length}>{data!.flashcards.map((f) => <Row key={f.id} to={`/revision/decks/${f.deck.id}`} title={f.question} sub={path(f.deck.course?.title, f.deck.title)} />)}</Group>
        </div>
      )}
    </div>
  );
}
