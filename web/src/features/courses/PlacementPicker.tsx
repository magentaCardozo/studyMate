import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { api } from '../../lib/api';
import { allLessons, flattenFolders, useAllCourses, useCourse } from './hooks';

export interface PlacementValue {
  courseId: string | null;
  folderId: string | null;
  lessonId: string | null;
}

/**
 * Choix de l'emplacement : dossier (obligatoire) → sous-dossier (facultatif),
 * et, pour les notes et cartes uniquement, leçon. Les documents ne se rattachent
 * jamais à une leçon ni à un autre document.
 */
export function PlacementPicker({ value, onChange, withLesson = false, optionalCourse = false }: { value: PlacementValue; onChange: (v: PlacementValue) => void; withLesson?: boolean; optionalCourse?: boolean }) {
  const qc = useQueryClient();
  const courses = useAllCourses();
  const course = useCourse(value.courseId ?? undefined);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const folders = course.data ? flattenFolders(course.data.tree.folders) : [];
  const lessons = course.data ? allLessons(course.data.tree) : [];

  const create = async () => {
    if (!name.trim()) return;
    const c = await api.post<{ id: string }>('/courses', { title: name.trim() });
    await qc.invalidateQueries({ queryKey: ['courses'] });
    setCreating(false);
    setName('');
    onChange({ courseId: c.id, folderId: null, lessonId: null });
  };

  if (courses.data && courses.data.length === 0 && !optionalCourse && !creating) {
    return (
      <Notice tone="warning" title="Créez d’abord un dossier">
        Chaque document appartient à un dossier (par exemple « Statistique ») qui constitue sa base de connaissances.
        <button type="button" className="ml-1 font-medium text-crimson underline" onClick={() => setCreating(true)}>Créer un dossier</button>
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${withLesson ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div>
          <Select label="Dossier" value={value.courseId ?? ''} onChange={(e) => onChange({ courseId: e.target.value || null, folderId: null, lessonId: null })}>
            <option value="">{optionalCourse ? 'Aucun dossier' : 'Choisir un dossier…'}</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-crimson hover:underline">
              <Plus size={12} /> Nouveau dossier
            </button>
          )}
        </div>
        <Select label="Sous-dossier (facultatif)" value={value.folderId ?? ''} disabled={!value.courseId} onChange={(e) => onChange({ ...value, folderId: e.target.value || null, lessonId: null })}>
          <option value="">Racine du dossier</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{'  '.repeat(f.depth)}{f.name}</option>)}
        </Select>
        {withLesson && (
          <Select label="Leçon (facultatif)" value={value.lessonId ?? ''} disabled={!value.courseId} onChange={(e) => onChange({ ...value, lessonId: e.target.value || null })}>
            <option value="">Aucune leçon</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.folderPath ? `${l.folderPath} › ` : ''}{l.title}</option>)}
          </Select>
        )}
      </div>
      {creating && (
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), create())}>
          <input autoFocus className="field" placeholder="Nom du dossier, ex. Statistique" aria-label="Nom du nouveau dossier" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()} className="h-10 shrink-0 rounded-md bg-crimson px-4 text-sm font-medium text-white disabled:opacity-50">Créer</button>
          <button type="button" onClick={() => setCreating(false)} className="h-10 shrink-0 rounded-md px-3 text-sm text-muted hover:bg-charcoal/5">Annuler</button>
        </form>
      )}
    </div>
  );
}
