import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bold, Check, CloudOff, Eye, Heading2, Italic, Link2, List, ListOrdered, Loader2, Pencil, Sigma, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { relativeDay } from '../../lib/format';
import type { Note } from '../../types/api';
import { Button, IconButton } from '../../components/ui/Button';
import { ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Badge, Breadcrumbs, Segmented } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { PlacementPicker, type PlacementValue } from '../courses/PlacementPicker';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/** Éditeur de notes Markdown : barre de mise en forme, aperçu (maths KaTeX), sauvegarde automatique. */
export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = !id;
  const existing = useQuery({ queryKey: ['note', id], queryFn: () => api.get<Note>(`/notes/${id}`), enabled: !isNew });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: params.get('courseId'), folderId: params.get('folderId'), lessonId: params.get('lessonId') });
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [state, setState] = useState<SaveState>('idle');
  const [del, setDel] = useState(false);
  const base = useRef<string | null>(null);
  const dirty = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useDocumentTitle(title || 'Note');

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setContent(existing.data.content);
      setPlacement({ courseId: existing.data.courseId, folderId: existing.data.folderId, lessonId: existing.data.lessonId });
      base.current = existing.data.updatedAt;
    }
  }, [existing.data]);

  const save = useCallback(async () => {
    if (!dirty.current || isNew) return;
    dirty.current = false;
    setState('saving');
    try {
      const n = await api.patch<Note>(`/notes/${id}`, { title: title.trim() || 'Note sans titre', content, baseUpdatedAt: base.current });
      base.current = n.updatedAt;
      qc.setQueryData(['note', id], n);
      setState('saved');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 409 ? 'conflict' : 'error');
    }
  }, [id, isNew, title, content, qc]);

  // Sauvegarde automatique 1,2 s après la dernière frappe.
  useEffect(() => {
    if (isNew || !dirty.current) return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [title, content, save, isNew]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const create = async () => {
    setState('saving');
    try {
      const n = await api.post<Note>('/notes', { title: title.trim() || 'Note sans titre', content, ...placement, documentId: params.get('documentId') });
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: ['lesson'] });
      toast.show('Note créée.');
      navigate(`/notes/${n.id}`, { replace: true });
    } catch (e) {
      setState('error');
      toast.error(e);
    }
  };

  const edit = (v: string) => {
    dirty.current = true;
    setContent(v);
  };
  const wrap = (before: string, after = before, placeholder = 'texte') => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = content.slice(s, e) || placeholder;
    edit(content.slice(0, s) + before + selected + after + content.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };
  const prefixLines = (prefix: (i: number) => string) => {
    const el = area.current;
    if (!el) return;
    const start = content.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const end = el.selectionEnd;
    const block = content.slice(start, end).split('\n').map((l, i) => prefix(i) + l).join('\n');
    edit(content.slice(0, start) + block + content.slice(end));
  };

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <div className="page"><ErrorState error={existing.error} onRetry={existing.refetch} /></div>;
  const n = existing.data;

  const status = {
    idle: n ? <span className="meta">Modifiée {relativeDay(n.updatedAt).toLowerCase()}</span> : null,
    saving: <span className="meta inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> Enregistrement…</span>,
    saved: <span className="inline-flex items-center gap-1 text-[13px] text-success"><Check size={13} /> Enregistré</span>,
    error: <span className="inline-flex items-center gap-1 text-[13px] text-danger"><CloudOff size={13} /> Non enregistré — <button type="button" className="underline" onClick={() => ((dirty.current = true), save())}>réessayer</button></span>,
    conflict: null,
  }[state];

  return (
    <div className="page max-w-4xl">
      <Breadcrumbs items={[...(n?.course ? [{ label: n.course.title, to: `/courses/${n.course.id}` }] : []), ...(n?.lesson ? [{ label: n.lesson.title, to: `/lessons/${n.lesson.id}` }] : []), { label: isNew ? 'Nouvelle note' : title || 'Note' }]} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Note personnelle</Badge>
          {n?.document && <span className="meta">Liée à « {n.document.fileName} »</span>}
        </div>
        <div className="flex items-center gap-3" aria-live="polite">{status}</div>
      </div>
      {state === 'conflict' && (
        <div className="mb-4">
          <Notice tone="warning" title="Cette note a été modifiée sur un autre appareil">
            Vos dernières modifications n’ont pas été enregistrées pour éviter d’écraser l’autre version.{' '}
            <button type="button" className="font-medium underline" onClick={() => window.location.reload()}>Recharger la version la plus récente</button>{' '}
            (copiez d’abord votre texte si nécessaire).
          </Notice>
        </div>
      )}
      <input
        value={title}
        onChange={(e) => ((dirty.current = true), setTitle(e.target.value))}
        placeholder="Titre de la note"
        aria-label="Titre de la note"
        className="mb-4 w-full border-0 bg-transparent font-serif text-[28px] font-medium placeholder:text-muted/50 focus:outline-none focus:ring-0 md:text-[32px]"
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5" role="toolbar" aria-label="Mise en forme">
          <IconButton label="Titre" onClick={() => prefixLines(() => '## ')}><Heading2 size={16} /></IconButton>
          <IconButton label="Gras" onClick={() => wrap('**')}><Bold size={16} /></IconButton>
          <IconButton label="Italique" onClick={() => wrap('_')}><Italic size={16} /></IconButton>
          <IconButton label="Liste à puces" onClick={() => prefixLines(() => '- ')}><List size={16} /></IconButton>
          <IconButton label="Liste numérotée" onClick={() => prefixLines((i) => `${i + 1}. `)}><ListOrdered size={16} /></IconButton>
          <IconButton label="Lien" onClick={() => wrap('[', '](https://)', 'lien')}><Link2 size={16} /></IconButton>
          <IconButton label="Expression mathématique" onClick={() => wrap('$', '$', 'x^2')}><Sigma size={16} /></IconButton>
          <div className="ml-auto">
            <Segmented label="Mode" value={mode} onChange={setMode} options={[{ id: 'write', label: 'Écrire', icon: <Pencil size={14} /> }, { id: 'preview', label: 'Aperçu', icon: <Eye size={14} /> }]} />
          </div>
        </div>
        {mode === 'write' ? (
          <textarea
            ref={area}
            value={content}
            onChange={(e) => edit(e.target.value)}
            onBlur={save}
            placeholder="Écrivez vos notes… (Markdown, maths entre $…$)"
            aria-label="Contenu de la note"
            className="min-h-[50vh] w-full resize-y border-0 p-4 font-mono text-[14px] leading-relaxed focus:outline-none focus:ring-0"
          />
        ) : (
          <div className="min-h-[50vh] p-5">{content.trim() ? <Markdown>{content}</Markdown> : <p className="meta">Rien à afficher.</p>}</div>
        )}
      </div>
      {isNew ? (
        <div className="mt-5 space-y-4">
          <PlacementPicker value={placement} onChange={setPlacement} withLesson optionalCourse />
          <div className="flex justify-end">
            <Button onClick={create} loading={state === 'saving'}>Créer la note</Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex justify-end">
          <Button variant="ghost" className="text-danger" icon={<Trash2 size={15} />} onClick={() => setDel(true)}>Supprimer la note</Button>
        </div>
      )}
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title="Supprimer la note ?"
        message="Cette note sera définitivement supprimée."
        onConfirm={async () => {
          await api.del(`/notes/${id}`);
          dirty.current = false;
          qc.invalidateQueries({ queryKey: ['notes'] });
          qc.invalidateQueries({ queryKey: ['lesson'] });
          toast.show('Note supprimée.');
          navigate(n?.lessonId ? `/lessons/${n.lessonId}` : n?.courseId ? `/courses/${n.courseId}` : '/');
        }}
      />
    </div>
  );
}
