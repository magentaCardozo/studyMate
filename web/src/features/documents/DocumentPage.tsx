import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderInput, MessageCircleQuestion, NotebookPen, Pencil, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fileKind, formatSize, relativeDay, STATUS_LABEL } from '../../lib/format';
import { openDocument } from '../../lib/upload';
import type { DocumentDetail } from '../../types/api';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ErrorState, Loading, Notice, Spinner } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, DemoBadge, PageHeader, Tabs } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { MoveDialog } from '../courses/dialogs';
import { GenerateDialog } from '../smart-revision/GenerateDialog';
import { useDocumentActions } from './DocumentRow';

interface Extraction {
  method: string;
  pageCount: number | null;
  pages: { page: number | null; text: string }[];
  warnings: string[];
  corrected?: boolean;
}

const METHOD_LABEL: Record<string, string> = { 'pdf-text': 'Texte du PDF', 'pdf-ocr': 'Reconnaissance optique (OCR)', 'image-ocr': 'Reconnaissance optique (OCR)', docx: 'Document Word', text: 'Texte brut', manual: 'Saisie manuelle' };

function Viewer({ doc }: { doc: DocumentDetail }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const previewable = doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/');
  useEffect(() => {
    if (!previewable || doc.processingStatus === 'PENDING_UPLOAD') return;
    let alive = true;
    openDocument(doc.id, true).then((u) => alive && setUrl(u)).catch((e) => alive && setErr(e));
    return () => {
      alive = false;
    };
  }, [doc.id, doc.processingStatus, previewable]);
  if (!previewable) return <Notice>Les documents {fileKind(doc.mimeType)} ne peuvent pas être affichés tels quels dans le navigateur : consultez l’onglet « Texte extrait » ou téléchargez le fichier.</Notice>;
  if (err) return <ErrorState error={err} title="Aperçu indisponible" />;
  if (!url) return <Loading label="Préparation de l’aperçu…" />;
  if (doc.mimeType.startsWith('image/')) return <img src={url} alt={doc.fileName} className="mx-auto max-h-[80vh] rounded-md border border-line bg-white" />;
  // Visionneuse PDF du navigateur : navigation par page, zoom et recherche (Ctrl+F) pour les PDF contenant du texte.
  return <iframe title={`Aperçu de ${doc.fileName}`} src={url} className="h-[78vh] w-full rounded-md border border-line bg-white" />;
}

