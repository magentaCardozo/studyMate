import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Course } from '../../types/api';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { COURSE_COLORS, useYears } from './hooks';

const schema = z.object({
  title: z.string().trim().min(1, 'Le nom du dossier est requis').max(160),
  code: z.string().trim().max(40).optional(),
  faculty: z.string().trim().max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  semesterId: z.string().optional(),
  color: z.string(),
  importance: z.coerce.number().min(1).max(5),
  confidence: z.coerce.number().min(0).max(5),
});
type Values = z.infer<typeof schema>;

export function CourseFormDialog({ open, onClose, course }: { open: boolean; onClose: () => void; course?: Course }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const years = useYears();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open)
      reset({
        title: course?.title ?? '',
        code: course?.code ?? '',
        faculty: course?.faculty ?? '',
        description: course?.description ?? '',
        semesterId: course?.semester?.id ?? years.data?.[0]?.semesters[0]?.id ?? '',
        color: course?.color ?? COURSE_COLORS[0],
        importance: course?.importance ?? 3,
        confidence: course?.confidence ?? 0,
      });
  }, [open, course, reset, years.data]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = { ...v, code: v.code || null, faculty: v.faculty || null, description: v.description || null, semesterId: v.semesterId || null, confidence: v.confidence || null };
      return course ? api.patch<Course>(`/courses/${course.id}`, body) : api.post<Course>('/courses', body);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['course', c.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show(course ? 'Dossier mis à jour.' : 'Dossier créé : ajoutez maintenant vos documents.');
      onClose();
      if (!course) navigate(`/courses/${c.id}`);
    },
    onError: toast.error,
  });
  const color = watch('color');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={course ? 'Modifier le dossier' : 'Nouveau dossier'}
      description={course ? undefined : 'Un dossier rassemble les documents (PDF, scans, textes collés) qui forment la base de connaissances d’un cours.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
            {course ? 'Enregistrer' : 'Créer le dossier'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Input label="Nom du dossier" placeholder="Ex. Statistique" autoFocus {...register('title')} error={formState.errors.title?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Code (facultatif)" placeholder="MATH-101" {...register('code')} />
          <Select label="Semestre (facultatif)" {...register('semesterId')}>
            <option value="">Sans semestre</option>
            {years.data?.map((y) => (
              <optgroup key={y.id} label={y.name}>
                {y.semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {y.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <Input label="Faculté ou programme (facultatif)" placeholder="Faculté des Sciences" {...register('faculty')} />
        <Textarea label="Description (facultatif)" rows={3} {...register('description')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Importance pour vos examens" {...register('importance')} hint="Utilisée par le planificateur.">
            <option value={1}>1 — faible</option>
            <option value={2}>2</option>
            <option value={3}>3 — normale</option>
            <option value={4}>4</option>
            <option value={5}>5 — très élevée</option>
          </Select>
          <Select label="Votre niveau de confiance" {...register('confidence')}>
            <option value={0}>Non renseigné</option>
            <option value={1}>1 — je me sens perdu</option>
            <option value={2}>2</option>
            <option value={3}>3 — moyen</option>
            <option value={4}>4</option>
            <option value={5}>5 — très à l’aise</option>
          </Select>
        </div>
        <fieldset>
          <legend className="label">Couleur</legend>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={color === c} onClick={() => setValue('color', c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-charcoal' : 'border-white'} shadow-card`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
