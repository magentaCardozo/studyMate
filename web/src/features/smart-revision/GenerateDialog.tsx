import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Layers, ListChecks, Timer } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { QUESTION_TYPE_LABEL } from '../../lib/format';
import type { AiStatus, Scope } from '../../types/api';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../hooks/useAuth';

/** 'quiz' est conservé comme alias de 'qcm' (liens existants). */
export type GenerateKind = 'qcm' | 'summary' | 'flashcards' | 'quiz' | 'mock';

export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatus>('/ai/status'), staleTime: 60_000 });

/** Bandeau d'information honnête sur le fournisseur d'IA réellement configuré. */
export function AiStatusNotice({ status, compact = false }: { status?: AiStatus; compact?: boolean }) {
  if (!status) return null;
  if (!status.configured) return <Notice tone="danger" title="IA indisponible">Aucun fournisseur d’IA n’est configuré sur ce serveur. Les fonctions de révision manuelles restent disponibles.</Notice>;
  // Version discrète pour les pages de consultation : l'information complète reste dans la fenêtre de génération.
  if (status.demoMode && compact)
    return (
      <p className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[12.5px] text-charcoal">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
        Mode démonstration : contenu extrait de vos documents, sans modèle de langage.
      </p>
    );
  if (status.demoMode)
    return (
      <Notice tone="warning" title="Mode démonstration">
        Aucun modèle de langage n’est connecté : le contenu est produit par extraction de phrases de vos documents, sans explications supplémentaires. Les sources restent citées.
      </Notice>
    );
  return null;
}

const KINDS: { id: GenerateKind; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'qcm', label: 'QCM', icon: <ListChecks size={17} />, hint: 'Questionnaire à choix multiple' },
  { id: 'summary', label: 'Fiches de révision', icon: <FileText size={17} />, hint: 'Notions, définitions, formules' },
  { id: 'flashcards', label: 'Flash-cards', icon: <Layers size={17} />, hint: 'Cartes mémoire, révision espacée' },
  { id: 'mock', label: 'Examen blanc', icon: <Timer size={17} />, hint: 'Minuté, corrigé après remise' },
];

const QCM_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

/**
 * kinds : types proposés (un sous-dossier n'offre que le sien) ;
 * onGenerated : rester sur la page appelante (sous-dossier) au lieu d'ouvrir le contenu généré.
 */
