import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { body, userId } from '../../utils/http';
import { badRequest } from '../../utils/errors';
import { configOf, finalizeIfExpired } from '../quizzes/quizzes.service';

/**
 * Onglet « Révisions » : on n'y génère rien, on y termine et on y rattrape.
 *   - QCM à terminer : tentative en cours, ou QCM jamais commencé ;
 *   - questions ratées : la dernière réponse donnée à la question est fausse ;
 *   - flash-cards à réviser (répétition espacée).
 */
export const reviewRouter = Router();

interface Mistake {
  questionId: string;
  question: string;
  questionType: string;
  quiz: { id: string; title: string };
  course: { id: string; title: string } | null;
  wrongCount: number;
  lastAnsweredAt: Date;
}

/** Questions dont la dernière réponse (question d'origine ou ses copies) est fausse. */
export async function currentMistakes(uid: string): Promise<Mistake[]> {
  const responses = await prisma.quizResponse.findMany({
    where: { attempt: { userId: uid }, isCorrect: { not: null } },
    orderBy: { answeredAt: 'desc' },
    take: 5000,
    select: {
      isCorrect: true,
      answeredAt: true,
      question: {
        select: {
          id: true,
          originQuestionId: true,
          question: true,
          questionType: true,
          quiz: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
        },
      },
    },
  });
  const byRoot = new Map<string, { latest: (typeof responses)[number]; wrong: number }>();
  for (const r of responses) {
    const root = r.question.originQuestionId ?? r.question.id;
    const entry = byRoot.get(root);
    if (!entry) byRoot.set(root, { latest: r, wrong: r.isCorrect ? 0 : 1 });
    else if (!r.isCorrect) entry.wrong += 1;
  }
  const roots = [...byRoot.entries()].filter(([, e]) => e.latest.isCorrect === false);
  // La question d'origine sert de référence (QCM et dossier d'origine) quand elle existe encore.
  const originals = await prisma.quizQuestion.findMany({
    where: { id: { in: roots.map(([id]) => id) }, quiz: { userId: uid } },
    select: { id: true, question: true, questionType: true, quiz: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } },
  });
  return roots.map(([rootId, e]) => {
    const q = originals.find((o) => o.id === rootId) ?? e.latest.question;
    return {
      questionId: q.id,
      question: q.question,
      questionType: q.questionType,
      quiz: { id: q.quiz.id, title: q.quiz.title },
      course: q.quiz.course,
      wrongCount: e.wrong,
      lastAnsweredAt: e.latest.answeredAt,
    };
  });
}

reviewRouter.get('/', async (req, res) => {
  const uid = userId(req);
  const quizzes = await prisma.quiz.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      origin: true,
      configuration: true,
      createdAt: true,
      course: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
      attempts: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });
  const toFinish = [];
  for (const q of quizzes) {
    const last = q.attempts[0] ? await finalizeIfExpired(q.attempts[0]) : null;
    if (last && last.status !== 'IN_PROGRESS') continue;
    const answered = last ? await prisma.quizResponse.count({ where: { attemptId: last.id } }) : 0;
    const cfg = configOf(q.configuration);
    toFinish.push({
      quizId: q.id,
      title: q.title,
      course: q.course,
      isMockExam: !!cfg.isMockExam,
      isReview: q.origin === 'review',
      totalQuestions: q._count.questions,
      status: last ? 'in_progress' : 'not_started',
      attemptId: last?.id ?? null,
      answered,
      startedAt: last?.startedAt ?? null,
      deadlineAt: last?.deadlineAt ?? null,
      createdAt: q.createdAt,
    });
  }
  // Tentatives en cours d'abord, puis QCM jamais commencés.
  toFinish.sort((a, b) => (a.status === b.status ? 0 : a.status === 'in_progress' ? -1 : 1));

  const now = new Date();
  const [mistakes, dueCards, newCards] = await Promise.all([
    currentMistakes(uid),
    prisma.flashcard.count({ where: { deck: { userId: uid }, dueAt: { lte: now }, repetitions: { gt: 0 } } }),
    prisma.flashcard.count({ where: { deck: { userId: uid }, repetitions: 0, lastReviewedAt: null } }),
  ]);
  res.json({ data: { toFinish, mistakes, cards: { due: dueCards, new: newCards } } });
});

/**
 * Crée un QCM d'entraînement avec les questions ratées (toutes, celles d'un dossier ou une
 * sélection). Les copies gardent le lien vers la question d'origine : une bonne réponse la
 * retire de la liste « à revoir ».
 */
reviewRouter.post('/mistakes-quiz', async (req, res) => {
  const uid = userId(req);
  const input = body(req, z.object({ courseId: z.string().uuid().optional(), questionIds: z.array(z.string().uuid()).max(100).optional() }));
  let mistakes = await currentMistakes(uid);
  if (input.courseId) mistakes = mistakes.filter((m) => m.course?.id === input.courseId);
  if (input.questionIds?.length) mistakes = mistakes.filter((m) => input.questionIds!.includes(m.questionId));
  if (!mistakes.length) throw badRequest('Aucune question ratée à retravailler.', undefined, 'NO_MISTAKES');
  const questions = await prisma.quizQuestion.findMany({ where: { id: { in: mistakes.slice(0, 100).map((m) => m.questionId) }, quiz: { userId: uid } } });
  const courses = [...new Map(mistakes.filter((m) => m.course).map((m) => [m.course!.id, m.course!.title])).values()];
  const scope = courses.length === 1 ? courses[0] : courses.length ? `${courses.length} dossiers` : 'mes QCM';
  // Un QCM de rattrapage précédent auquel on n'a encore rien répondu est remplacé (pas d'accumulation).
  const stale = await prisma.quiz.findMany({ where: { userId: uid, origin: 'review', attempts: { none: { responses: { some: {} } } } }, select: { id: true } });
  if (stale.length) await prisma.quiz.deleteMany({ where: { id: { in: stale.map((q) => q.id) } } });
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date());
  const quiz = await prisma.quiz.create({
    data: {
      userId: uid,
      // Hors dossier : ce QCM de rattrapage n'apparaît pas dans le sous-dossier QCM d'un cours.
      courseId: null,
      title: `Questions ratées — ${scope} (${date})`,
      origin: 'review',
      configuration: { mode: 'practice', timed: false, isReview: true } as Prisma.InputJsonValue,
      questions: {
        create: questions.map((q, i) => ({
          ordinal: i,
          question: q.question,
          questionType: q.questionType,
          options: q.options as Prisma.InputJsonValue,
          correctAnswer: q.correctAnswer as Prisma.InputJsonValue,
          explanation: q.explanation,
          sourceReference: (q.sourceReference ?? undefined) as Prisma.InputJsonValue | undefined,
          difficulty: q.difficulty,
          topic: q.topic,
          points: q.points,
          uncertain: q.uncertain,
          originQuestionId: q.originQuestionId ?? q.id,
        })),
      },
    },
  });
  res.status(201).json({ data: { id: quiz.id, title: quiz.title, questions: questions.length } });
});
