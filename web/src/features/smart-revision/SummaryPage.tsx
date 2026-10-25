import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Summary } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { ErrorState, Loading, Notice } from '../../components/ui/Feedback';
import { Breadcrumbs, PageHeader } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Markdown } from '../../components/ui/Markdown';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useUtils';
import { GeneratedBadge, ReportButton, Sources } from './shared';

const LENGTH: Record<string, string> = { brief: 'Bref', standard: 'Standard', detailed: 'Détaillé' };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-serif text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const { data: s, isLoading, error, refetch } = useQuery({ queryKey: ['summary', id], queryFn: () => api.get<Summary>(`/summaries/${id}`) });
  useDocumentTitle(s?.title ?? 'Résumé');
  if (isLoading) return <Loading />;
  if (error || !s) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;
  const c = s.content;

  return (
    <div className="page max-w-4xl">
      <Breadcrumbs items={[{ label: 'Révisions', to: '/revision' }, ...(s.course ? [{ label: s.course.title, to: `/courses/${s.course.id}` }] : []), { label: 'Résumé' }]} />
      <PageHeader
        eyebrow={<div className="flex flex-wrap items-center gap-2"><GeneratedBadge provider={s.provider} /><span className="meta">{LENGTH[s.length]} · {formatDate(s.createdAt)}</span></div>}
        title={c.mainTopic}
        subtitle={s.title}
        actions={<Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setDel(true)}>Supprimer</Button>}
      />
      <div className="space-y-4">
        {c.insufficientSource && <Notice tone="warning" title="Source insuffisante">Le contenu sélectionné ne permet pas un résumé complet. Les éléments ci-dessous sont limités à ce que contient le document.</Notice>}
        {c.limitations.length > 0 && (
          <Notice tone="info" title="À savoir">
            <ul className="list-disc pl-4">{c.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </Notice>
        )}
        {c.keyConcepts.length > 0 && (
          <Block title="Concepts clés">
            <ul className="space-y-3">{c.keyConcepts.map((k, i) => <li key={i}><p className="font-medium">{k.term}</p><Markdown className="prose-p:my-0.5">{k.explanation}</Markdown><Sources refs={k.sources} /></li>)}</ul>
          </Block>
        )}
        {c.definitions.length > 0 && (
          <Block title="Définitions">
            <dl className="space-y-3">{c.definitions.map((d, i) => <div key={i}><dt className="font-medium">{d.term}</dt><dd><Markdown className="prose-p:my-0.5">{d.definition}</Markdown><Sources refs={d.sources} /></dd></div>)}</dl>
          </Block>
        )}
        {c.formulas.length > 0 && (
          <Block title="Formules importantes">
            <ul className="space-y-3">{c.formulas.map((f, i) => <li key={i} className="rounded-md bg-ivory p-3"><Markdown>{/\$/.test(f.expression) ? f.expression : '`' + f.expression + '`'}</Markdown>{f.description && <p className="meta">{f.description}</p>}<Sources refs={f.sources} /></li>)}</ul>
          </Block>
        )}
        {c.explanations.length > 0 && (
          <Block title="Explications pas à pas">
            {c.explanations.map((e, i) => <div key={i} className="mb-4"><p className="font-medium">{e.title}</p><ol className="mt-1 list-decimal space-y-1 pl-5 text-[14.5px]">{e.steps.map((st, j) => <li key={j}><Markdown className="prose-p:my-0">{st}</Markdown></li>)}</ol><Sources refs={e.sources} /></div>)}
          </Block>
        )}
        {c.examples.length > 0 && (
          <Block title="Exemples">
            <ul className="space-y-3">{c.examples.map((e, i) => <li key={i}><p className="font-medium">{e.title}</p><Markdown className="prose-p:my-0.5">{e.content}</Markdown><Sources refs={e.sources} /></li>)}</ul>
          </Block>
        )}
        {c.commonMistakes.length > 0 && (
          <Block title="Erreurs fréquentes">
            <ul className="space-y-3">{c.commonMistakes.map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle size={16} className="mt-1 shrink-0 text-warning" /><div><Markdown className="prose-p:my-0">{m.mistake}</Markdown><p className="text-sm text-muted">{m.correction}</p><Sources refs={m.sources} /></div></li>)}</ul>
          </Block>
        )}
        {c.recap && <Block title="En résumé"><Markdown>{c.recap}</Markdown></Block>}
        {c.selfAssessment.length > 0 && (
          <Block title="Questions d’auto-évaluation">
            <ol className="list-decimal space-y-1.5 pl-5 text-[14.5px]">{c.selfAssessment.map((q, i) => <li key={i}>{q}</li>)}</ol>
          </Block>
        )}
        {c.additionalExplanations.length > 0 && (
          <section className="rounded-lg border border-dashed border-warning/50 bg-warning-soft/40 p-5">
            <h2 className="font-serif text-lg font-semibold">Explications complémentaires de l’IA</h2>
            <p className="mb-3 text-[13px] text-muted">Ces éléments ne figurent pas dans vos documents : ils ont été ajoutés par l’IA et ne constituent pas un contenu de l’enseignant.</p>
            {c.additionalExplanations.map((a, i) => <div key={i} className="mb-3"><p className="font-medium">{a.title}</p><Markdown>{a.content}</Markdown></div>)}
          </section>
        )}
        {s.sources.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Sources utilisées</h2>
            <Sources refs={s.sources} compact />
          </section>
        )}
        <div className="flex items-center justify-between border-t border-line pt-4">
          {s.lesson ? <Link to={`/lessons/${s.lesson.id}`} className="text-sm text-crimson hover:underline">← Retour à la leçon</Link> : <span />}
          <ReportButton targetType="summary" targetId={s.id} />
        </div>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Supprimer ce résumé ?" message="Le résumé généré sera supprimé. Vos documents ne sont pas affectés." onConfirm={async () => { await api.del(`/summaries/${s.id}`); qc.invalidateQueries({ queryKey: ['summaries'] }); toast.show('Résumé supprimé.'); navigate('/revision'); }} />
    </div>
  );
}
