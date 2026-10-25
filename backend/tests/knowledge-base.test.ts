import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { api, app, createUser, uploadText } from './helpers';
import { drainJobs } from '../src/services/jobs';

const PASTED = `Statistique descriptive

La moyenne est la somme des valeurs divisée par le nombre de valeurs.
La médiane est la valeur qui partage une série ordonnée en deux parties égales.
Le mode est la valeur la plus fréquente d'une série.
L'écart-type est la racine carrée de la variance.
La variance est la moyenne des carrés des écarts à la moyenne.
Par exemple, la moyenne de 2, 4 et 6 est 4.`;

describe('base de connaissances par dossier', () => {
  it("exige un dossier pour tout import (fichier, scan, texte collé)", async () => {
    const u = await createUser();
    const noFolder = await api.post(u, '/documents/upload-url', { fileName: 'cours.pdf', mimeType: 'application/pdf', fileSize: 100 });
    expect(noFolder.status).toBe(400);
    expect(noFolder.body.error.code).toBe('FOLDER_REQUIRED');
    const noFolderText = await api.post(u, '/documents/text', { title: 'Notes', content: PASTED });
    expect(noFolderText.body.error.code).toBe('FOLDER_REQUIRED');
  });

  it('constitue la base à partir de texte collé et de fichiers, puis génère un QCM et des fiches', async () => {
    const u = await createUser();
    const folder = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    const empty = (await api.get(u, `/courses/${folder.id}/knowledge-base`)).body.data;
    expect(empty).toMatchObject({ documents: 0, canGenerate: false });

    const pasted = await api.post(u, '/documents/text', { title: 'Cours du 12 octobre', content: PASTED, courseId: folder.id });
    expect(pasted.status).toBe(201);
    expect(pasted.body.data).toMatchObject({ source: 'text', mimeType: 'text/plain', courseId: folder.id, processingStatus: 'QUEUED' });
    await uploadText(u, { courseId: folder.id, fileName: 'chapitre2.md' });
    await drainJobs();

    const kb = (await api.get(u, `/courses/${folder.id}/knowledge-base`)).body.data;
    expect(kb).toMatchObject({ documents: 2, ready: 2, bySource: { text: 1, file: 1, scan: 0 }, canGenerate: true });
    expect(kb.characters).toBeGreaterThan(200);

    // Le texte collé est consultable comme n'importe quel document.
    const text = (await api.get(u, `/documents/${pasted.body.data.id}/text`)).body.data;
    expect(text.pages[0].text).toContain('La médiane est la valeur');

    // QCM (choix unique + choix multiples) à partir de toute la base du dossier.
    const qcm = await api.post(u, '/ai/quizzes', { courseId: folder.id, count: 4, types: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'] });
    expect(qcm.status).toBe(201);
    const quiz = (await api.get(u, `/quizzes/${qcm.body.data.id}?withAnswers=true`)).body.data;
    expect(quiz.questions.every((q: { questionType: string }) => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.questionType))).toBe(true);
    const sourceDocs = new Set(quiz.questions.map((q: { sourceReference: { documentId: string } }) => q.sourceReference?.documentId));
    expect(sourceDocs.size).toBeGreaterThan(0);

    // Fiche de révision (résumé structuré) et cartes mémoire.
    expect((await api.post(u, '/ai/summaries', { courseId: folder.id, length: 'standard' })).status).toBe(201);
    expect((await api.post(u, '/ai/flashcards', { courseId: folder.id, count: 5 })).status).toBe(201);
  });

  it('refuse un texte collé trop court et la base d’un autre étudiant', async () => {
    const u = await createUser();
    const other = await createUser();
    const folder = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    expect((await api.post(u, '/documents/text', { title: 'Vide', content: 'trop court', courseId: folder.id })).body.error.code).toBe('TEXT_TOO_SHORT');
    expect((await api.post(other, '/documents/text', { title: 'Intrus', content: PASTED, courseId: folder.id })).status).toBe(404);
    expect((await api.get(other, `/courses/${folder.id}/knowledge-base`)).status).toBe(404);
  });

  it('un document ne peut pas contenir de document et n’est plus rattaché à une leçon', async () => {
    const u = await createUser();
    const folder = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    const doc = (await api.post(u, '/documents/text', { title: 'Notes', content: PASTED, courseId: folder.id })).body.data;
    // Un identifiant de document n'est pas un emplacement valide.
    expect((await api.post(u, '/documents/text', { title: 'Imbriqué', content: PASTED, folderId: doc.id })).status).toBe(404);
    const lesson = (await api.post(u, `/courses/${folder.id}/lessons`, { title: 'Leçon' })).body.data;
    expect((await api.get(u, `/lessons/${lesson.id}`)).body.data).not.toHaveProperty('documents');
    // Suppression du dossier : ses documents sont supprimés avec lui.
    await request(app).delete(`/api/v1/courses/${folder.id}`).set('Authorization', `Bearer ${u.token}`).expect(204);
    expect((await api.get(u, `/documents/${doc.id}`)).status).toBe(404);
  });
});
