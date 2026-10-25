import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError, tooMany } from '../../utils/errors';
import { AiError, type AiProvider, type SourceBlock, type Usage } from './provider';
import { MockProvider } from './mock.provider';
import { AnthropicProvider } from './anthropic.provider';
import { gatherContext, requireContent, resolveSources, sourceRef, type GatheredContext, type Scope } from './context';
import { rankBlocks } from './retrieval';
import { toQuestionInput, validateQuestion } from './schemas';

// Tarifs indicatifs (USD par million de jetons) pour le suivi des coûts.
const PRICING: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-1': [10, 50],
};

let provider: AiProvider | null = null;
let providerError: string | null = null;

export function getProvider(): AiProvider {
  if (provider) return provider;
  try {
    provider = env.AI_PROVIDER === 'anthropic' ? new AnthropicProvider() : new MockProvider();
    return provider;
  } catch (e) {
    providerError = (e as Error).message;
    throw new AppError(503, 'AI_NOT_CONFIGURED', "Le service d'IA n'est pas configuré sur ce serveur.");
  }
}

/** Pour les tests : injecte un fournisseur (ex. simulant une panne). */
export function setProvider(p: AiProvider | null) {
  provider = p;
}

export async function aiStatus(userId: string) {
  let p: AiProvider | null = null;
  try {
    p = getProvider();
  } catch {
    /* non configuré */
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { aiConsentAt: true } });
  return {
    provider: p?.name ?? null,
    model: p?.model ?? null,
    configured: !!p,
    demoMode: p?.name === 'demo',
    external: p?.external ?? false,
    requiresConsent: !!p?.external && !user.aiConsentAt,
    consentGivenAt: user.aiConsentAt,
    dailyLimit: env.AI_DAILY_REQUEST_LIMIT,
    usedToday: await usedToday(userId),
    error: p ? null : providerError,
  };
}

async function usedToday(userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return prisma.aiUsage.count({ where: { userId, createdAt: { gte: since } } });
}

async function preflight(userId: string) {
  const p = getProvider();
  if (p.external) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { aiConsentAt: true } });
    if (!user.aiConsentAt) {
      throw new AppError(403, 'AI_CONSENT_REQUIRED', "Autorisez l'envoi de vos documents au fournisseur d'IA dans Paramètres › Confidentialité pour utiliser cette fonction.");
    }
  }
  if ((await usedToday(userId)) >= env.AI_DAILY_REQUEST_LIMIT) {
    throw tooMany(`Limite quotidienne atteinte (${env.AI_DAILY_REQUEST_LIMIT} demandes). Réessayez demain.`);
  }
  return p;
}

async function track<T>(userId: string, task: string, p: AiProvider, fn: () => Promise<{ output: T; usage: Usage }>) {
  const started = Date.now();
  try {
    const result = await fn();
    const [inPrice, outPrice] = PRICING[p.model] ?? [0, 0];
    const cost = (result.usage.inputTokens * inPrice + result.usage.outputTokens * outPrice) / 1_000_000;
    await prisma.aiUsage.create({
      data: { userId, task, provider: p.name, model: result.usage.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: cost, latencyMs: Date.now() - started },
    });
    logger.info({ task, provider: p.name, ms: Date.now() - started, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: cost }, 'Génération IA');
    return result;
  } catch (e) {
    const code = e instanceof AiError ? e.code : 'UNEXPECTED';
    await prisma.aiUsage.create({ data: { userId, task, provider: p.name, model: p.model, latencyMs: Date.now() - started, success: false, errorCode: code } }).catch(() => {});
    logger.warn({ err: e, task, provider: p.name }, 'Échec de génération IA');
    if (e instanceof AiError) {
      const status = { RATE_LIMITED: 429, NOT_CONFIGURED: 503, PROVIDER_UNAVAILABLE: 503, PROVIDER_ERROR: 502, REFUSED: 422, TRUNCATED: 422, INVALID_OUTPUT: 502 }[e.code];
      throw new AppError(status, `AI_${e.code}`, e.message);
    }
    throw e;
  }
}

function coverageNote(ctx: GatheredContext) {
  const notes: string[] = [];
  if (ctx.usedChars < ctx.totalChars) notes.push(`Contenu volumineux : environ ${Math.round((ctx.usedChars / ctx.totalChars) * 100)} % du texte a été utilisé, réparti sur l’ensemble des sources.`);
  if (ctx.skippedDocuments.length) notes.push(`${ctx.skippedDocuments.length} document(s) non encore traité(s) n’ont pas été pris en compte.`);
  return notes;
}

