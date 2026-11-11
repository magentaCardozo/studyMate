import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, MessageCircle, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { relativeDay } from '../../lib/format';
import type { ChatMessage, Scope } from '../../types/api';
import { Button, IconButton } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { ErrorState, Loading, Notice, Spinner } from '../../components/ui/Feedback';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useAllCourses } from '../courses/hooks';
import { AiStatusNotice, useAiStatus } from '../smart-revision/GenerateDialog';
import { ReportButton, Sources } from '../smart-revision/shared';

interface Thread {
  id: string;
  title: string;
  context: Scope;
  updatedAt: string;
  messages?: ChatMessage[];
}

const SUGGESTIONS = ['Explique-moi ce concept plus simplement', 'Donne-moi un autre exemple', 'Teste ma compréhension avec 3 questions', 'Aide-moi à préparer mon examen', 'Crée un plan de révision pour les 7 prochains jours'];

function Bubble({ m }: { m: ChatMessage }) {
  const meta = Array.isArray(m.citations) ? {} : m.citations;
  if (m.role === 'user') return <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-charcoal px-4 py-2.5 text-[15px] text-white">{m.content}</div>;
  return (
    <div className="max-w-[92%]">
      <div className="card rounded-bl-sm px-4 py-3">
        <Markdown>{m.content}</Markdown>
        {meta.refs && meta.refs.length > 0 && <div className="mt-2 border-t border-line pt-2"><p className="mb-1 text-xs text-muted">Sources :</p><Sources refs={meta.refs} compact /></div>}
        {meta.generalKnowledgeUsed && <p className="mt-2 text-xs text-muted">Cette réponse contient des explications générales qui ne proviennent pas de vos documents.</p>}
        {meta.uncertainty && <p className="mt-1 text-xs text-warning">Incertitude : {meta.uncertainty}</p>}
      </div>
      <div className="mt-1 flex items-center gap-3 px-1">
        {!m.grounded && meta.refs?.length === 0 && <span className="text-[11.5px] text-muted">Non fondé sur vos sources</span>}
        {m.provider && <ReportButton targetType="chat_message" targetId={m.id} />}
      </div>
      {meta.followUpQuestion && <p className="mt-1 px-1 text-sm text-crimson">→ {meta.followUpQuestion}</p>}
    </div>
  );
}

