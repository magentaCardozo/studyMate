import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { ownedAttempt, ownedQuiz, resolvePlacement, tombstone } from '../../services/ownership';
import { scoreResponse } from '../../services/quiz-scoring';
import { body, param, query, userId } from '../../utils/http';
import { AppError, badRequest, conflict } from '../../utils/errors';
import { questionInputSchema, validateQuestion } from '../ai/schemas';
import { attemptResults, configOf, finalizeIfExpired, fullQuestion, publicQuestion, submitAttempt } from './quizzes.service';

export const quizzesRouter = Router();
export const attemptsRouter = Router();

quizzesRouter.get('/', async (req, res) => {
  const q = query(req, z.object({ courseId: z.string().uuid().optional(), lessonId: z.string().uuid().optional(), mockExam: z.enum(['true', 'false']).optional() }));
  const where: Prisma.QuizWhereInput = {
    userId: userId(req),
    courseId: q.courseId,
    lessonId: q.lessonId,
    ...(q.mockExam ? { configuration: { path: ['isMockExam'], equals: q.mockExam === 'true' } } : {}),
  };
  const quizzes = await prisma.quiz.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      course: { select: { id: true, title: true } },
      lesson: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
      attempts: { orderBy: { startedAt: 'desc' }, take: 1, select: { id: true, status: true, score: true, maxScore: true, startedAt: true, completedAt: true } },
    },
  });
  res.json({ data: quizzes.map(({ attempts, ...rest }) => ({ ...rest, lastAttempt: attempts[0] ?? null })) });
});

// Création manuelle d'un quiz (sans IA).
quizzesRouter.post('/', async (req, res) => {
  const uid = userId(req);
  const input = body(
    req,
    z.object({
      title: z.string().trim().min(1).max(200),
      courseId: z.string().uuid().nullish(),
      lessonId: z.string().uuid().nullish(),
      configuration: z
        .object({ mode: z.enum(['practice', 'exam']).default('practice'), timed: z.boolean().default(false), durationMinutes: z.number().int().min(1).max(600).nullish(), isMockExam: z.boolean().default(false) })
        .default({}),
      questions: z.array(questionInputSchema).min(1).max(100),
    }),
  );
  const placement = await resolvePlacement(uid, input);
  const problems = input.questions.map((q, i) => ({ i, issues: validateQuestion(q) })).filter((p) => p.issues.length);
  if (problems.length) throw badRequest('Certaines questions sont incohérentes.', problems, 'INVALID_QUESTIONS');
  const quiz = await prisma.quiz.create({
    data: {
      userId: uid,
      title: input.title,
      courseId: placement.courseId,
      lessonId: placement.lessonId,
      origin: 'manual',
      configuration: input.configuration,
      questions: {
        create: input.questions.map((q, i) => ({
          ordinal: i,
          question: q.question,
          questionType: q.type,
          options: q.options ?? [],
          correctAnswer: q.correctAnswer as Prisma.InputJsonValue,
          explanation: q.explanation,
          topic: q.topic,
          difficulty: q.difficulty,
          points: q.points ?? 1,
        })),
      },
    },
  });
  res.status(201).json({ data: quiz });
});

quizzesRouter.get('/:id', async (req, res) => {
  const uid = userId(req);
  const quiz = await ownedQuiz(uid, param(req, 'id'));
  const { withAnswers } = query(req, z.object({ withAnswers: z.enum(['true', 'false']).default('false') }));
  const cfg = configOf(quiz.configuration);
  if (withAnswers === 'true' && cfg.mode === 'exam') {
    const running = await prisma.quizAttempt.count({ where: { quizId: quiz.id, status: 'IN_PROGRESS' } });
    if (running) throw new AppError(403, 'ANSWERS_LOCKED', 'Les réponses sont masquées tant que l’examen est en cours.');
  }
  const full = await prisma.quiz.findUniqueOrThrow({
    where: { id: quiz.id },
    include: {
      questions: { orderBy: { ordinal: 'asc' } },
      course: { select: { id: true, title: true } },
      lesson: { select: { id: true, title: true } },
      attempts: { orderBy: { startedAt: 'desc' }, take: 10, select: { id: true, status: true, score: true, maxScore: true, startedAt: true, completedAt: true, mode: true } },
    },
  });
  res.json({ data: { ...full, questions: full.questions.map(withAnswers === 'true' ? fullQuestion : publicQuestion) } });
});

quizzesRouter.delete('/:id', async (req, res) => {
  const uid = userId(req);
  const quiz = await ownedQuiz(uid, param(req, 'id'));
  await prisma.quiz.delete({ where: { id: quiz.id } });
  await tombstone(uid, 'quiz', quiz.id);
  res.status(204).end();
});

