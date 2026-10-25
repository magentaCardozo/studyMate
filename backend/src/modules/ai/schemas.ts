import { z } from 'zod';

/**
 * Schémas des sorties structurées de l'IA. Chaque sortie est validée (Zod)
 * avant d'être enregistrée ou renvoyée au client. Les références de sources
 * sont des identifiants « S1 », « S2 »… fournis dans le contexte : toute
 * référence inconnue est supprimée (on n'invente jamais de citation).
 */

const sourceIds = z.array(z.string()).max(12);

export const summaryOutput = z.object({
  mainTopic: z.string().min(1).max(500),
  keyConcepts: z.array(z.object({ term: z.string().min(1).max(200), explanation: z.string().max(2000), sources: sourceIds })).max(30),
  definitions: z.array(z.object({ term: z.string().min(1).max(200), definition: z.string().min(1).max(2000), sources: sourceIds })).max(40),
  formulas: z.array(z.object({ expression: z.string().min(1).max(500), description: z.string().max(1000), sources: sourceIds })).max(30),
  explanations: z.array(z.object({ title: z.string().max(300), steps: z.array(z.string().max(1500)).max(15), sources: sourceIds })).max(15),
  examples: z.array(z.object({ title: z.string().max(300), content: z.string().max(3000), sources: sourceIds })).max(15),
  commonMistakes: z.array(z.object({ mistake: z.string().max(1000), correction: z.string().max(1500), sources: sourceIds })).max(15),
  recap: z.string().max(3000),
  selfAssessment: z.array(z.string().max(500)).max(15),
  // Explications ajoutées par l'IA, absentes du document source : toujours signalées.
  additionalExplanations: z.array(z.object({ title: z.string().max(300), content: z.string().max(3000) })).max(10),
  limitations: z.array(z.string().max(500)).max(10),
  insufficientSource: z.boolean(),
});
export type SummaryOutput = z.infer<typeof summaryOutput>;

export const flashcardsOutput = z.object({
  cards: z
    .array(
      z.object({
        question: z.string().min(3).max(1000),
        answer: z.string().min(1).max(3000),
        sources: sourceIds,
        difficulty: z.number().int().min(1).max(3),
        tags: z.array(z.string().max(40)).max(5),
      }),
    )
    .max(60),
  limitations: z.array(z.string().max(500)).max(10),
});
export type FlashcardsOutput = z.infer<typeof flashcardsOutput>;

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_BLANK', 'MATCHING'] as const;
export type QType = (typeof QUESTION_TYPES)[number];

/** Forme « plate » produite par le modèle (plus fiable qu'un schéma polymorphe). */
export const generatedQuestion = z.object({
  type: z.enum(QUESTION_TYPES),
  question: z.string().min(5).max(2000),
  options: z.array(z.string().max(500)).max(8),
  matchRight: z.array(z.string().max(500)).max(8),
  correctIndices: z.array(z.number().int().min(0).max(7)).max(8),
  correctBoolean: z.boolean(),
  acceptedAnswers: z.array(z.string().max(300)).max(8),
  explanation: z.string().max(3000),
  sources: sourceIds,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topic: z.string().max(120),
  uncertain: z.boolean(),
});
export type GeneratedQuestion = z.infer<typeof generatedQuestion>;

export const quizOutput = z.object({ questions: z.array(generatedQuestion).max(60), limitations: z.array(z.string().max(500)).max(10) });
export type QuizOutput = z.infer<typeof quizOutput>;

export const answerOutput = z.object({
  answer: z.string().min(1).max(12_000),
  citations: sourceIds,
  groundedInSources: z.boolean(),
  generalKnowledgeUsed: z.boolean(),
  uncertainty: z.string().max(1000),
  followUpQuestion: z.string().max(500),
});
export type AnswerOutput = z.infer<typeof answerOutput>;

// ─── Format interne des questions (création manuelle et stockage) ───

export const questionInputSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  question: z.string().trim().min(3).max(2000),
  options: z.union([z.array(z.string().max(500)).max(8), z.object({ left: z.array(z.string().max(500)), right: z.array(z.string().max(500)) })]).optional(),
  correctAnswer: z.unknown(),
  explanation: z.string().max(3000).nullish(),
  topic: z.string().max(120).nullish(),
  difficulty: z.string().max(20).nullish(),
  points: z.number().min(0.25).max(20).optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

const uniqueNonEmpty = (arr: string[]) => arr.every((s) => s.trim()) && new Set(arr.map((s) => s.trim().toLowerCase())).size === arr.length;