export default function ChatPage() {
  useDocumentTitle('Tuteur IA');
  const { threadId } = useParams<{ threadId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useAiStatus();
  const courses = useAllCourses();
  const threads = useQuery({ queryKey: ['threads'], queryFn: () => api.get<Thread[]>('/ai/threads') });
  const thread = useQuery({ queryKey: ['thread', threadId], queryFn: () => api.get<Thread>(`/ai/threads/${threadId}`), enabled: !!threadId });
  const [scope, setScope] = useState<Scope>(() => ({
    lessonId: params.get('lessonId') ?? undefined,
    documentIds: params.get('documentId') ? [params.get('documentId')!] : undefined,
    courseId: params.get('courseId') ?? undefined,
  }));
  const [input, setInput] = useState('');
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const preset = !!(params.get('lessonId') || params.get('documentId'));

  const ask = useMutation({
    mutationFn: (question: string) => api.post<{ threadId: string }>('/ai/ask', { question, threadId, context: threadId ? undefined : scope }),
    onMutate: (q) => setOptimistic(q),
    onSuccess: (r) => {
      setOptimistic(null);
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['thread', r.threadId] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      if (r.threadId !== threadId) navigate(`/coach/chat/${r.threadId}`, { replace: true });
    },
    onError: (e) => (setOptimistic(null), toast.error(e)),
  });
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [thread.data, optimistic]);

  const send = (text = input) => {
    if (!text.trim() || ask.isPending) return;
    setInput('');
    ask.mutate(text.trim());
  };
  const ctx = threadId ? thread.data?.context : scope;
  const ctxLabel = ctx?.lessonId ? 'Leçon sélectionnée' : ctx?.documentIds?.length ? 'Document sélectionné' : ctx?.folderId ? 'Sous-dossier sélectionné' : ctx?.courseId ? `Dossier : ${courses.data?.find((c) => c.id === ctx.courseId)?.title ?? '…'}` : 'Question générale';

  return (
    <div className="mx-auto flex h-[calc(100vh-56px-64px)] max-w-content gap-6 px-4 py-4 md:h-[calc(100vh-64px)] md:px-8">
      <aside className="hidden w-64 shrink-0 flex-col md:flex">
        <Button icon={<Plus size={16} />} onClick={() => navigate('/coach/chat')}>Nouvelle conversation</Button>
        <ul className="mt-4 flex-1 space-y-1 overflow-y-auto">
          {threads.data?.map((t) => (
            <li key={t.id} className="group flex items-center">
              <Link to={`/coach/chat/${t.id}`} className={`min-w-0 flex-1 rounded-md px-3 py-2 text-sm ${t.id === threadId ? 'bg-crimson-soft text-crimson-dark' : 'hover:bg-white'}`}>
                <p className="truncate font-medium">{t.title}</p>
                <p className="text-xs text-muted">{relativeDay(t.updatedAt)}</p>
              </Link>
              <IconButton label="Supprimer la conversation" className="opacity-0 group-hover:opacity-100" onClick={async () => { await api.del(`/ai/threads/${t.id}`); qc.invalidateQueries({ queryKey: ['threads'] }); if (t.id === threadId) navigate('/coach/chat'); }}><Trash2 size={14} /></IconButton>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-xl font-medium">Tuteur IA</h1>
          <span className="chip"><BookOpen size={12} /> {ctxLabel}</span>
          {!threadId && !preset && (
            <Select aria-label="Contexte" className="h-9 w-auto text-sm" value={scope.courseId ?? ''} onChange={(e) => setScope({ courseId: e.target.value || undefined })}>
              <option value="">Question générale</option>
              {courses.data?.map((c) => <option key={c.id} value={c.id}>Dossier : {c.title}</option>)}
            </Select>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto pb-4" aria-live="polite">
          <AiStatusNotice status={status.data} />
          {status.data?.requiresConsent && <Notice>Autorisez le traitement par le fournisseur d’IA dans <Link to="/settings#privacy" className="text-crimson underline">Paramètres › Confidentialité</Link> pour utiliser le tuteur.</Notice>}
          {threadId && thread.isLoading && <Loading />}
          {thread.error && <ErrorState error={thread.error} />}
          {!threadId && !optimistic && (
            <div className="py-6 text-center">
              <MessageCircle size={28} className="mx-auto text-crimson" />
              <p className="mt-2 font-serif text-lg font-medium">Posez votre question</p>
              <p className="meta mx-auto max-w-md">Le tuteur s’appuie en priorité sur vos documents et cite ses sources. Il vous guide pas à pas plutôt que de donner directement la réponse.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="chip hover:border-crimson hover:text-crimson">{s}</button>)}
              </div>
            </div>
          )}
          {thread.data?.messages?.map((m) => <Bubble key={m.id} m={m} />)}
          {optimistic && (
            <>
              <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-charcoal px-4 py-2.5 text-[15px] text-white">{optimistic}</div>
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner size={16} /> Recherche dans vos sources…</div>
            </>
          )}
          <div ref={end} />
        </div>
        <form className="flex items-end gap-2 border-t border-line pt-3" onSubmit={(e) => (e.preventDefault(), send())}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} rows={2} placeholder="Votre question…" aria-label="Votre question" className="field flex-1 resize-none" />
          <Button type="submit" loading={ask.isPending} disabled={!input.trim() || !status.data?.configured || status.data.requiresConsent} aria-label="Envoyer" icon={<Send size={16} />} />
        </form>
        <p className="mt-1 text-[11.5px] text-muted">Le tuteur peut se tromper : vérifiez les informations importantes dans vos sources.</p>
      </section>
    </div>
  );
}
