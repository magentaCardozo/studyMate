import { describe, expect, it } from 'vitest';
import { drainJobs } from '../src/services/jobs';
import { api, createUser, uploadText, type TestUser } from './helpers';

const TEXT = `Statistique descriptive

La moyenne est la somme des valeurs divisée par le nombre de valeurs.
La médiane est la valeur qui partage une série ordonnée en deux parties égales.
Le mode est la valeur la plus fréquente d'une série.
L'écart-type est la racine carrée de la variance.
La variance est la moyenne des carrés des écarts à la moyenne.
L'étendue est la différence entre la plus grande et la plus petite valeur.`;

type Q = { id: string; questionType: string; correctAnswer: unknown; options: unknown[] };

/** Réponse juste ou volontairement fausse, selon le type de question (choix unique / multiple). */
const answer = (q: Q, right: boolean) => {
  if (q.questionType === 'SINGLE_CHOICE') {
    const c = q.correctAnswer as number;
    return right ? c : (c + 1) % q.options.length;
  }
  const c = q.correctAnswer as number[];
  return right ? c : q.options.map((_, i) => i).filter((i) => !c.includes(i)).slice(0, 1);
};

async function questionsOf(u: TestUser, quizId: string) {
  return (await api.get(u, `/quizzes/${quizId}?withAnswers=true`)).body.data.questions as Q[];
}

describe('onglet Révisions : QCM à terminer et questions ratées', () => {
  it('liste les QCM inachevés, les questions ratées, et les fait retravailler', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    await uploadText(u, { courseId: course.id, fileName: 'cours.txt', text: TEXT });
    await drainJobs();
    const gen = () => api.post(u, '/ai/quizzes', { courseId: course.id, count: 4, types: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'] }).expect(201);

    // QCM 1 : terminé, avec une question ratée.
    const quiz1 = (await gen()).body.data.id;
    const qs = await questionsOf(u, quiz1);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const a1 = (await api.post(u, `/quizzes/${quiz1}/attempts`)).body.data;
    for (const [i, q] of qs.entries()) await api.post(u, `/quiz-attempts/${a1.id}/responses`, { questionId: q.id, response: answer(q, i !== 0) }).expect(200);
    await api.post(u, `/quiz-attempts/${a1.id}/submit`).expect(200);

    // QCM 2 : commencé (une réponse) ; QCM 3 : jamais commencé.
    const quiz2 = (await gen()).body.data.id;
    const q2 = (await questionsOf(u, quiz2))[0];
    const a2 = (await api.post(u, `/quizzes/${quiz2}/attempts`)).body.data;
    await api.post(u, `/quiz-attempts/${a2.id}/responses`, { questionId: q2.id, response: answer(q2, true) }).expect(200);
    const quiz3 = (await gen()).body.data.id;

    let review = (await api.get(u, '/review')).body.data;
    expect(review.toFinish.map((t: { quizId: string }) => t.quizId)).toEqual([quiz2, quiz3]);
    expect(review.toFinish[0]).toMatchObject({ status: 'in_progress', answered: 1, attemptId: a2.id });
    expect(review.toFinish[1]).toMatchObject({ status: 'not_started', answered: 0 });
    expect(review.mistakes).toHaveLength(1);
    expect(review.mistakes[0]).toMatchObject({ questionId: qs[0].id, quiz: { id: quiz1 }, course: { id: course.id }, wrongCount: 1 });

    // QCM « Questions ratées » : hors dossier, chaque question garde son origine.
    const retry = (await api.post(u, '/review/mistakes-quiz', { courseId: course.id }).expect(201)).body.data;
    expect(retry.questions).toBe(1);
    expect((await api.get(u, `/courses/${course.id}/revisions`)).body.data.qcm.map((q: { id: string }) => q.id)).not.toContain(retry.id);
    const [copy] = await questionsOf(u, retry.id);
    const a3 = (await api.post(u, `/quizzes/${retry.id}/attempts`)).body.data;
    // Encore faux : la question reste à revoir, ratée deux fois.
    await api.post(u, `/quiz-attempts/${a3.id}/responses`, { questionId: copy.id, response: answer(copy, false) }).expect(200);
    review = (await api.get(u, '/review')).body.data;
    expect(review.mistakes[0]).toMatchObject({ questionId: qs[0].id, wrongCount: 2 });
    // Juste : elle disparaît des questions ratées.
    await api.post(u, `/quiz-attempts/${a3.id}/responses`, { questionId: copy.id, response: answer(copy, true) }).expect(200);
    await api.post(u, `/quiz-attempts/${a3.id}/submit`).expect(200);
    review = (await api.get(u, '/review')).body.data;
    expect(review.mistakes).toEqual([]);
    expect((await api.post(u, '/review/mistakes-quiz', {})).body.error.code).toBe('NO_MISTAKES');

    // Un autre étudiant ne voit rien de tout cela.
    const other = (await api.get(await createUser(), '/review')).body.data;
    expect(other).toMatchObject({ toFinish: [], mistakes: [] });
  }, 60_000);

  it("prend en compte les QCM passés sur l'application Android (même hors ligne)", async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    await uploadText(u, { courseId: course.id, fileName: 'cours.txt', text: TEXT });
    await drainJobs();
    const quiz = (await api.post(u, '/ai/quizzes', { courseId: course.id, count: 3, types: ['SINGLE_CHOICE'] }).expect(201)).body.data.id;
    const qs = await questionsOf(u, quiz);
    const op = {
      opId: crypto.randomUUID(),
      entity: 'quiz_result',
      action: 'create',
      id: crypto.randomUUID(),
      data: { quizId: quiz, responses: qs.map((q, i) => ({ questionId: q.id, response: answer(q, i !== 0) })) },
      clientTime: new Date(Date.now() - 3_600_000).toISOString(),
    };
    const pushed = (await api.post(u, '/sync/push', { operations: [op] })).body.data.results[0];
    expect(pushed.status).toBe('applied');
    // Notation faite par le serveur ; la question fausse est à revoir, le QCM n'est plus « à terminer ».
    expect(pushed.server).toMatchObject({ status: 'SUBMITTED', score: qs.length - 1, maxScore: qs.length });
    const review = (await api.get(u, '/review')).body.data;
    expect(review.mistakes.map((m: { questionId: string }) => m.questionId)).toEqual([qs[0].id]);
    expect(review.toFinish.map((t: { quizId: string }) => t.quizId)).not.toContain(quiz);
    // Réessai réseau : rien n'est rejoué.
    expect((await api.post(u, '/sync/push', { operations: [{ ...op, opId: crypto.randomUUID() }] })).body.data.results[0].status).toBe('duplicate');
  }, 60_000);
});