const usedRefs = (blocks: SourceBlock[], ids: string[]) => resolveSources(ids, blocks);

async function userLanguage(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferredLanguage: true } })).preferredLanguage;
}

// ───────────────────────────── Résumés ─────────────────────────────

export async function generateSummary(userId: string, input: Scope & { length: 'brief' | 'standard' | 'detailed' }) {
  const p = await preflight(userId);
  const ctx = await gatherContext(userId, input);
  requireContent(ctx);
  const language = await userLanguage(userId);
  const { output } = await track(userId, 'summary', p, () => p.summarize(ctx.blocks, { length: input.length, title: ctx.label, language }));
  const map = (ids: string[]) => usedRefs(ctx.blocks, ids);
  const content = {
    ...output,
    keyConcepts: output.keyConcepts.map((x) => ({ ...x, sources: map(x.sources) })),
    definitions: output.definitions.map((x) => ({ ...x, sources: map(x.sources) })),
    formulas: output.formulas.map((x) => ({ ...x, sources: map(x.sources) })),
    explanations: output.explanations.map((x) => ({ ...x, sources: map(x.sources) })),
    examples: output.examples.map((x) => ({ ...x, sources: map(x.sources) })),
    commonMistakes: output.commonMistakes.map((x) => ({ ...x, sources: map(x.sources) })),
    limitations: [...output.limitations, ...coverageNote(ctx)],
  };
  const allIds = [content.keyConcepts, content.definitions, content.formulas, content.explanations, content.examples, content.commonMistakes].flat().flatMap((x) => x.sources.map((s) => s.sourceId));
  return prisma.summary.create({
    data: {
      userId,
      courseId: ctx.courseId,
      lessonId: ctx.lessonId,
      title: `Résumé — ${ctx.label}`,
      length: input.length,
      content: content as unknown as Prisma.InputJsonValue,
      sources: usedRefs(ctx.blocks, allIds) as unknown as Prisma.InputJsonValue,
      provider: p.name,
      model: p.model,
    },
  });
}

// ───────────────────────────── Cartes mémoire ─────────────────────────────