// Démarre (ou reprend) une tentative : une tentative en cours n'est jamais perdue.
quizzesRouter.post('/:id/attempts', async (req, res) => {
  const uid = userId(req);
  const quiz = await ownedQuiz(uid, param(req, 'id'));
  const cfg = configOf(quiz.configuration);
  const input = body(req, z.object({ mode: z.enum(['practice', 'exam']).optional() }));
  const existing = await prisma.quizAttempt.findFirst({ where: { quizId: quiz.id, userId: uid, status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' } });
  if (existing) {
    const current = await finalizeIfExpired(existing);
    if (current.status === 'IN_PROGRESS') return res.status(200).json({ data: current, resumed: true });
  }
  const mode = input.mode ?? cfg.mode ?? 'practice';
  const attempt = await prisma.quizAttempt.create({
    data: {
      userId: uid,
      quizId: quiz.id,
      mode,
      deadlineAt: cfg.timed && cfg.durationMinutes ? new Date(Date.now() + cfg.durationMinutes * 60_000) : null,
    },
  });
  res.status(201).json({ data: attempt, resumed: false });
});

attemptsRouter.get('/', async (req, res) => {
  const q = query(req, z.object({ quizId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }));
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId: userId(req), quizId: q.quizId },
    orderBy: { startedAt: 'desc' },
    take: q.limit,
    include: { quiz: { select: { id: true, title: true, courseId: true, course: { select: { title: true } } } } },
  });
  res.json({ data: attempts });
});

attemptsRouter.get('/:id', async (req, res) => {
  const attempt = await finalizeIfExpired(await ownedAttempt(userId(req), param(req, 'id')));
  const questions = await prisma.quizQuestion.findMany({ where: { quizId: attempt.quizId }, orderBy: { ordinal: 'asc' } });
  const responses = await prisma.quizResponse.findMany({ where: { attemptId: attempt.id } });
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: attempt.quizId }, select: { id: true, title: true, configuration: true, origin: true, provider: true } });
  const revealAll = attempt.status !== 'IN_PROGRESS';
  res.json({
    data: {
      attempt,
      quiz,
      serverTime: new Date(),
      questions: questions.map((q) => {
        const r = responses.find((x) => x.questionId === q.id);
        // Mode entraînement : la correction d'une question déjà répondue est visible.
        const reveal = revealAll || (attempt.mode === 'practice' && !!r);
        return { ...(reveal ? fullQuestion(q) : publicQuestion(q)), response: r?.response ?? null, isCorrect: reveal ? (r?.isCorrect ?? null) : undefined };
      }),
    },
  });
});

// Enregistrement automatique d'une réponse.
attemptsRouter.post('/:id/responses', async (req, res) => {
  const uid = userId(req);
  const attempt = await finalizeIfExpired(await ownedAttempt(uid, param(req, 'id')));
  if (attempt.status !== 'IN_PROGRESS') throw conflict(attempt.status === 'EXPIRED' ? 'Le temps est écoulé : la tentative a été soumise.' : 'Cette tentative est déjà soumise.');
  const input = body(req, z.object({ questionId: z.string().uuid(), response: z.unknown() }));
  const question = await prisma.quizQuestion.findFirst({ where: { id: input.questionId, quizId: attempt.quizId } });
  if (!question) throw badRequest('Cette question ne fait pas partie du quiz.');
  const result = scoreResponse(question.questionType, question.correctAnswer, input.response);
  const practice = attempt.mode === 'practice';
  const saved = await prisma.quizResponse.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    create: { attemptId: attempt.id, questionId: question.id, response: (input.response ?? null) as Prisma.InputJsonValue, isCorrect: practice ? result.isCorrect : null, needsReview: practice && result.needsReview },
    update: { response: (input.response ?? null) as Prisma.InputJsonValue, answeredAt: new Date(), isCorrect: practice ? result.isCorrect : null },
  });
  res.json({
    data: practice
      ? { saved: true, answeredAt: saved.answeredAt, isCorrect: result.isCorrect, needsReview: result.needsReview || question.uncertain, correctAnswer: question.correctAnswer, explanation: question.explanation, sourceReference: question.sourceReference }
      : { saved: true, answeredAt: saved.answeredAt },
  });
});

attemptsRouter.post('/:id/submit', async (req, res) => {
  const attempt = await finalizeIfExpired(await ownedAttempt(userId(req), param(req, 'id')));
  if (attempt.status === 'IN_PROGRESS') await submitAttempt(attempt);
  res.json({ data: await attemptResults(attempt.id) });
});

attemptsRouter.get('/:id/results', async (req, res) => {
  const attempt = await finalizeIfExpired(await ownedAttempt(userId(req), param(req, 'id')));
  if (attempt.status === 'IN_PROGRESS') throw new AppError(403, 'ANSWERS_LOCKED', 'Soumettez la tentative pour voir les résultats.');
  res.json({ data: await attemptResults(attempt.id) });
});
