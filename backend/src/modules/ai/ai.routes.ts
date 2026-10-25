import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { aiLimiter } from '../../middleware/rate-limit';
import { body, param, userId } from '../../utils/http';
import { badRequest, notFound } from '../../utils/errors';
import { aiStatus, ask, generateFlashcards, generateQuiz, generateSummary } from './ai.service';
import { QUESTION_TYPES } from './schemas';

export const aiRouter = Router();
export const summariesRouter = Router();

const scope = z
  .object({
    courseId: z.string().uuid().nullish(),
    folderId: z.string().uuid().nullish(),
    lessonId: z.string().uuid().nullish(),
    documentIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((s) => s.courseId || s.folderId || s.lessonId || s.documentIds?.length, { message: 'Sélectionnez une matière, un dossier, une leçon ou des documents.' });

aiRouter.get('/status', async (req, res) => {
  res.json({ data: await aiStatus(userId(req)) });
});

aiRouter.post('/summaries', aiLimiter, async (req, res) => {
  const input = body(req, scope.and(z.object({ length: z.enum(['brief', 'standard', 'detailed']).default('standard') })));
  res.status(201).json({ data: await generateSummary(userId(req), input) });
});

aiRouter.post('/flashcards', aiLimiter, async (req, res) => {
  const input = body(req, scope.and(z.object({ count: z.number().int().min(3).max(40).default(15), deckTitle: z.string().max(200).optional() })));
  res.status(201).json({ data: await generateFlashcards(userId(req), input) });
});

aiRouter.post('/quizzes', aiLimiter, async (req, res) => {
  const input = body(
    req,
    scope.and(
      z.object({
        title: z.string().max(200).optional(),
        count: z.number().int().min(1).max(40).default(10),
        difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
        types: z.array(z.enum(QUESTION_TYPES)).min(1).default(['SINGLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK']),
        topics: z.array(z.string().max(80)).max(10).default([]),
        mode: z.enum(['practice', 'exam']).default('practice'),
        timed: z.boolean().default(false),
        durationMinutes: z.number().int().min(1).max(600).nullish(),
        isMockExam: z.boolean().default(false),
      }),
    ),
  );
  if (input.timed && !input.durationMinutes) throw badRequest('Indiquez une durée pour un quiz minuté.');
  res.status(201).json({ data: await generateQuiz(userId(req), input) });
});

aiRouter.post('/ask', aiLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({
      question: z.string().trim().min(2).max(4000),
      threadId: z.string().uuid().optional(),
      context: z
        .object({ courseId: z.string().uuid().nullish(), folderId: z.string().uuid().nullish(), lessonId: z.string().uuid().nullish(), documentIds: z.array(z.string().uuid()).max(20).optional() })
        .default({}),
    }),
  );
  res.status(201).json({ data: await ask(userId(req), { question: input.question, threadId: input.threadId, scope: input.context }) });
});

aiRouter.get('/threads', async (req, res) => {
  res.json({
    data: await prisma.chatThread.findMany({
      where: { userId: userId(req) },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, context: true, updatedAt: true, _count: { select: { messages: true } } },
    }),
  });
});

aiRouter.get('/threads/:id', async (req, res) => {
  const thread = await prisma.chatThread.findFirst({ where: { id: param(req, 'id'), userId: userId(req) }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!thread) throw notFound('Conversation');
  res.json({ data: thread });
});

aiRouter.delete('/threads/:id', async (req, res) => {
  const thread = await prisma.chatThread.findFirst({ where: { id: param(req, 'id'), userId: userId(req) } });
  if (!thread) throw notFound('Conversation');
  await prisma.chatThread.delete({ where: { id: thread.id } });
  res.status(204).end();
});

// Signalement d'un contenu généré incorrect.
aiRouter.post('/feedback', async (req, res) => {
  const input = body(
    req,
    z.object({
      targetType: z.enum(['summary', 'flashcard', 'quiz_question', 'chat_message']),
      targetId: z.string().uuid(),
      reason: z.enum(['incorrect', 'not_in_source', 'unclear', 'offensive', 'other']),
      comment: z.string().max(2000).optional(),
    }),
  );
  const uid = userId(req);
  const exists = await {
    summary: () => prisma.summary.count({ where: { id: input.targetId, userId: uid } }),
    flashcard: () => prisma.flashcard.count({ where: { id: input.targetId, deck: { userId: uid } } }),
    quiz_question: () => prisma.quizQuestion.count({ where: { id: input.targetId, quiz: { userId: uid } } }),
    chat_message: () => prisma.chatMessage.count({ where: { id: input.targetId, thread: { userId: uid } } }),
  }[input.targetType]();
  if (!exists) throw notFound('Contenu');
  const fb = await prisma.aiFeedback.create({ data: { ...input, userId: uid } });
  res.status(201).json({ data: fb });
});

summariesRouter.get('/', async (req, res) => {
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  res.json({
    data: await prisma.summary.findMany({
      where: { userId: userId(req), ...(courseId ? { courseId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, title: true, length: true, provider: true, createdAt: true, courseId: true, lessonId: true, course: { select: { title: true } } },
    }),
  });
});

summariesRouter.get('/:id', async (req, res) => {
  const s = await prisma.summary.findFirst({ where: { id: param(req, 'id'), userId: userId(req) }, include: { course: { select: { id: true, title: true } }, lesson: { select: { id: true, title: true } } } });
  if (!s) throw notFound('Résumé');
  res.json({ data: s });
});

summariesRouter.delete('/:id', async (req, res) => {
  const s = await prisma.summary.findFirst({ where: { id: param(req, 'id'), userId: userId(req) } });
  if (!s) throw notFound('Résumé');
  await prisma.summary.delete({ where: { id: s.id } });
  res.status(204).end();
});