function ExtractedText({ doc }: { doc: DocumentDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const text = useQuery({ queryKey: ['document-text', doc.id, doc.updatedAt], queryFn: () => api.get<Extraction>(`/documents/${doc.id}/text`), enabled: doc.processingStatus === 'READY', retry: false });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ page: number | null; text: string }[]>([]);
  const [find, setFind] = useState('');
  const save = useMutation({
    mutationFn: () => api.put(`/documents/${doc.id}/text`, { pages: draft }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['document-text', doc.id] }), qc.invalidateQueries({ queryKey: ['document', doc.id] }), setEditing(false), toast.show('Texte corrigé — la recherche et les révisions utiliseront cette version.')),
    onError: toast.error,
  });
  const matches = useMemo(() => {
    if (!find.trim() || !text.data) return null;
    const q = find.toLowerCase();
    return text.data.pages.filter((p) => p.text.toLowerCase().includes(q)).map((p) => p.page);
  }, [find, text.data]);

  if (doc.processingStatus !== 'READY') return <Notice>Le texte sera disponible à la fin de l’analyse.</Notice>;
  if (text.isLoading) return <Loading />;
  if (text.error) return <ErrorState error={text.error} />;
  const ex = text.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="chip">{METHOD_LABEL[ex.method] ?? ex.method}{ex.corrected ? ' · corrigé' : ''}</span>
        {!editing && (
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Rechercher dans le texte" aria-label="Rechercher dans le texte" className="field h-9 pl-9 text-sm" />
          </div>
        )}
        {matches && <span className="meta">{matches.length ? `Trouvé ${matches.some((m) => m !== null) ? `page(s) ${matches.filter(Boolean).join(', ')}` : 'dans le texte'}` : 'Aucune occurrence'}</span>}
        <div className="ml-auto">
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Annuler</Button>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Enregistrer les corrections</Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => (setDraft(ex.pages.map((p) => ({ ...p }))), setEditing(true))}>Corriger le texte</Button>
          )}
        </div>
      </div>
      {ex.warnings.length > 0 && <Notice tone="warning" title="Extraction partielle">{ex.warnings.join(' ')}</Notice>}
      {(editing ? draft : ex.pages).map((p, i) => (
        <section key={i} className="card p-4" aria-label={p.page ? `Page ${p.page}` : 'Texte'}>
          {p.page && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Page {p.page}</p>}
          {editing ? (
            <textarea className="field min-h-[220px] font-mono text-[13px]" value={draft[i].text} aria-label={p.page ? `Texte de la page ${p.page}` : 'Texte'} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, text: e.target.value } : d)))} />
          ) : p.text.trim() ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed">{highlight(p.text, find)}</pre>
          ) : (
            <p className="meta italic">Aucun texte reconnu sur cette page.</p>
          )}
        </section>
      ))}
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) => (part.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-warning-soft px-0.5">{part}</mark> : part));
}

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const actions = useDocumentActions();
  const { data: doc, isLoading, error, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
    // Suivi de l'état du traitement tant qu'il n'est pas terminé.
    refetchInterval: (q) => (['QUEUED', 'PROCESSING', 'UPLOADED'].includes(q.state.data?.processingStatus ?? '') ? 2500 : false),
  });
  useDocumentTitle(doc?.fileName ?? 'Document');
  const [tab, setTab] = useState<'preview' | 'text' | 'notes'>('preview');
  const [move, setMove] = useState(false);
  const [del, setDel] = useState(false);
  const [generate, setGenerate] = useState(false);
  const reprocess = useMutation({ mutationFn: () => api.post(`/documents/${id}/reprocess`), onSuccess: () => (refetch(), toast.show('Nouvelle analyse lancée.')), onError: toast.error });

  useEffect(() => {
    if (doc && !['application/pdf'].includes(doc.mimeType) && !doc.mimeType.startsWith('image/')) setTab('text');
  }, [doc?.mimeType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Loading />;
  if (error || !doc) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const processing = ['QUEUED', 'PROCESSING', 'UPLOADED'].includes(doc.processingStatus);

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: 'Mes dossiers', to: '/courses' },
          ...(doc.course ? [{ label: doc.course.title, to: `/courses/${doc.course.id}` }] : []),
          ...doc.breadcrumb.map((b) => ({ label: b.name, to: `/folders/${b.id}` })),
          { label: doc.fileName },
        ]}
      />
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {fileKind(doc.mimeType)} · {formatSize(doc.fileSize)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''} · Importé {relativeDay(doc.createdAt).toLowerCase()}
            {doc.isDemo && <DemoBadge />}
            {doc.processingStatus === 'READY' ? <Badge tone="success">Prêt</Badge> : <Badge tone={doc.processingStatus === 'FAILED' ? 'danger' : 'warning'}>{processing && <Spinner size={11} />} {STATUS_LABEL[doc.processingStatus]}</Badge>}
          </div>
        }
        title={<span className="break-all">{doc.fileName}</span>}
        actions={
          <>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => actions.download(doc.id)}>Télécharger</Button>
            <Button icon={<Sparkles size={16} />} disabled={doc.processingStatus !== 'READY'} onClick={() => setGenerate(true)}>Réviser ce document</Button>
          </>
        }
      />

      {doc.processingStatus === 'FAILED' && (
        <div className="mb-5">
          <Notice tone="danger" title="L’analyse du document a échoué">
            {doc.processingError} <Button size="sm" variant="secondary" className="ml-2 mt-2" icon={<RefreshCw size={14} />} loading={reprocess.isPending} onClick={() => reprocess.mutate()}>Relancer l’analyse</Button>
          </Notice>
        </div>
      )}
      {doc.processingStatus === 'READY' && doc.processingError && <div className="mb-5"><Notice tone="warning">{doc.processingError}</Notice></div>}
      {processing && <div className="mb-5"><Notice>Analyse en cours : extraction du texte{doc.mimeType.startsWith('image/') ? ' par reconnaissance optique (OCR)' : ''}. Vous pouvez quitter cette page, une notification vous préviendra.</Notice></div>}

      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<FolderInput size={15} />} onClick={() => setMove(true)}>Déplacer</Button>
        <ButtonLink size="sm" variant="secondary" icon={<NotebookPen size={15} />} to={`/notes/new?documentId=${doc.id}&courseId=${doc.courseId}`}>Note liée</ButtonLink>
        <ButtonLink size="sm" variant="secondary" icon={<MessageCircleQuestion size={15} />} to={`/coach/chat?documentId=${doc.id}`}>Poser une question</ButtonLink>
        {doc.processingStatus === 'READY' && <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} loading={reprocess.isPending} onClick={() => reprocess.mutate()}>Relancer l’OCR</Button>}
        <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} className="text-danger" onClick={() => setDel(true)}>Supprimer</Button>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'preview', label: 'Aperçu' }, { id: 'text', label: 'Texte extrait' }, { id: 'notes', label: 'Notes', count: doc.notes.length }]} />
      {tab === 'preview' && <Viewer doc={doc} />}
      {tab === 'text' && <ExtractedText doc={doc} />}
      {tab === 'notes' && (doc.notes.length ? (
        <ul className="card divide-y divide-line">{doc.notes.map((n) => <li key={n.id}><Link to={`/notes/${n.id}`} className="flex justify-between px-4 py-3 text-sm hover:bg-ivory/60"><span className="font-medium">{n.title}</span><span className="meta">{relativeDay(n.updatedAt)}</span></Link></li>)}</ul>
      ) : <p className="meta">Aucune note liée à ce document.</p>)}

      <p className="mt-8 text-xs text-muted">Sur le web, téléchargez le fichier pour le lire hors connexion. L’application Android permet de rendre des documents disponibles hors ligne.</p>

      <MoveDialog open={move} onClose={() => setMove(false)} item={move ? { kind: 'document', id: doc.id, name: doc.fileName, placement: { courseId: doc.courseId, folderId: doc.folderId, lessonId: null } } : null} />
      {generate && <GenerateDialog open onClose={() => setGenerate(false)} scope={{ documentIds: [doc.id] }} scopeLabel={`Document « ${doc.fileName} »`} />}
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title="Supprimer le document ?"
        message={`« ${doc.fileName} » et son texte extrait seront définitivement supprimés.`}
        onConfirm={async () => {
          try {
            await api.del(`/documents/${doc.id}`);
            actions.invalidate();
            toast.show('Document supprimé.');
            navigate(`/courses/${doc.courseId}`);
          } catch (e) {
            toast.error(e instanceof ApiError ? e : new Error());
          }
        }}
      />
    </div>
  );
}
