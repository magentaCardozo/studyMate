import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { api, app, createUser, uploadText } from './helpers';
import { drainJobs } from '../src/services/jobs';

describe("contrôle d'accès entre étudiants", () => {
  it("un étudiant ne peut ni lire, ni modifier, ni supprimer les ressources d'un autre", async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const course = (await api.post(alice, '/courses', { title: 'Cours privé' })).body.data;
    const folder = (await api.post(alice, `/courses/${course.id}/folders`, { name: 'Dossier' })).body.data;
    const lesson = (await api.post(alice, `/courses/${course.id}/lessons`, { title: 'Leçon', content: 'x'.repeat(200) })).body.data;
    const note = (await api.post(alice, '/notes', { title: 'Note', courseId: course.id })).body.data;
    const doc = await uploadText(alice, { courseId: course.id });
    await drainJobs();
    const deck = (await api.post(alice, '/flashcards/decks', { title: 'Paquet', courseId: course.id, cards: [{ question: 'Q ?', answer: 'R' }] })).body.data;

    const reads = [`/courses/${course.id}`, `/folders/${folder.id}`, `/lessons/${lesson.id}`, `/notes/${note.id}`, `/documents/${doc.id}`, `/documents/${doc.id}/text`, `/flashcards/decks/${deck.id}`, `/progress/courses/${course.id}`];
    for (const path of reads) {
      const r = await api.get(bob, path);
      expect(r.status, path).toBe(404);
    }
    expect((await api.patch(bob, `/courses/${course.id}`, { title: 'piraté' })).status).toBe(404);
    expect((await api.del(bob, `/lessons/${lesson.id}`)).status).toBe(404);
    expect((await api.post(bob, `/documents/${doc.id}/download-url`, {})).status).toBe(404);
    // Bob ne peut pas créer de contenu dans la matière d'Alice ni y déplacer ses propres ressources.
    expect((await api.post(bob, `/courses/${course.id}/folders`, { name: 'intrus' })).status).toBe(404);
    const bobNote = (await api.post(bob, '/notes', { title: 'Note de Bob' })).body.data;
    expect((await api.patch(bob, `/notes/${bobNote.id}`, { courseId: course.id })).status).toBe(404);
    // L'IA ne peut pas utiliser les documents d'Alice pour Bob.
    expect((await api.post(bob, '/ai/summaries', { documentIds: [doc.id] })).status).toBe(404);
    expect((await api.post(bob, '/ai/ask', { question: 'contenu ?', context: { courseId: course.id } })).status).toBe(404);
    // Les listes de Bob ne contiennent rien d'Alice.
    expect((await api.get(bob, '/courses')).body.data).toHaveLength(0);
    expect((await api.get(bob, '/search?q=Cours')).body.data.courses).toHaveLength(0);
    // Et la ressource d'Alice est intacte.
    expect((await api.get(alice, `/courses/${course.id}`)).body.data.title).toBe('Cours privé');
  });

  it('un jeton de fichier est lié à son document, expire et ne sert pas à importer', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Dossier' })).body.data;
    const doc = await uploadText(u, { courseId: course.id, text: 'Contenu du cours privé assez long pour être traité correctement.' });
    const link = await api.post(u, `/documents/${doc.id}/download-url`, {});
    expect(link.status).toBe(200);
    const file = await request(app).get(link.body.data.url);
    expect(file.status).toBe(200);
    expect(file.headers['cache-control']).toContain('no-store');
    expect((await request(app).get('/api/v1/files/jeton-invalide')).status).toBe(403);
    // Un jeton de téléchargement ne permet pas d'écraser le fichier.
    const token = link.body.data.url.split('/').pop();
    expect((await request(app).put(`/api/v1/uploads/${token}`).send(Buffer.from('x'))).status).toBe(403);
    await drainJobs();
  });

  it('rejette un fichier dont le contenu ne correspond pas au type déclaré', async () => {
    const u = await createUser();
    const fake = Buffer.from('<script>alert(1)</script>');
    const course = (await api.post(u, '/courses', { title: 'Dossier' })).body.data;
    const res = await api.post(u, '/documents/upload-url', { fileName: 'cours.pdf', mimeType: 'application/pdf', fileSize: fake.length, courseId: course.id });
    expect(res.status).toBe(201);
    const put = await request(app).put(res.body.data.upload.url).set('Content-Type', 'application/pdf').send(fake);
    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe('CONTENT_MISMATCH');
    expect((await api.post(u, '/documents/upload-url', { fileName: 'setup.exe', mimeType: 'application/octet-stream', fileSize: 10, courseId: course.id })).body.error.code).toBe('UNSUPPORTED_TYPE');
    expect((await api.post(u, '/documents/upload-url', { fileName: 'gros.pdf', mimeType: 'application/pdf', fileSize: 500 * 1024 * 1024, courseId: course.id })).status).toBe(413);
  });

  it('valide les identifiants et les corps de requête', async () => {
    const u = await createUser();
    const r = await api.get(u, '/courses/pas-un-uuid');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    const r2 = await api.post(u, '/courses', { title: '' });
    expect(r2.body.error.details[0].field).toBe('body.title');
  });
});
