import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ClipboardPaste, Download, FileText, Image as ImageIcon, ScanLine, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, plural } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, PageHeader } from '../../components/ui/Misc';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';

interface KbPage {
  page: number | null;
  text: string;
  source: 'texte' | 'ocr' | 'vide' | null;
  aVerifier: string[];
  texteImages: string | null;
}
interface KbDocument {
  id: string;
  fileName: string;
  source: 'file' | 'scan' | 'text';
  method: string | null;
  pageCount: number | null;
  createdAt: string;
  warnings: string[];
  corrected: boolean;
  pages: KbPage[];
}
interface KbContent {
  courseId: string;
  title: string;
  characters: number;
  documents: KbDocument[];
  pending: { id: string; fileName: string; status: string }[];
}

const IMAGE_TEXT_HEADER = '[Texte lu dans une image — OCR, à vérifier]';
const SOURCE: Record<string, { label: string; icon: React.ReactNode }> = {
  file: { label: 'Fichier', icon: <FileText size={16} /> },
  scan: { label: 'Scan', icon: <ScanLine size={16} /> },
  text: { label: 'Texte collé', icon: <ClipboardPaste size={16} /> },
};

/** Texte d'une page : le texte lu dans une image est présenté à part, signalé « à vérifier ». */
function PageText({ p, query }: { p: KbPage; query: string }) {
  const [main, fromImages] = p.texteImages ? [p.text.split(IMAGE_TEXT_HEADER)[0].trim(), p.texteImages] : [p.text, null];
  const mark = (t: string) => {
    if (!query) return t;
    const parts = t.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((s, i) => (i % 2 ? <mark key={i} className="rounded bg-warning/25 px-0.5">{s}</mark> : s));
  };
  return (
    <div className="space-y-2">
      {p.page !== null && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <span className="font-semibold uppercase tracking-wide">Page {p.page}</span>
          {p.source === 'ocr' && <Badge tone="warning">OCR, à vérifier</Badge>}
        </div>
      )}
      <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{mark(main)}</p>
      {fromImages && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-warning"><ImageIcon size={14} /> Texte lu dans une image de la page (OCR, à vérifier)</p>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{mark(fromImages)}</p>
        </div>
      )}
      {p.aVerifier.length > 0 && <p className="text-[12.5px] text-warning">Nombres à vérifier (non retrouvés sur l’image de la page) : {p.aVerifier.join(', ')}</p>}
    </div>
  );
}

/**
 * Base de connaissances d'un dossier : le texte extrait de tous ses documents (fichiers, scans,
 * textes collés), réuni au même endroit. C'est le contenu utilisé par « Générer ».
 */
export default function KnowledgeBasePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState(false);
  const kb = useQuery({ queryKey: ['knowledge-base-content', id], queryFn: () => api.get<KbContent>(`/courses/${id}/knowledge-base/content`), enabled: !!id });
  useDocumentTitle(kb.data ? `Base de connaissances · ${kb.data.title}` : 'Base de connaissances');

  const q = query.trim();
  const docs = useMemo(
    () =>
      (kb.data?.documents ?? [])
        .map((d) => ({ ...d, pages: q ? d.pages.filter((p) => p.text.toLowerCase().includes(q.toLowerCase())) : d.pages }))
        .filter((d) => !q || d.pages.length),
    [kb.data, q],
  );

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/courses/${id}/knowledge-base/content?format=md`, { credentials: 'include', headers: { 'X-Requested-With': 'StudyMate' } });
      if (!res.ok) throw new Error('Téléchargement impossible.');
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'base-de-connaissances.md';
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e);
    } finally {
      setDownloading(false);
    }
  };

  if (kb.isLoading) return <Loading />;
  if (kb.error || !kb.data) return <div className="page"><ErrorState error={kb.error} onRetry={kb.refetch} /></div>;
  const data = kb.data;
  const toggle = (d: string) => setClosed((s) => (s.has(d) ? (s.delete(d), new Set(s)) : new Set(s).add(d)));

  return (
    <div className="page max-w-4xl">
      <Breadcrumbs items={[{ label: 'Mes dossiers', to: '/courses' }, { label: data.title, to: `/courses/${data.courseId}` }, { label: 'Base de connaissances' }]} />
      <PageHeader
        title="Base de connaissances"
        subtitle={`Texte extrait de tous les documents du dossier « ${data.title} » : fichiers, scans et textes collés. C’est sur ce contenu que s’appuient les QCM, flash-cards et fiches de révision.`}
        actions={<Button variant="secondary" icon={<Download size={16} />} loading={downloading} disabled={!data.documents.length} onClick={download}>Télécharger (.md)</Button>}
      />
      <p className="meta mb-4">
        {plural(data.documents.length, 'document')} · {data.characters.toLocaleString('fr-FR')} caractères
        {data.pending.length > 0 && ` · non inclus pour l’instant (analyse en cours ou en échec) : ${data.pending.map((p) => p.fileName).join(', ')}`}
      </p>

      {!data.documents.length ? (
        <EmptyState title="Base vide" description="Ajoutez des PDF, des scans ou du texte dans le dossier : leur texte apparaîtra ici une fois l’analyse terminée." action={<Link className="text-crimson hover:underline" to={`/courses/${data.courseId}`}>Retour au dossier</Link>} />
      ) : (
        <>
          <label className="relative mb-5 block max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input className="field pl-9" placeholder="Rechercher dans la base…" aria-label="Rechercher dans la base de connaissances" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {q && !docs.length && <p className="meta">Aucun passage ne contient « {q} ».</p>}
          <ol className="space-y-4">
            {docs.map((d, i) => {
              const open = !closed.has(d.id);
              const imagePages = d.pages.filter((p) => p.texteImages).length;
              const ocrPages = d.pages.filter((p) => p.source === 'ocr').length;
              return (
                <li key={d.id} className="card">
                  <button type="button" onClick={() => toggle(d.id)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                    <span className="mt-0.5 text-muted">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                    <span className="mt-0.5 text-crimson">{SOURCE[d.source]?.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i + 1}. {d.fileName}</span>
                      <span className="meta flex flex-wrap gap-x-2">
                        <span>{SOURCE[d.source]?.label ?? d.source}</span>
                        {d.pageCount ? <span>· {plural(d.pageCount, 'page')}</span> : null}
                        <span>· ajouté le {formatDate(d.createdAt)}</span>
                        {ocrPages > 0 && <span className="text-warning">· {plural(ocrPages, 'page lue', 'pages lues')} par OCR</span>}
                        {imagePages > 0 && <span className="text-warning">· texte d’image sur {plural(imagePages, 'page')}</span>}
                        {d.corrected && <span>· texte corrigé</span>}
                      </span>
                    </span>
                    <Link to={`/documents/${d.id}`} onClick={(e) => e.stopPropagation()} className="shrink-0 text-[13px] text-crimson hover:underline">Ouvrir</Link>
                  </button>
                  {open && (
                    <div className="space-y-5 border-t border-line px-4 py-4">
                      {d.pages.length ? d.pages.map((p, k) => <PageText key={k} p={p} query={q} />) : <p className="meta">Aucun texte lisible dans ce document.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
