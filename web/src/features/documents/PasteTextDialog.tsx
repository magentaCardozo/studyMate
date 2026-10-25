import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import type { DocumentItem } from '../../types/api';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { PlacementPicker, type PlacementValue } from '../courses/PlacementPicker';

const MAX = 500_000;

/** Troisième mode d'ajout à la base de connaissances : texte copié-collé (notes, extrait de cours, transcription…). */
export function PasteTextDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<PlacementValue> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: initial?.courseId ?? null, folderId: initial?.folderId ?? null, lessonId: null });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = content.replace(/\s/g, '').length < 20;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const doc = await api.post<DocumentItem>('/documents/text', { title: title.trim() || `Texte du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, content, courseId: placement.courseId, folderId: placement.folderId });
      ['documents', 'course', 'folder', 'knowledge-base', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.show('Texte ajouté à la base de connaissances.');
      onClose();
      navigate(`/courses/${doc.courseId}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title="Coller du texte"
      description="Copiez-collez un extrait de cours, vos notes ou une transcription : il rejoint la base de connaissances du dossier."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} disabled={!placement.courseId || tooShort || content.length > MAX}>Ajouter à la base</Button>
        </>
      }
    >
      <div className="space-y-4">
        <PlacementPicker value={placement} onChange={setPlacement} />
        <Input label="Titre" placeholder="Ex. Cours du 12 octobre — Lois de probabilité" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label htmlFor="pasted-text" className="label">Texte</label>
          <textarea
            id="pasted-text"
            className="field min-h-[260px] font-mono text-[13.5px]"
            placeholder="Collez votre texte ici (Ctrl+V)…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className={`mt-1 text-xs ${content.length > MAX ? 'text-danger' : 'text-muted'}`}>
            {content.length.toLocaleString('fr-FR')} / {MAX.toLocaleString('fr-FR')} caractères
            {content && tooShort ? ' — texte trop court pour une base de connaissances' : ''}
          </p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}
