import { afterEach, describe, expect, it } from 'vitest';
import { api, createUser, uploadText, type TestUser } from './helpers';
import { drainJobs } from '../src/services/jobs';
import { setProvider } from '../src/modules/ai/ai.service';
import { AiError, type AiProvider } from '../src/modules/ai/provider';
import { MockProvider } from '../src/modules/ai/mock.provider';

async function courseWithDocument(u: TestUser) {
  const course = (await api.post(u, '/courses', { title: 'Analyse mathématique' })).body.data;
  const lesson = (await api.post(u, `/courses/${course.id}/lessons`, { title: 'Dérivation' })).body.data;
  const doc = await uploadText(u, { courseId: course.id });
  expect(doc.processingStatus).toBe('QUEUED');
  await drainJobs();
  return { course, lesson, doc };
}

afterEach(() => setProvider(null));

describe('traitement des documents', () => {
  it("met à jour l'état, extrait le texte et notifie l'étudiant", async () => {
    const u = await createUser();
    const { doc } = await courseWithDocument(u);
    const status = await api.get(u, `/documents/${doc.id}/status`);
    expect(status.body.data.processingStatus).toBe('READY');
    const text = await api.get(u, `/documents/${doc.id}/text`);
    expect(text.body.data.pages[0].text).toContain('dérivée');
    // Correction manuelle du texte (OCR).
    await api.put(u, `/documents/${doc.id}/text`, { pages: [{ page: null, text: 'Texte corrigé : la dérivée de x² est 2x.' }] }).expect(200);
    expect((await api.get(u, `/documents/${doc.id}/text`)).body.data.corrected).toBe(true);
    const notifs = await api.get(u, '/notifications');
    expect(notifs.body.data.some((n: { type: string }) => n.type === 'document_ready')).toBe(true);
  });
});

