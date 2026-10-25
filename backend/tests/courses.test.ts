import { describe, expect, it } from 'vitest';
import { api, createUser, uploadText } from './helpers';
import { drainJobs } from '../src/services/jobs';

describe('organisation des cours', () => {
  it('années, semestres, matières : création, filtres, archivage', async () => {
    const u = await createUser();
    const year = await api.post(u, '/academic-years', { name: '2025-2026', semesters: ['S1', 'S2'] });
    expect(year.status).toBe(201);
    const s1 = year.body.data.semesters.find((s: { name: string }) => s.name === 'S1');
    await api.post(u, '/courses', { title: 'Algèbre linéaire', semesterId: s1.id, code: 'MATH-120' }).expect(201);
    await api.post(u, '/courses', { title: 'Bases de données' }).expect(201);
    const filtered = await api.get(u, `/courses?semesterId=${s1.id}`);
    expect(filtered.body.data.map((c: { title: string }) => c.title)).toEqual(['Algèbre linéaire']);
    const alpha = await api.get(u, '/courses?sort=alpha');
    expect(alpha.body.data[0].title).toBe('Algèbre linéaire');
    expect(alpha.body.meta.total).toBe(2);
    // Progression absente tant qu'il n'y a aucune donnée réelle.
    expect(alpha.body.data[0].stats.progress).toBeNull();
    const id = alpha.body.data[1].id;
    await api.patch(u, `/courses/${id}`, { archived: true }).expect(200);
    expect((await api.get(u, '/courses')).body.data).toHaveLength(1);
    expect((await api.get(u, '/courses?archived=true')).body.data).toHaveLength(1);
  });

  it('dossiers imbriqués, arborescence générée depuis la base, prévention des cycles', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Analyse' })).body.data;
    const f1 = (await api.post(u, `/courses/${course.id}/folders`, { name: '01 - Introduction' })).body.data;
    const f2 = (await api.post(u, `/courses/${course.id}/folders`, { name: '02 - Limites' })).body.data;
    const sub = (await api.post(u, `/courses/${course.id}/folders`, { name: 'Exercices', parentFolderId: f2.id })).body.data;
    await api.post(u, `/courses/${course.id}/lessons`, { title: 'Leçon 1 - Limites', folderId: f2.id }).expect(201);
    await api.post(u, `/courses/${course.id}/lessons`, { title: 'Leçon racine' }).expect(201);

    const detail = await api.get(u, `/courses/${course.id}`);
    const tree = detail.body.data.tree;
    expect(tree.folders.map((f: { name: string }) => f.name)).toEqual(['01 - Introduction', '02 - Limites']);
    const limits = tree.folders[1];
    expect(limits.children[0].name).toBe('Exercices');
    expect(limits.lessons[0].title).toBe('Leçon 1 - Limites');
    expect(tree.lessons[0].title).toBe('Leçon racine');

    // Un dossier ne peut pas être déplacé dans son propre sous-dossier.
    const cycle = await api.patch(u, `/folders/${f2.id}`, { parentFolderId: sub.id });
    expect(cycle.status).toBe(400);
    // Déplacement valide + réordonnancement.
    await api.patch(u, `/folders/${sub.id}`, { parentFolderId: f1.id }).expect(200);
    await api.post(u, `/courses/${course.id}/folders/reorder`, { folderIds: [f2.id, f1.id] }).expect(204);
    const after = (await api.get(u, `/courses/${course.id}/tree`)).body.data;
    expect(after.folders[0].name).toBe('02 - Limites');
    expect(after.folders[1].children[0].name).toBe('Exercices');

    const folder = await api.get(u, `/folders/${sub.id}`);
    expect(folder.body.data.breadcrumb.map((b: { name: string }) => b.name)).toEqual(['01 - Introduction', 'Exercices']);
    const dup = await api.post(u, `/folders/${f1.id}/duplicate`);
    expect(dup.body.data.name).toBe('01 - Introduction (copie)');
  });

  it('déplacer une leçon et un document vers un autre sous-dossier', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Programmation Python' })).body.data;
    const a = (await api.post(u, `/courses/${course.id}/folders`, { name: 'A' })).body.data;
    const b = (await api.post(u, `/courses/${course.id}/folders`, { name: 'B' })).body.data;
    const lesson = (await api.post(u, `/courses/${course.id}/lessons`, { title: 'Boucles', folderId: a.id })).body.data;
    await api.patch(u, `/lessons/${lesson.id}`, { folderId: b.id }).expect(200);
    expect((await api.get(u, `/folders/${b.id}`)).body.data.lessons[0].id).toBe(lesson.id);

    const doc = await uploadText(u, { courseId: course.id, folderId: a.id, fileName: 'notes-amphi.txt', text: 'Une boucle for parcourt une séquence. Une liste est une collection ordonnée.' });
    const moved = await api.patch(u, `/documents/${doc.id}`, { folderId: b.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ courseId: course.id, folderId: b.id });
    // Retour à la racine du dossier : le document reste dans le dossier.
    const root = await api.patch(u, `/documents/${doc.id}`, { folderId: null });
    expect(root.body.data).toMatchObject({ courseId: course.id, folderId: null });
    // Un document ne peut pas être sorti de tout dossier.
    const other = (await api.post(u, '/courses', { title: 'Autre dossier' })).body.data;
    expect((await api.patch(u, `/documents/${doc.id}`, { courseId: other.id })).body.data.courseId).toBe(other.id);
    await drainJobs();
  });

  it('leçons : contenu, objectifs, achèvement réel', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Épidémiologie' })).body.data;
    const l = (await api.post(u, `/courses/${course.id}/lessons`, { title: 'Mesures de fréquence', learningObjectives: ['Calculer une incidence'], definitions: [{ title: 'Incidence', body: 'Nouveaux cas sur une période.' }] })).body.data;
    expect(l.status).toBe('NOT_STARTED');
    const done = await api.post(u, `/lessons/${l.id}/complete`, { completed: true });
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.completedAt).toBeTruthy();
    const list = await api.get(u, '/courses');
    expect(list.body.data[0].stats).toMatchObject({ lessons: 1, completedLessons: 1, progress: 100 });
  });

  it('notes : création, autosauvegarde, détection de conflit', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Microéconomie' })).body.data;
    const note = (await api.post(u, '/notes', { title: 'Offre et demande', content: '## Loi de la demande', courseId: course.id })).body.data;
    const base = note.updatedAt;
    const saved = await api.patch(u, `/notes/${note.id}`, { content: '## Loi de la demande\n- prix ↑ → quantité ↓', baseUpdatedAt: base });
    expect(saved.status).toBe(200);
    // Seconde modification à partir de l'ancienne version : conflit signalé.
    const stale = await api.patch(u, `/notes/${note.id}`, { content: 'autre appareil', baseUpdatedAt: base });
    expect(stale.status).toBe(409);
    expect((await api.get(u, `/notes?courseId=${course.id}&q=quantité`)).body.data).toHaveLength(1);
  });

  it('recherche globale avec matière et dossier parents', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Probabilités et statistiques' })).body.data;
    const f = (await api.post(u, `/courses/${course.id}/folders`, { name: 'Variables aléatoires' })).body.data;
    await api.post(u, `/courses/${course.id}/lessons`, { title: 'Loi binomiale', folderId: f.id }).expect(201);
    const r = await api.get(u, '/search?q=binomiale');
    expect(r.body.data.lessons[0]).toMatchObject({ title: 'Loi binomiale', course: { title: 'Probabilités et statistiques' }, folder: { name: 'Variables aléatoires' } });
  });
});