export async function generateFlashcards(userId: string, input: Scope & { count: number; deckTitle?: string }) {
  const p = await preflight(userId);
  const ctx = await gatherContext(userId, input);
  requireContent(ctx);
  const language = await userLanguage(userId);
  const { output } = await track(userId, 'flashcards', p, () => p.flashcards(ctx.blocks, { count: input.count, title: ctx.label, language }));
  const seen = new Set<string>();
  const cards = output.cards.filter((c) => {
    const key = c.question.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!cards.length) throw new AppError(422, 'AI_NO_CARDS', 'Aucune carte fiable n’a pu être produite à partir de ce contenu.');
  const folderId = input.folderId ?? null;
  const allIds = cards.flatMap((c) => c.sources);
  return prisma.flashcardDeck.create({
    data: {
      userId,
      courseId: ctx.courseId,
      folderId,
      lessonId: ctx.lessonId,
      title: input.deckTitle?.trim() || `Cartes — ${ctx.label}`,
      origin: 'ai',
      provider: p.name,
      sources: { refs: usedRefs(ctx.blocks, allIds), limitations: [...output.limitations, ...coverageNote(ctx)] } as unknown as Prisma.InputJsonValue,
      cards: {
        create: cards.map((c) => {
          const refs = usedRefs(ctx.blocks, c.sources);
          return { question: c.question, answer: c.answer, difficulty: c.difficulty, tags: c.tags, sourceReference: (refs[0] ?? null) as unknown as Prisma.InputJsonValue };
        }),
      },
    },
    include: { cards: true },
  });
}

// ───────────────────────────── Quiz et examens blancs ─────────────────────────────

export interface QuizGenInput extends Scope {
  count: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  types: string[];
  topics: string[];
  mode: 'practice' | 'exam';
  timed: boolean;
  durationMinutes?: number | null;
  isMockExam: boolean;
  title?: string;
}

export async function generateQuiz(userId: string, input: QuizGenInput) {
  const p = await preflight(userId);
  const ctx = await gatherContext(userId, input);
  requireContent(ctx);
  const language = await userLanguage(userId);
  const { output } = await track(userId, input.isMockExam ? 'mock_exam' : 'quiz', p, () =>
    p.quiz(ctx.blocks, { count: input.count, difficulty: input.difficulty, types: input.types, topics: input.topics, title: ctx.label, language }),
  );
  // Validation des clés de correction : les questions incohérentes sont écartées.
  const valid = [];
  let rejected = 0;
  for (const g of output.questions) {
    if (input.types.length && !input.types.includes(g.type)) {
      rejected++;
      continue;
    }
    const q = toQuestionInput(g);
    if (validateQuestion(q).length) {
      rejected++;
      continue;
    }
    valid.push({ q, g });
  }
  if (!valid.length) throw new AppError(422, 'AI_NO_QUESTIONS', 'Aucune question fiable n’a pu être produite à partir de ce contenu. Essayez d’autres types de questions ou une sélection plus riche.');
  const limitations = [...output.limitations, ...coverageNote(ctx)];
  if (rejected) limitations.push(`${rejected} question(s) générée(s) ont été écartées car leur correction était incohérente.`);
  if (valid.length < input.count) limitations.push(`Le contenu a permis ${valid.length} question(s) fiables sur ${input.count} demandées.`);
  const slice = valid.slice(0, input.count);
  return prisma.quiz.create({
    data: {
      userId,
      courseId: ctx.courseId,
      lessonId: ctx.lessonId,
      title: input.title?.trim() || `${input.isMockExam ? 'Examen blanc' : input.types.every((t) => t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE') ? 'QCM' : 'Quiz'} — ${ctx.label}`,
      origin: 'ai',
      provider: p.name,
      configuration: { mode: input.mode, timed: input.timed, durationMinutes: input.timed ? (input.durationMinutes ?? null) : null, difficulty: input.difficulty, questionTypes: input.types, isMockExam: input.isMockExam, limitations },
      sources: usedRefs(ctx.blocks, slice.flatMap((v) => v.g.sources)) as unknown as Prisma.InputJsonValue,
      questions: {
        create: slice.map(({ q, g }, i) => {
          const refs = usedRefs(ctx.blocks, g.sources);
          return {
            ordinal: i,
            question: q.question,
            questionType: q.type,
            options: (q.options ?? []) as Prisma.InputJsonValue,
            correctAnswer: q.correctAnswer as Prisma.InputJsonValue,
            explanation: q.explanation,
            topic: q.topic,
            difficulty: q.difficulty,
            uncertain: g.uncertain,
            sourceReference: (refs[0] ? { ...refs[0], all: refs } : null) as unknown as Prisma.InputJsonValue,
          };
        }),
      },
    },
    include: { _count: { select: { questions: true } } },
  });
}

// ───────────────────────────── Tuteur (questions-réponses) ─────────────────────────────

export async function ask(userId: string, input: { question: string; threadId?: string; scope: Scope }) {
  const p = await preflight(userId);
  const thread = input.threadId
    ? await prisma.chatThread.findFirst({ where: { id: input.threadId, userId } })
    : await prisma.chatThread.create({ data: { userId, title: input.question.slice(0, 80), context: input.scope as Prisma.InputJsonValue } });
  if (!thread) throw new AppError(404, 'NOT_FOUND', 'Conversation introuvable.');
  const scope = (input.threadId ? thread.context : input.scope) as Scope;
  const hasScope = !!(scope.courseId || scope.folderId || scope.lessonId || scope.documentIds?.length);
  const ctx = hasScope ? await gatherContext(userId, scope, { allChunks: true }) : null;
  // Recherche des passages pertinents (RAG) parmi les seules sources autorisées.
  const relevant = ctx ? rankBlocks(input.question, ctx.blocks, 8).map((h) => h.block) : [];
  const blocks = relevant.map((b, i) => ({ ...b, id: `S${i + 1}` }));
  const history = (await prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'desc' }, take: 6 }))
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 2000) }));
  const language = await userLanguage(userId);
  await prisma.chatMessage.create({ data: { threadId: thread.id, role: 'user', content: input.question } });
  const { output } = await track(userId, 'ask', p, () => p.answer(input.question, blocks, history, { language, scopeLabel: ctx?.label ?? 'Question générale' }));
  const citations = resolveSources(output.citations, blocks);
  // Les marqueurs [Sx] qui ne correspondent à aucune source fournie sont retirés du texte.
  const answer = output.answer.replace(/\[(S\d+)\]/g, (m, id) => (blocks.some((b) => b.id === id) ? m : ''));
  const message = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: 'assistant',
      content: answer,
      citations: { refs: citations, generalKnowledgeUsed: output.generalKnowledgeUsed, uncertainty: output.uncertainty, followUpQuestion: output.followUpQuestion } as unknown as Prisma.InputJsonValue,
      grounded: output.groundedInSources && citations.length > 0,
      provider: p.name,
    },
  });
  await prisma.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  return { threadId: thread.id, message, scopeLabel: ctx?.label ?? 'Question générale', sourcesConsidered: blocks.map(sourceRef) };
}