describe('révision intelligente (adaptateur de démonstration)', () => {
  it('résumé fondé sur les sources, avec provenance et mention du mode démo', async () => {
    const u = await createUser();
    const { course, doc } = await courseWithDocument(u);
    const r = await api.post(u, '/ai/summaries', { documentIds: [doc.id], length: 'standard' });
    expect(r.status).toBe(201);
    const s = r.body.data;
    expect(s.provider).toBe('demo');
    expect(s.courseId).toBe(course.id);
    expect(s.content.definitions.length).toBeGreaterThan(0);
    expect(s.content.definitions[0].sources[0].documentId).toBe(doc.id);
    expect(s.content.limitations.join(' ')).toMatch(/démonstration/);
    // Aucune explication « ajoutée » n'est inventée par l'adaptateur de démonstration.
    expect(s.content.additionalExplanations).toEqual([]);
  });

  it('cartes générées puis révision espacée avec historique', async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    const deck = (await api.post(u, '/ai/flashcards', { courseId: course.id, count: 6 })).body.data;
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(deck.origin).toBe('ai');
    const card = deck.cards[0];
    expect(card.sourceReference.documentId).toBeTruthy();
    const study = await api.get(u, `/flashcards/study?deckId=${deck.id}&mode=due`);
    expect(study.body.data.length).toBe(deck.cards.length);
    const opId = crypto.randomUUID();
    const rev = await api.post(u, `/flashcards/cards/${card.id}/review`, { rating: 2, clientOpId: opId });
    expect(rev.body.data.card.intervalDays).toBe(1);
    // Rejeu de la même révision (réseau instable) : idempotent.
    const again = await api.post(u, `/flashcards/cards/${card.id}/review`, { rating: 2, clientOpId: opId });
    expect(again.body.data.duplicate).toBe(true);
    expect((await api.get(u, `/flashcards/cards/${card.id}/reviews`)).body.data).toHaveLength(1);
    // Modification et création manuelles.
    await api.patch(u, `/flashcards/cards/${card.id}`, { answer: 'Réponse corrigée' }).expect(200);
    await api.post(u, `/flashcards/decks/${deck.id}/cards`, { question: 'Question perso ?', answer: 'Oui' }).expect(201);
  });

  it('quiz en mode examen : réponses masquées, notation, explications et leçons à revoir', async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    const quiz = await api.post(u, '/ai/quizzes', { courseId: course.id, count: 5, types: ['SINGLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'], mode: 'exam', timed: true, durationMinutes: 30 });
    expect(quiz.status).toBe(201);
    const attempt = (await api.post(u, `/quizzes/${quiz.body.data.id}/attempts`, {})).body.data;
    expect(attempt.deadlineAt).toBeTruthy();
    const view = (await api.get(u, `/quiz-attempts/${attempt.id}`)).body.data;
    expect(view.questions.every((q: object) => !('correctAnswer' in q) && !('explanation' in q))).toBe(true);
    expect((await api.get(u, `/quizzes/${quiz.body.data.id}?withAnswers=true`)).status).toBe(403);
    expect((await api.get(u, `/quiz-attempts/${attempt.id}/results`)).status).toBe(403);
    // Reprendre ne crée pas de nouvelle tentative (aucune perte de progression).
    const resumed = await api.post(u, `/quizzes/${quiz.body.data.id}/attempts`, {});
    expect(resumed.body.data.id).toBe(attempt.id);

    const q0 = view.questions[0];
    const saved = await api.post(u, `/quiz-attempts/${attempt.id}/responses`, { questionId: q0.id, response: q0.questionType === 'TRUE_FALSE' ? true : q0.questionType === 'FILL_BLANK' ? 'dérivée' : 0 });
    expect(saved.body.data).toEqual({ saved: true, answeredAt: expect.any(String) });
    const results = (await api.post(u, `/quiz-attempts/${attempt.id}/submit`)).body.data;
    expect(results.attempt.status).toBe('SUBMITTED');
    expect(results.attempt.maxScore).toBe(view.questions.length);
    expect(results.items[0]).toHaveProperty('correctAnswer');
    expect(results.items[0]).toHaveProperty('explanation');
    expect(results.summary.unanswered).toBe(view.questions.length - 1);
    // Plus aucune réponse acceptée après soumission.
    expect((await api.post(u, `/quiz-attempts/${attempt.id}/responses`, { questionId: q0.id, response: 1 })).status).toBe(409);
  });

  it('mode entraînement : correction immédiate', async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    const quiz = (await api.post(u, '/ai/quizzes', { courseId: course.id, count: 3, types: ['TRUE_FALSE'], mode: 'practice' })).body.data;
    const attempt = (await api.post(u, `/quizzes/${quiz.id}/attempts`, {})).body.data;
    const q = (await api.get(u, `/quiz-attempts/${attempt.id}`)).body.data.questions[0];
    const r = await api.post(u, `/quiz-attempts/${attempt.id}/responses`, { questionId: q.id, response: true });
    expect(r.body.data).toHaveProperty('isCorrect');
    expect(r.body.data).toHaveProperty('explanation');
  });

  it('tuteur : réponses citant uniquement des sources réelles', async () => {
    const u = await createUser();
    const { course, doc } = await courseWithDocument(u);
    const r = await api.post(u, '/ai/ask', { question: 'Qu’est-ce que la dérivée ?', context: { courseId: course.id } });
    expect(r.status).toBe(201);
    const msg = r.body.data.message;
    expect(msg.grounded).toBe(true);
    expect(msg.citations.refs[0].documentId).toBe(doc.id);
    const thread = await api.get(u, `/ai/threads/${r.body.data.threadId}`);
    expect(thread.body.data.messages).toHaveLength(2);
  });

  it('refuse de générer à partir d’un contenu insuffisant', async () => {
    const u = await createUser();
    const course = (await api.post(u, '/courses', { title: 'Vide' })).body.data;
    const r = await api.post(u, '/ai/summaries', { courseId: course.id });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INSUFFICIENT_CONTENT');
  });

  it('gère proprement une panne du fournisseur d’IA et une sortie invalide', async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    const down: AiProvider = Object.assign(new MockProvider(), {
      name: 'test-down',
      summarize: async () => {
        throw new AiError('PROVIDER_UNAVAILABLE', "Le service d'IA est momentanément indisponible.");
      },
      quiz: async () => ({ output: { questions: [{ type: 'SINGLE_CHOICE', question: 'Question cassée ?', options: ['a'], matchRight: [], correctIndices: [3], correctBoolean: false, acceptedAnswers: [], explanation: '', sources: ['S999'], difficulty: 'easy', topic: '', uncertain: false }], limitations: [] }, usage: { inputTokens: 0, outputTokens: 0, model: 'x' } }),
    });
    setProvider(down);
    const r = await api.post(u, '/ai/summaries', { courseId: course.id });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    // Question à la clé incohérente : rejetée par la validation, rien n'est enregistré.
    const q = await api.post(u, '/ai/quizzes', { courseId: course.id, count: 1, types: ['SINGLE_CHOICE'] });
    expect(q.status).toBe(422);
    expect((await api.get(u, '/quizzes')).body.data).toHaveLength(0);
  });

  it("exige le consentement lorsque le fournisseur est externe", async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    setProvider(Object.assign(new MockProvider(), { name: 'external-test', external: true }));
    const r = await api.post(u, '/ai/summaries', { courseId: course.id });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('AI_CONSENT_REQUIRED');
    await api.post(u, '/users/me/ai-consent', { granted: true }).expect(200);
    expect((await api.post(u, '/ai/summaries', { courseId: course.id })).status).toBe(201);
  });

  it('signalement d’un contenu généré incorrect', async () => {
    const u = await createUser();
    const { course } = await courseWithDocument(u);
    const s = (await api.post(u, '/ai/summaries', { courseId: course.id })).body.data;
    expect((await api.post(u, '/ai/feedback', { targetType: 'summary', targetId: s.id, reason: 'incorrect', comment: 'Erreur de formule' })).status).toBe(201);
  });
});
