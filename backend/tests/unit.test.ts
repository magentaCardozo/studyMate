import { describe, expect, it } from 'vitest';
import { schedule } from '../src/services/srs';
import { scoreResponse, normalizeAnswer } from '../src/services/quiz-scoring';
import { generatePlan, zonedToUtc } from '../src/services/planner';
import { chunkPages } from '../src/services/extraction';
import { toQuestionInput, validateQuestion } from '../src/modules/ai/schemas';
import { matchAllowedType, sniffMatches } from '../src/utils/file-types';
import { rankBlocks } from '../src/modules/ai/retrieval';
import { inQuietHours } from '../src/services/notifications';

const fresh = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };
const now = new Date('2026-10-01T10:00:00Z');

describe('répétition espacée', () => {
  it('espace les révisions réussies de façon croissante', () => {
    const r1 = schedule(fresh, 2, now);
    const r2 = schedule(r1, 2, r1.dueAt);
    const r3 = schedule(r2, 2, r2.dueAt);
    expect(r1.intervalDays).toBe(1);
    expect(r2.intervalDays).toBe(3);
    expect(r3.intervalDays).toBeCloseTo(7.5, 1);
  });
  it('« à revoir » remet la carte en apprentissage et réduit la facilité', () => {
    const learned = { easeFactor: 2.5, intervalDays: 10, repetitions: 4, lapses: 0 };
    const r = schedule(learned, 0, now);
    expect(r.repetitions).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.easeFactor).toBe(2.3);
    expect(r.dueAt.getTime() - now.getTime()).toBeLessThan(60 * 60 * 1000);
  });
  it('« facile » allonge plus que « compris », « difficile » moins', () => {
    const base = { easeFactor: 2.5, intervalDays: 3, repetitions: 2, lapses: 0 };
    expect(schedule(base, 3, now).intervalDays).toBeGreaterThan(schedule(base, 2, now).intervalDays);
    expect(schedule(base, 1, now).intervalDays).toBeLessThan(schedule(base, 2, now).intervalDays);
  });
  it('ne descend jamais sous la facilité minimale', () => {
    let s = { ...fresh, dueAt: now };
    for (let i = 0; i < 20; i++) s = schedule(s, 0, now);
    expect(s.easeFactor).toBe(1.3);
  });
});

describe('correction des quiz', () => {
  it('choix unique, multiple, vrai/faux, association', () => {
    expect(scoreResponse('SINGLE_CHOICE', 2, 2).isCorrect).toBe(true);
    expect(scoreResponse('SINGLE_CHOICE', 2, 1).isCorrect).toBe(false);
    expect(scoreResponse('MULTIPLE_CHOICE', [0, 2], [2, 0]).isCorrect).toBe(true);
    expect(scoreResponse('MULTIPLE_CHOICE', [0, 2], [0]).isCorrect).toBe(false);
    expect(scoreResponse('TRUE_FALSE', false, false).isCorrect).toBe(true);
    const m = scoreResponse('MATCHING', [1, 0, 2], [1, 2, 0]);
    expect(m.isCorrect).toBe(false);
    expect(m.credit).toBeCloseTo(1 / 3);
  });
  it('réponses libres : accents, casse et petites fautes tolérés', () => {
    expect(normalizeAnswer('  Dérivée ! ')).toBe('derivee');
    expect(scoreResponse('FILL_BLANK', ['dérivée'], 'DERIVEE').isCorrect).toBe(true);
    expect(scoreResponse('SHORT_ANSWER', ['théorème des valeurs intermédiaires'], 'theoreme des valeurs intermediares').isCorrect).toBe(true);
    expect(scoreResponse('FILL_BLANK', ['limite'], 'intégrale').isCorrect).toBe(false);
  });
  it('signale une réponse longue ambiguë au lieu de trancher', () => {
    const r = scoreResponse('SHORT_ANSWER', ['tangente'], 'je pense que c’est la tangente à la courbe en ce point précis');
    expect(r.isCorrect).toBeNull();
    expect(r.needsReview).toBe(true);
  });
  it('une absence de réponse vaut zéro', () => {
    expect(scoreResponse('SINGLE_CHOICE', 0, null).credit).toBe(0);
  });
});

describe('validation des questions générées', () => {
  const g = { options: [], matchRight: [], correctIndices: [], correctBoolean: false, acceptedAnswers: [], explanation: '', sources: [], difficulty: 'medium' as const, topic: '', uncertain: false };
  it('rejette une clé de correction hors limites', () => {
    const q = toQuestionInput({ ...g, type: 'SINGLE_CHOICE', question: 'Quelle est la dérivée de x² ?', options: ['x', '2x'], correctIndices: [5] });
    expect(validateQuestion(q).length).toBeGreaterThan(0);
  });
  it('rejette des options dupliquées et un texte à trous sans blanc', () => {
    expect(validateQuestion(toQuestionInput({ ...g, type: 'SINGLE_CHOICE', question: 'Question ?', options: ['a', 'A', 'b'], correctIndices: [0] })).length).toBeGreaterThan(0);
    expect(validateQuestion(toQuestionInput({ ...g, type: 'FILL_BLANK', question: 'Phrase sans blanc', acceptedAnswers: ['x'] })).length).toBeGreaterThan(0);
  });
  it('accepte une association cohérente', () => {
    const q = toQuestionInput({ ...g, type: 'MATCHING', question: 'Associez', options: ['a', 'b'], matchRight: ['B', 'A'], correctIndices: [1, 0] });
    expect(validateQuestion(q)).toEqual([]);
  });
});