export function GenerateDialog({ open, onClose, scope, scopeLabel, initialKind = 'summary', kinds, onGenerated }: { open: boolean; onClose: () => void; scope: Scope; scopeLabel: string; initialKind?: GenerateKind; kinds?: GenerateKind[]; onGenerated?: (kind: GenerateKind, id: string) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { refresh } = useAuth();
  const status = useAiStatus();
  const [kind, setKind] = useState<GenerateKind>(initialKind === 'quiz' ? 'qcm' : initialKind);
  const [length, setLength] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [types, setTypes] = useState<string[]>(QCM_TYPES);
  const [mode, setMode] = useState<'practice' | 'exam'>('practice');
  const [timed, setTimed] = useState(false);
  const [duration, setDuration] = useState(30);
  const [topics, setTopics] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const consent = useMutation({
    mutationFn: () => api.post('/users/me/ai-consent', { granted: true }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['ai-status'] }), refresh(), setError(null)),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const isMock = kind === 'mock';
      if (kind === 'summary') return { path: `/revision/summaries/`, data: await api.post<{ id: string }>('/ai/summaries', { ...scope, length }) };
      if (kind === 'flashcards') return { path: `/revision/decks/`, data: await api.post<{ id: string }>('/ai/flashcards', { ...scope, count: Math.min(40, Math.max(3, count)) }) };
      return {
        path: `/revision/quizzes/`,
        data: await api.post<{ id: string }>('/ai/quizzes', {
          ...scope,
          count,
          difficulty,
          types,
          topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
          mode: isMock ? 'exam' : mode,
          timed: isMock ? true : timed,
          durationMinutes: isMock || timed ? duration : null,
          isMockExam: isMock,
        }),
      };
    },
    onSuccess: ({ path, data }) => {
      for (const k of ['summaries', 'decks', 'quizzes', 'lesson', 'ai-status', 'revision', 'revisions']) qc.invalidateQueries({ queryKey: [k] });
      toast.show('Contenu généré.');
      onClose();
      if (onGenerated) onGenerated(kind, data.id);
      else navigate(path + data.id);
    },
    onError: (e) => setError(e instanceof ApiError ? e : new ApiError(0, 'ERROR', 'Erreur inattendue.')),
  });

  const toggleType = (t: string) => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const s = status.data;
  const shownKinds = kinds ? KINDS.filter((k) => kinds.includes(k.id)) : KINDS;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={shownKinds.length === 1 ? `Générer : ${shownKinds[0].label}` : 'Exploiter la base de connaissances'}
      description={`Généré uniquement à partir des documents de : ${scopeLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generate.isPending}>Annuler</Button>
          <Button onClick={() => (setError(null), generate.mutate())} loading={generate.isPending} disabled={!s?.configured || s.requiresConsent || ((kind === 'qcm' || kind === 'mock') && !types.length)}>
            {generate.isPending ? 'Génération…' : 'Générer'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {shownKinds.length > 1 && (
        <div className={`grid grid-cols-2 gap-2 ${shownKinds.length > 2 ? 'sm:grid-cols-4' : ''}`} role="radiogroup" aria-label="Type de contenu">
          {shownKinds.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={`rounded-md border p-3 text-left transition-colors ${kind === k.id ? 'border-crimson bg-crimson-soft' : 'border-line hover:border-charcoal/30'}`}>
              <span className={kind === k.id ? 'text-crimson' : 'text-muted'}>{k.icon}</span>
              <p className="mt-1 text-sm font-medium">{k.label}</p>
              <p className="text-[11.5px] leading-tight text-muted">{k.hint}</p>
            </button>
          ))}
        </div>
        )}

        <AiStatusNotice status={s} />
        {s?.requiresConsent && (
          <Notice tone="info" title="Votre accord est nécessaire">
            <p>Pour générer ce contenu, le texte des documents sélectionnés sera envoyé au fournisseur d’IA ({s.provider}). Il n’est pas utilisé pour entraîner des modèles. Vous pouvez retirer votre accord à tout moment dans les paramètres.</p>
            <Button size="sm" className="mt-2" loading={consent.isPending} onClick={() => consent.mutate()}>J’accepte</Button>
          </Notice>
        )}

        {kind === 'summary' && (
          <Select label="Longueur" value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
            <option value="brief">Brève</option>
            <option value="standard">Standard</option>
            <option value="detailed">Détaillée</option>
          </Select>
        )}
        {kind === 'flashcards' && <Input label="Nombre de cartes (3 à 40)" type="number" min={3} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} />}
        {(kind === 'qcm' || kind === 'mock') && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre de questions" type="number" min={1} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} />
              <Select label="Difficulté" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="mixed">Variée</option>
                <option value="easy">Facile</option>
                <option value="medium">Moyenne</option>
                <option value="hard">Difficile</option>
              </Select>
            </div>
            <fieldset>
              <legend className="label">Types de questions {kind === 'qcm' && <span className="font-normal text-muted">— choix unique et choix multiples par défaut</span>}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(QUESTION_TYPE_LABEL).map(([id, label]) => (
                  <Checkbox key={id} label={label} checked={types.includes(id)} onChange={() => toggleType(id)} />
                ))}
              </div>
            </fieldset>
            <Input label="Thèmes à privilégier (facultatif, séparés par des virgules)" value={topics} onChange={(e) => setTopics(e.target.value)} />
            {kind === 'qcm' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} hint={mode === 'exam' ? 'Les réponses ne sont révélées qu’après la remise.' : 'Correction affichée après chaque question.'}>
                  <option value="practice">Entraînement</option>
                  <option value="exam">Examen</option>
                </Select>
                <div className="space-y-2 pt-1">
                  <Checkbox label="Minuté" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
                  {timed && <Input label="Durée (minutes)" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />}
                </div>
              </div>
            ) : (
              <>
                <Input label="Durée de l’examen blanc (minutes)" type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                <p className="text-xs text-muted">Examen d’entraînement généré à partir de vos sources — il ne s’agit pas d’un examen officiel de votre université.</p>
              </>
            )}
          </div>
        )}
        {error && (
          <Notice tone={error.code === 'INSUFFICIENT_CONTENT' ? 'warning' : 'danger'} title={error.code === 'INSUFFICIENT_CONTENT' ? 'Contenu insuffisant' : 'La génération a échoué'}>
            {error.message}
          </Notice>
        )}
        {s && <p className="text-xs text-muted">Utilisation aujourd’hui : {s.usedToday} / {s.dailyLimit} demandes.</p>}
      </div>
    </Dialog>
  );
}
