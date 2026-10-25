import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, createUser } from './helpers';
import { prisma } from '../src/services/prisma';

describe('coach : examens, programme, progression', () => {
  it("génère un aperçu, l'accepte, puis réorganise après des sessions manquées sans dépasser la disponibilité", async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Bases de données', confidence: 2 })).body.data;
    for (const t of ['Modèle relationnel', 'SQL', 'Normalisation']) await api.post(u, `/courses/${course.id}/lessons`, { title: t });
    expect((await api.post(u, '/study-plans/generate', {})).body.error.code).toBe('NO_PLAN_TARGET');

    const examDate = new Date(Date.now() + 8 * 86400_000);
    await api.post(u, '/goals', { title: 'Examen de BD', courseId: course.id, targetDate: examDate.toISOString() }).expect(201);
    await api.patch(u, '/users/me/settings', { availability: { mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 90, sun: 90 }, preferredSessionMinutes: 45 }).expect(200);

    const preview = await api.post(u, '/study-plans/generate', { preview: true });
    expect(preview.body.data.preview).toBe(true);
    expect(preview.body.data.sessions.length).toBeGreaterThan(0);
    expect((await api.get(u, '/study-sessions')).body.data).toHaveLength(0); // rien d'enregistré

    const accepted = await api.post(u, '/study-plans/generate', { preview: false });
    expect(accepted.status).toBe(201);
    const sessions = accepted.body.data.sessions;
    expect(sessions[0].reason).toMatch(/Recommandé/);
    expect(sessions.every((s: { scheduledStart: string }) => new Date(s.scheduledStart) < examDate)).toBe(true);

    // Simule deux sessions passées non faites → « manquées », puis replanification.
    await prisma.studySession.create({ data: { userId: u.id, courseId: course.id, scheduledStart: new Date(Date.now() - 5 * 3600_000), scheduledEnd: new Date(Date.now() - 4 * 3600_000), activityType: 'lesson', origin: 'plan' } });
    const replan = await api.post(u, '/study-plans/generate', { preview: false });
    expect(replan.body.data.summary.missedSessions).toBe(1);
    const all = (await api.get(u, '/study-sessions?status=PLANNED')).body.data as { scheduledStart: string }[];
    const perDay = new Map<string, number>();
    for (const s of all) perDay.set(s.scheduledStart.slice(0, 10), (perDay.get(s.scheduledStart.slice(0, 10)) ?? 0) + 45);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(90);

    // Replanifier, terminer, passer.
    const first = (await api.get(u, '/study-sessions?status=PLANNED')).body.data[0];
    const moved = await api.patch(u, `/study-sessions/${first.id}`, { scheduledStart: new Date(Date.now() + 3 * 86400_000).toISOString() });
    expect(moved.body.data.origin).toBe('manual');
    const done = await api.patch(u, `/study-sessions/${first.id}`, { status: 'COMPLETED' });
    expect(done.body.data.completedAt).toBeTruthy();

    const cal = await api.get(u, `/calendar?from=${new Date(Date.now() - 86400_000).toISOString()}&to=${new Date(Date.now() + 20 * 86400_000).toISOString()}`);
    expect(cal.body.data.exams).toHaveLength(1);
    expect(cal.body.data.sessions.length).toBeGreaterThan(0);
  });

  it('progression calculée uniquement à partir des activités enregistrées', async () => {
    const u = await createUser();
    const empty = (await api.get(u, '/progress/overview')).body.data;
    expect(empty.quizzes.averageLast30Days).toBeNull();
    expect(empty.lessons).toEqual({ total: 0, completed: 0 });
    const course = (await api.post(u, '/courses', { title: 'Microéconomie' })).body.data;
    const quiz = (await api.post(u, '/quizzes', { title: 'Quiz manuel', courseId: course.id, questions: [{ type: 'TRUE_FALSE', question: 'La demande baisse quand le prix monte.', correctAnswer: true, topic: 'Demande' }, { type: 'SINGLE_CHOICE', question: 'Élasticité-prix ?', options: ['ΔQ/ΔP', 'ΔP/ΔQ'], correctAnswer: 0, topic: 'Élasticité' }] })).body.data;
    const att = (await api.post(u, `/quizzes/${quiz.id}/attempts`, {})).body.data;
    const qs = (await api.get(u, `/quiz-attempts/${att.id}`)).body.data.questions;
    await api.post(u, `/quiz-attempts/${att.id}/responses`, { questionId: qs[0].id, response: true });
    await api.post(u, `/quiz-attempts/${att.id}/responses`, { questionId: qs[1].id, response: 1 });
    await api.post(u, `/quiz-attempts/${att.id}/submit`);
    const ov = (await api.get(u, '/progress/overview')).body.data;
    expect(ov.quizzes).toEqual({ attemptsLast30Days: 1, averageLast30Days: 50 });
    const pc = (await api.get(u, `/progress/courses/${course.id}`)).body.data;
    expect(pc.frequentlyMissed).toEqual([{ topic: 'Élasticité', count: 1 }]);
    expect(pc.quizTrend[0].percentage).toBe(50);
    const history = (await api.get(u, '/progress/history?days=7')).body.data;
    expect(history.reduce((n: number, d: { quizzes: number }) => n + d.quizzes, 0)).toBe(1);
    const dash = (await api.get(u, '/dashboard')).body.data;
    expect(dash.firstName).toBe('Étudiant');
    expect(dash.recommendations.some((r: { type: string }) => r.type === 'quiz')).toBe(true);
  });
});

