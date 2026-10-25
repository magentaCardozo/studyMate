import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Feedback';
import { ProgressBar } from '../../components/ui/Misc';
import { useToast } from '../../components/ui/Toast';
import { ACCEPT, MAX_MB, uploadDocument, validateFile } from '../../lib/upload';
import { errorMessage } from '../../lib/api';
import { formatSize } from '../../lib/format';
import { PlacementPicker, type PlacementValue } from '../courses/PlacementPicker';

interface Item {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function ImportDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<PlacementValue> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: initial?.courseId ?? null, folderId: initial?.folderId ?? null, lessonId: null });
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const add = (files: FileList | File[]) => {
    const errs: string[] = [];
    const ok: Item[] = [];
    for (const f of Array.from(files)) {
      const e = validateFile(f);
      if (e) errs.push(e);
      else ok.push({ file: f, progress: 0, status: 'pending' });
    }
    setErrors(errs);
    setItems((prev) => [...prev, ...ok]);
  };

  const start = async () => {
    setBusy(true);
    let success = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;
      const update = (patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
      update({ status: 'uploading', progress: 0, error: undefined });
      try {
        await uploadDocument(items[i].file, items[i].file.name, placement, (p) => update({ progress: p }));
        update({ status: 'done', progress: 100 });
        success++;
      } catch (e) {
        update({ status: 'error', error: errorMessage(e) });
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['course'] });
    qc.invalidateQueries({ queryKey: ['folder'] });
    qc.invalidateQueries({ queryKey: ['lesson'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (success) toast.show(`${success} document${success > 1 ? 's importés' : ' importé'} — analyse en cours.`);
  };

  const close = () => {
    if (busy) return;
    setItems([]);
    setErrors([]);
    onClose();
  };
  const allDone = items.length > 0 && items.every((i) => i.status === 'done');

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Importer un PDF"
      description={`Ajoutez des fichiers à la base de connaissances d’un dossier. PDF (Word et texte acceptés) — ${MAX_MB} Mo maximum par fichier.`}
      footer={
        allDone ? (
          <Button onClick={close}>Terminer</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={start} loading={busy} disabled={!items.length || !placement.courseId}>
              Importer {items.length ? `(${items.length})` : ''}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <PlacementPicker value={placement} onChange={setPlacement} />
        <div
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? 'border-crimson bg-crimson-soft' : 'border-line bg-ivory/60'}`}
        >
          <FileUp className="mb-2 text-crimson" size={28} aria-hidden />
          <p className="text-sm">Glissez vos fichiers ici ou</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => input.current?.click()}>
            Parcourir…
          </Button>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
        </div>
        {errors.map((e) => (
          <Notice key={e} tone="danger">
            {e}
          </Notice>
        ))}
        {items.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.file.name}</p>
                  <p className="meta">{formatSize(it.file.size)}</p>
                  {it.status === 'uploading' && <ProgressBar value={it.progress} label={`Envoi de ${it.file.name}`} />}
                  {it.error && <p className="text-xs text-danger">{it.error}</p>}
                </div>
                {it.status === 'done' ? (
                  <CheckCircle2 size={18} className="text-success" aria-label="Importé" />
                ) : (
                  !busy && (
                    <button type="button" aria-label={`Retirer ${it.file.name}`} onClick={() => setItems((p) => p.filter((_, j) => j !== i))} className="text-muted hover:text-charcoal">
                      <X size={16} />
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Les fichiers sont stockés de façon privée. Leur texte est extrait automatiquement (OCR pour les PDF numérisés) et rejoint la base de connaissances du dossier.</p>
      </div>
    </Dialog>
  );
}