/** Vérifie la cohérence d'une question et de sa clé de correction. Renvoie la liste des problèmes. */
export function validateQuestion(q: QuestionInput): string[] {
  const issues: string[] = [];
  const opts = Array.isArray(q.options) ? q.options : [];
  const c = q.correctAnswer;
  switch (q.type) {
    case 'SINGLE_CHOICE':
      if (opts.length < 2 || !uniqueNonEmpty(opts)) issues.push('Au moins deux options distinctes sont requises.');
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= opts.length) issues.push('La bonne réponse doit désigner une option existante.');
      break;
    case 'MULTIPLE_CHOICE':
      if (opts.length < 3 || !uniqueNonEmpty(opts)) issues.push('Au moins trois options distinctes sont requises.');
      if (!Array.isArray(c) || c.length < 1 || c.some((i) => typeof i !== 'number' || i < 0 || i >= opts.length) || new Set(c).size !== c.length)
        issues.push('Les bonnes réponses doivent désigner des options existantes.');
      break;
    case 'TRUE_FALSE':
      if (typeof c !== 'boolean') issues.push('La réponse doit être vrai ou faux.');
      break;
    case 'SHORT_ANSWER':
    case 'FILL_BLANK':
      if (!Array.isArray(c) || !c.length || c.some((s) => typeof s !== 'string' || !s.trim())) issues.push('Au moins une réponse acceptée est requise.');
      if (q.type === 'FILL_BLANK' && !q.question.includes('___')) issues.push('La phrase doit contenir un blanc « ___ ».');
      break;
    case 'MATCHING': {
      const o = q.options as { left?: string[]; right?: string[] } | undefined;
      const left = o && !Array.isArray(o) ? (o.left ?? []) : [];
      const right = o && !Array.isArray(o) ? (o.right ?? []) : [];
      if (left.length < 2 || left.length !== right.length) issues.push('Les deux colonnes doivent avoir le même nombre d’éléments (au moins deux).');
      if (!Array.isArray(c) || c.length !== left.length || new Set(c).size !== c.length || c.some((i) => typeof i !== 'number' || i < 0 || i >= right.length))
        issues.push('Chaque élément de gauche doit correspondre à un élément de droite distinct.');
      break;
    }
  }
  return issues;
}

/** Convertit une question générée (forme plate) vers le format interne. */
export function toQuestionInput(g: GeneratedQuestion): QuestionInput {
  const base = { type: g.type, question: g.question.trim(), explanation: g.explanation, topic: g.topic || null, difficulty: g.difficulty };
  switch (g.type) {
    case 'SINGLE_CHOICE':
      return { ...base, options: g.options, correctAnswer: g.correctIndices[0] };
    case 'MULTIPLE_CHOICE':
      return { ...base, options: g.options, correctAnswer: [...new Set(g.correctIndices)].sort() };
    case 'TRUE_FALSE':
      return { ...base, options: ['Vrai', 'Faux'], correctAnswer: g.correctBoolean };
    case 'SHORT_ANSWER':
    case 'FILL_BLANK':
      return { ...base, options: [], correctAnswer: g.acceptedAnswers.filter((a) => a.trim()) };
    case 'MATCHING':
      return { ...base, options: { left: g.options, right: g.matchRight }, correctAnswer: g.correctIndices };
  }
}

// ─── Schémas JSON pour les sorties structurées du fournisseur ───

type Json = Record<string, unknown>;
const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>): Json => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: unknown): Json => ({ type: 'array', items });

export const jsonSchemas = {
  summary: obj({
    mainTopic: str,
    keyConcepts: arr(obj({ term: str, explanation: str, sources: strArr })),
    definitions: arr(obj({ term: str, definition: str, sources: strArr })),
    formulas: arr(obj({ expression: str, description: str, sources: strArr })),
    explanations: arr(obj({ title: str, steps: strArr, sources: strArr })),
    examples: arr(obj({ title: str, content: str, sources: strArr })),
    commonMistakes: arr(obj({ mistake: str, correction: str, sources: strArr })),
    recap: str,
    selfAssessment: strArr,
    additionalExplanations: arr(obj({ title: str, content: str })),
    limitations: strArr,
    insufficientSource: { type: 'boolean' },
  }),
  flashcards: obj({
    cards: arr(obj({ question: str, answer: str, sources: strArr, difficulty: { type: 'integer', enum: [1, 2, 3] }, tags: strArr })),
    limitations: strArr,
  }),
  quiz: obj({
    questions: arr(
      obj({
        type: { type: 'string', enum: [...QUESTION_TYPES] },
        question: str,
        options: strArr,
        matchRight: strArr,
        correctIndices: { type: 'array', items: { type: 'integer' } },
        correctBoolean: { type: 'boolean' },
        acceptedAnswers: strArr,
        explanation: str,
        sources: strArr,
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        topic: str,
        uncertain: { type: 'boolean' },
      }),
    ),
    limitations: strArr,
  }),
  answer: obj({
    answer: str,
    citations: strArr,
    groundedInSources: { type: 'boolean' },
    generalKnowledgeUsed: { type: 'boolean' },
    uncertainty: str,
    followUpQuestion: str,
  }),
};
