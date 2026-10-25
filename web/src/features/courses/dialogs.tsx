import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { flattenFolders, useCourse } from './hooks';
import { PlacementPicker, type PlacementValue } from './PlacementPicker';

function useInvalidateCourse() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['course', 'folder', 'lesson', 'courses', 'documents', 'dashboard', 'search']) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function FolderFormDialog({ open, onClose, courseId, parentFolderId, folder }: { open: boolean; onClose: () => void; courseId: string; parentFolderId?: string | null; folder?: { id: string; name: string; description: string | null } }) {
  const toast = useToast();
  const invalidate = useInvalidateCourse();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) (setName(folder?.name ?? ''), setDescription(folder?.description ?? ''), setError(undefined));
  }, [open, folder]);
  const save = useMutation({
    mutationFn: () =>
      folder
        ? api.patch(`/folders/${folder.id}`, { name: name.trim(), description: description.trim() || null })
        : api.post(`/courses/${courseId}/folders`, { name: name.trim(), description: description.trim() || null, parentFolderId: parentFolderId ?? null }),
    onSuccess: () => (invalidate(), toast.show(folder ? 'Sous-dossier renommé.' : 'Sous-dossier créé.'), onClose()),
    onError: toast.error,
  });
  const submit = () => (name.trim() ? save.mutate() : setError('Le nom du sous-dossier est requis'));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={folder ? 'Renommer le sous-dossier' : 'Nouveau sous-dossier'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={save.isPending}>{folder ? 'Enregistrer' : 'Créer'}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Input label="Nom" placeholder="Ex. 02 - Limites et continuité" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
        <Textarea label="Description (facultatif)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>
    </Dialog>
  );
}

export function LessonFormDialog({ open, onClose, courseId, folderId }: { open: boolean; onClose: () => void; courseId: string; folderId?: string | null }) {
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateCourse();
  const course = useCourse(courseId);
  const folders = course.data ? flattenFolders(course.data.tree.folders) : [];
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(folderId ?? '');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) (setTitle(''), setTarget(folderId ?? ''), setMinutes(''), setError(undefined));
  }, [open, folderId]);
  const save = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/courses/${courseId}/lessons`, { title: title.trim(), folderId: target || null, estimatedMinutes: minutes ? Number(minutes) : null }),
    onSuccess: (l) => (invalidate(), toast.show('Leçon créée.'), onClose(), navigate(`/lessons/${l.id}?edit=1`)),
    onError: toast.error,
  });
  const submit = () => (title.trim() ? save.mutate() : setError('Le titre est requis'));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nouvelle leçon"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={save.isPending}>Créer la leçon</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Input label="Titre" placeholder="Ex. Leçon 1 - Notions fondamentales" value={title} onChange={(e) => setTitle(e.target.value)} error={error} autoFocus />
        <Select label="Sous-dossier" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Racine du dossier</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{'  '.repeat(f.depth)}{f.name}</option>
          ))}
        </Select>
        <Input label="Durée estimée (minutes, facultatif)" type="number" min={1} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </form>
    </Dialog>
  );
}

/** Déplacement accessible (alternative au glisser-déposer, utilisable au clavier et sur mobile). */
export function MoveDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: { kind: 'folder' | 'lesson'; id: string; name: string; courseId: string; currentFolderId: string | null } | { kind: 'document'; id: string; name: string; placement: PlacementValue } | null }) {
  const toast = useToast();
  const invalidate = useInvalidateCourse();
  const course = useCourse(item && item.kind !== 'document' ? item.courseId : undefined);
  const [target, setTarget] = useState('');
  const [placement, setPlacement] = useState<PlacementValue>({ courseId: null, folderId: null, lessonId: null });
  useEffect(() => {
    if (!item) return;
    if (item.kind === 'document') setPlacement(item.placement);
    else setTarget(item.currentFolderId ?? '');
  }, [item]);
  const folders = course.data ? flattenFolders(course.data.tree.folders) : [];
  // Un dossier ne peut pas être placé dans lui-même ou ses descendants.
  const excluded = new Set<string>();
  if (item?.kind === 'folder' && course.data) {
    const all = flattenFolders(course.data.tree.folders);
    const self = all.find((f) => f.id === item.id);
    if (self) all.filter((f) => f.path === self.path || f.path.startsWith(self.path + ' › ')).forEach((f) => excluded.add(f.id));
  }
  const save = useMutation({
    mutationFn: () => {
      if (!item) return Promise.resolve();
      if (item.kind === 'folder') return api.patch(`/folders/${item.id}`, { parentFolderId: target || null });
      if (item.kind === 'lesson') return api.patch(`/lessons/${item.id}`, { folderId: target || null });
      return api.patch(`/documents/${item.id}`, placement);
    },
    onSuccess: () => (invalidate(), toast.show('Élément déplacé.'), onClose()),
    onError: toast.error,
  });
  if (!item) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Déplacer « ${item.name} »`}
      size={item.kind === 'document' ? 'lg' : 'sm'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Déplacer</Button>
        </>
      }
    >
      {item.kind === 'document' ? (
        <PlacementPicker value={placement} onChange={setPlacement} />
      ) : (
        <Select label="Destination" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Racine du dossier</option>
          {folders.filter((f) => !excluded.has(f.id)).map((f) => (
            <option key={f.id} value={f.id}>{'  '.repeat(f.depth)}{f.name}</option>
          ))}
        </Select>
      )}
    </Dialog>
  );
}
