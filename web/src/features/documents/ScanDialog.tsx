import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Camera, Crop, RotateCw, Trash2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { Checkbox, Input } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { ProgressBar } from '../../components/ui/Misc';
import { useToast } from '../../components/ui/Toast';
import { uploadDocument } from '../../lib/upload';
import { errorMessage } from '../../lib/api';
import { PlacementPicker, type PlacementValue } from '../courses/PlacementPicker';

interface Page {
  id: string;
  url: string;
  rotation: 0 | 90 | 180 | 270;
  crop: { top: number; bottom: number; left: number; right: number };
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

/** Applique recadrage, rotation, réduction (≤ 2000 px) et amélioration optionnelle du contraste. */
async function renderPage(p: Page, enhance: boolean): Promise<Uint8Array> {
  const img = await loadImage(p.url);
  const sx = (img.width * p.crop.left) / 100, sy = (img.height * p.crop.top) / 100;
  const sw = img.width * (1 - (p.crop.left + p.crop.right) / 100), sh = img.height * (1 - (p.crop.top + p.crop.bottom) / 100);
  const scale = Math.min(1, 2000 / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const swap = p.rotation === 90 || p.rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((p.rotation * Math.PI) / 180);
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.35) brightness(1.08)';
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.82));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Numérisation multipage : photos de l'appareil → PDF (aperçu, rotation, recadrage,
 * réorganisation). L'OCR est réalisé côté serveur et le texte reste corrigible.
 */
export function ScanDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<PlacementValue> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [cropping, setCropping] = useState<string | null>(null);
  const [name, setName] = useState(`Scan du ${new Date().toLocaleDateString('fr-FR')}`);
  const [enhance, setEnhance] = useState(true);
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: initial?.courseId ?? null, folderId: initial?.folderId ?? null, lessonId: null });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (files: FileList) => {
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), rotation: 0 as const, crop: { top: 0, bottom: 0, left: 0, right: 0 } }));
    setPages((p) => [...p, ...next]);
  };
  const update = (id: string, patch: Partial<Page>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const move = (i: number, d: number) => setPages((ps) => {
    const a = [...ps];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    return a;
  });

  const close = () => {
    if (progress !== null) return;
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setError(null);
    onClose();
  };

  const save = async () => {
    setError(null);
    setProgress(0);
    try {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < pages.length; i++) {
        const bytes = await renderPage(pages[i], enhance);
        const img = await pdf.embedJpg(bytes);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        setProgress(Math.round(((i + 1) / pages.length) * 40));
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const fileName = `${name.trim() || 'Scan'}.pdf`;
      const doc = await uploadDocument(blob, fileName, placement, (p) => setProgress(40 + Math.round(p * 0.6)), 'scan');
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['course'] });
      toast.show('Scan enregistré — reconnaissance du texte en cours.');
      setProgress(null);
      close();
      navigate(`/documents/${doc.id}`);
    } catch (e) {
      setProgress(null);
      setError(errorMessage(e));
    }
  };

  const croppingPage = pages.find((p) => p.id === cropping);

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Scanner un document"
      description="Photographiez chaque page de vos notes ou polycopiés : le texte est reconnu (OCR), reste corrigible et rejoint la base de connaissances du dossier."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={progress !== null}>
            Annuler
          </Button>
          <Button onClick={save} disabled={!pages.length || !placement.courseId} loading={progress !== null}>
            Enregistrer {pages.length ? `(${pages.length} page${pages.length > 1 ? 's' : ''})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Button variant="secondary" icon={<Camera size={16} />} onClick={() => camera.current?.click()}>
          {pages.length ? 'Ajouter des pages' : 'Prendre une photo ou choisir des images'}
        </Button>
        <input ref={camera} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        {pages.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((p, i) => (
              <li key={p.id} className="card overflow-hidden">
                <div className="relative flex h-40 items-center justify-center overflow-hidden bg-ivory">
                  <img
                    src={p.url}
                    alt={`Page ${i + 1}`}
                    className="max-h-full max-w-full object-contain"
                    style={{ transform: `rotate(${p.rotation}deg)`, clipPath: `inset(${p.crop.top}% ${p.crop.right}% ${p.crop.bottom}% ${p.crop.left}%)` }}
                  />
                  <span className="absolute left-2 top-2 rounded bg-charcoal/80 px-1.5 text-xs text-white">{i + 1}</span>
                </div>
                <div className="flex items-center justify-between px-1 py-1">
                  <IconButton label="Pivoter" onClick={() => update(p.id, { rotation: (((p.rotation + 90) % 360) as Page['rotation']) })}>
                    <RotateCw size={16} />
                  </IconButton>
                  <IconButton label="Recadrer" onClick={() => setCropping(p.id)}>
                    <Crop size={16} />
                  </IconButton>
                  <IconButton label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton label="Descendre" disabled={i === pages.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={16} />
                  </IconButton>
                  <IconButton label="Supprimer la page" onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
        {croppingPage && (
          <div className="card space-y-3 p-4">
            <p className="text-sm font-medium">Recadrer la page {pages.indexOf(croppingPage) + 1}</p>
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <label key={side} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-muted">{{ top: 'Haut', bottom: 'Bas', left: 'Gauche', right: 'Droite' }[side]}</span>
                <input type="range" min={0} max={35} value={croppingPage.crop[side]} onChange={(e) => update(croppingPage.id, { crop: { ...croppingPage.crop, [side]: Number(e.target.value) } })} className="flex-1 accent-crimson" />
                <span className="w-10 text-right text-xs text-muted">{croppingPage.crop[side]} %</span>
              </label>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setCropping(null)}>
              Terminer le recadrage
            </Button>
          </div>
        )}
        {pages.length > 0 && (
          <>
            <Input label="Nom du document" value={name} onChange={(e) => setName(e.target.value)} />
            <Checkbox label="Améliorer la lisibilité" description="Niveaux de gris et contraste renforcé pour une meilleure reconnaissance du texte." checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
            <PlacementPicker value={placement} onChange={setPlacement} />
          </>
        )}
        {progress !== null && <ProgressBar value={progress} label="Enregistrement du scan" />}
      </div>
    </Dialog>
  );
}