describe('planificateur', () => {
  const course = (id: string, examInDays: number, extra = {}) => ({
    id,
    title: id,
    importance: 3,
    confidence: 3,
    examDate: new Date(now.getTime() + examInDays * 86400_000),
    lessons: [1, 2, 3].map((i) => ({ id: `${id}-l${i}`, title: `Leçon ${i}`, completed: false, estimatedMinutes: 30 })),
    avgQuizScore: null,
    difficultCards: 0,
    dueCards: 0,
    ...extra,
  });
  const base = { now, timezone: 'Africa/Kinshasa', availability: { mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 90, sun: 90 }, sessionMinutes: 45, startTime: '18:00', busyMinutes: {} };

  it('ne dépasse jamais la disponibilité quotidienne', () => {
    const plan = generatePlan({ ...base, courses: [course('math', 7), course('info', 5)] });
    const perDay = new Map<string, number>();
    for (const s of plan) {
      const d = s.scheduledStart.toISOString().slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + 45);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(90);
    expect(plan.every((s) => s.scheduledStart > now)).toBe(true);
  });
  it('ne planifie rien pour une matière après son examen et propose un examen blanc juste avant', () => {
    const plan = generatePlan({ ...base, courses: [course('math', 4)] });
    const exam = new Date(now.getTime() + 4 * 86400_000);
    expect(plan.every((s) => s.scheduledStart < exam)).toBe(true);
    expect(plan.some((s) => s.activityType === 'mock_exam')).toBe(true);
  });
  it('donne la priorité à la matière la plus faible et explique pourquoi', () => {
    const plan = generatePlan({ ...base, courses: [course('fort', 10, { confidence: 5, avgQuizScore: 0.95 }), course('faible', 10, { confidence: 1, avgQuizScore: 0.3 })] });
    const counts = plan.reduce((m, s) => m.set(s.courseId, (m.get(s.courseId) ?? 0) + 1), new Map<string, number>());
    expect(counts.get('faible')!).toBeGreaterThan(counts.get('fort')!);
    expect(plan.find((s) => s.courseId === 'faible')!.reason).toMatch(/confiance déclarée faible|résultats de quiz/);
  });
  it('tient compte des sessions manuelles déjà prévues', () => {
    const day = '2026-10-02';
    const plan = generatePlan({ ...base, courses: [course('math', 10)], busyMinutes: { [day]: 90 } });
    expect(plan.some((s) => s.scheduledStart.toISOString().startsWith(day))).toBe(false);
  });
  it('convertit correctement l’heure locale de Kinshasa (UTC+1)', () => {
    expect(zonedToUtc('2026-10-02', '18:00', 'Africa/Kinshasa').toISOString()).toBe('2026-10-02T17:00:00.000Z');
  });
});

describe('documents', () => {
  it('vérifie extension, type déclaré et signature binaire', () => {
    expect(matchAllowedType('cours.pdf', 'application/pdf')?.mime).toBe('application/pdf');
    expect(matchAllowedType('virus.exe', 'application/pdf')).toBeNull();
    expect(matchAllowedType('cours.pdf', 'image/png')).toBeNull();
    expect(sniffMatches(Buffer.from('%PDF-1.7 ...'), 'application/pdf')).toBe(true);
    expect(sniffMatches(Buffer.from('<html>pas un pdf</html>'), 'application/pdf')).toBe(false);
    expect(sniffMatches(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'image/png')).toBe(true);
    expect(sniffMatches(Buffer.from([0, 1, 2, 3]), 'text/plain')).toBe(false);
  });
  it('découpe le texte en passages en conservant le numéro de page', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Paragraphe ${i} avec un peu de contenu pour remplir la page.`).join('\n\n');
    const chunks = chunkPages([{ page: 3, text: long }, { page: 4, text: 'Court.' }], 400);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.content.length <= 600)).toBe(true);
    expect(chunks.at(-1)!.page).toBe(4);
  });
  it('la recherche BM25 retrouve le passage pertinent sans tenir compte des accents', () => {
    const blocks = [
      { id: 'S1', kind: 'document' as const, title: 'a', page: 1, text: 'La dérivée mesure la variation instantanée.' },
      { id: 'S2', kind: 'document' as const, title: 'b', page: 2, text: 'Les intégrales calculent des aires.' },
    ];
    expect(rankBlocks('Qu’est-ce que la derivee ?', blocks)[0].block.id).toBe('S1');
    expect(rankBlocks('photosynthèse', blocks)).toEqual([]);
  });
});

describe('notifications', () => {
  it('respecte les heures calmes qui passent minuit', () => {
    const settings = { quietHours: { start: '22:00', end: '07:00' } };
    expect(inQuietHours(settings, 'UTC', new Date('2026-10-01T23:30:00Z'))).toBe(true);
    expect(inQuietHours(settings, 'UTC', new Date('2026-10-01T12:00:00Z'))).toBe(false);
  });
});