describe('synchronisation hors ligne', () => {
  it('opérations idempotentes, conflit de note sans perte, suppressions propagées', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Algèbre linéaire' })).body.data;
    const noteId = randomUUID();
    const createOp = { opId: randomUUID(), entity: 'note', action: 'create', id: noteId, data: { title: 'Hors ligne', content: 'écrit dans le bus', courseId: course.id } };
    const r1 = await api.post(u, '/sync/push', { operations: [createOp] });
    expect(r1.body.data.results[0].status).toBe('applied');
    const r2 = await api.post(u, '/sync/push', { operations: [createOp] });
    expect(r2.body.data.results[0].status).toBe('duplicate');

    const note = (await api.get(u, `/notes/${noteId}`)).body.data;
    // Modification depuis le web…
    await api.patch(u, `/notes/${noteId}`, { content: 'modifiée sur le web' });
    // …puis modification hors ligne basée sur l'ancienne version.
    const conflict = await api.post(u, '/sync/push', { operations: [{ opId: randomUUID(), entity: 'note', action: 'update', id: noteId, data: { content: 'modifiée hors ligne' }, baseUpdatedAt: note.updatedAt }] });
    expect(conflict.body.data.results[0].status).toBe('conflict');
    const notes = (await api.get(u, `/notes?courseId=${course.id}`)).body.data;
    expect(notes.map((n: { content: string }) => n.content).sort()).toEqual(['modifiée hors ligne', 'modifiée sur le web']);

    // Révisions de cartes faites hors ligne.
    const deck = (await api.post(u, '/flashcards/decks', { title: 'Matrices', courseId: course.id, cards: [{ question: 'det(I) ?', answer: '1' }] })).body.data;
    const card = (await api.get(u, `/flashcards/decks/${deck.id}`)).body.data.cards[0];
    const rev = await api.post(u, '/sync/push', { operations: [{ opId: randomUUID(), entity: 'flashcard_review', action: 'create', id: randomUUID(), data: { flashcardId: card.id, rating: 3 }, clientTime: new Date(Date.now() - 3600_000).toISOString() }] });
    expect(rev.body.data.results[0].status).toBe('applied');

    const since = new Date(Date.now() - 1000).toISOString();
    await api.del(u, `/notes/${noteId}`).expect(204);
    const changes = (await api.get(u, `/sync/changes?since=${encodeURIComponent(since)}`)).body.data;
    expect(changes.tombstones.some((t: { entityId: string }) => t.entityId === noteId)).toBe(true);
    const full = (await api.get(u, '/sync/changes')).body.data;
    expect(full.courses).toHaveLength(1);
    expect(full.flashcards[0].repetitions).toBe(1);
  });

  it("les quiz en mode examen sont livrés hors ligne sans corrections", async () => {
    const u = await createUser();
    await api.post(u, '/quizzes', { title: 'Examen', configuration: { mode: 'exam' }, questions: [{ type: 'TRUE_FALSE', question: 'Vrai ?', correctAnswer: true }] }).expect(201);
    const q = (await api.get(u, '/sync/changes')).body.data.quizzes[0];
    expect(q.offlineEligible).toBe(false);
    expect(q.questions[0].correctAnswer).toBeNull();
  });
});
