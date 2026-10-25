import type { QuizAttempt, QuizQuestion } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { scoreResponse } from '../../services/quiz-scoring';

export interface QuizConfig {
  mode?: 'practice' | 'exam';
  timed?: boolean;
  durationMinutes?: number | null;
  difficulty?: string;
  questionTypes?: string[];
  isMockExam?: boolean;
}

export const configOf = (c: unknown): QuizConfig => (c && typeof c === 'object' ? (c as QuizConfig) : {});

/** Question sans la réponse ni l'explication (mode examen, avant soumission). */
export function publicQuestion(q: QuizQuestion) {
  return {
    id: q.id,
    ordinal: q.ordinal,
    question: q.question,
    questionType: q.questionType,
    options: q.options,
    points: q.points,
    topic: q.topic,
    difficulty: q.difficulty,
  };
}

export function fullQuestion(q: QuizQuestion) {
  return { ...publicQuestion(q), correctAnswer: q.correctAnswer, explanation: q.explanation, sourceReference: q.sourceReference, uncertain: q.uncertain };
}

export async function submitAttempt(attempt: QuizAttempt, status: 'SUBMITTED' | 'EXPIRED' = 'SUBMITTED') {
  const questions = await prisma.quizQuestion.findMany({ where: { quizId: attempt.quizId } });
  const responses = await prisma.quizResponse.findMany({ where: { attemptId: attempt.id } });
  let score = 0;
  let maxScore = 0;
  const updates = [];
  for (const q of questions) {
    maxScore += q.points;
    const r = responses.find((x) => x.questionId === q.id);
    if (!r) continue;
    const result = scoreResponse(q.questionType, q.correctAnswer, r.response);
    score += result.credit * q.points;
    updates.push(prisma.quizResponse.update({ where: { id: r.id }, data: { isCorrect: result.isCorrect, needsReview: result.needsReview || q.uncertain } }));
  }
  await prisma.$transaction(updates);
  return prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: { status, completedAt: new Date(), score: Math.round(score * 100) / 100, maxScore },
  });
}

/** Une tentative minutée dont l'échéance est dépassée est soumise automatiquement. */
export async function finalizeIfExpired(attempt: QuizAttempt) {
  if (attempt.status === 'IN_PROGRESS' && attempt.deadlineAt && attempt.deadlineAt.getTime() + 5000 < Date.now()) {
    return submitAttempt(attempt, 'EXPIRED');
  }
  return attempt;
}

export async function attemptResults(attemptId: string) {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { quiz: { include: { questions: { orderBy: { ordinal: 'asc' } }, course: { select: { id: true, title: true } }, lesson: { select: { id: true, title: true } } } }, responses: true },
  });
  const items = attempt.quiz.questions.map((q) => {
    const r = attempt.responses.find((x) => x.questionId === q.id);
    return { ...fullQuestion(q), response: r?.response ?? null, isCorrect: r?.isCorrect ?? (r ? null : false), needsReview: r?.needsReview ?? false, answered: !!r };
  });
  const missed = items.filter((i) => i.isCorrect === false);
  const missedTopics = [...new Set(missed.map((m) => m.topic).filter(Boolean))] as string[];

  // Leçons à revoir : celles citées comme sources des questions manquées, sinon la leçon du quiz.
  const lessonIds = new Set<string>();
  for (const m of missed) {
    const ref = m.sourceReference as { lessonId?: string } | null;
    if (ref?.lessonId) lessonIds.add(ref.lessonId);
  }
  if (!lessonIds.size && attempt.quiz.lessonId && missed.length) lessonIds.add(attempt.quiz.lessonId);
  const suggestedLessons = lessonIds.size
    ? await prisma.lesson.findMany({ where: { id: { in: [...lessonIds] }, course: { userId: attempt.userId } }, select: { id: true, title: true, courseId: true } })
    : [];

  return {
    attempt: {
      id: attempt.id,
      quizId: attempt.quizId,
      mode: attempt.mode,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.maxScore ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100) : null,
    },
    quiz: { id: attempt.quiz.id, title: attempt.quiz.title, configuration: attempt.quiz.configuration, course: attempt.quiz.course, lesson: attempt.quiz.lesson, origin: attempt.quiz.origin, provider: attempt.quiz.provider },
    items,
    summary: {
      correct: items.filter((i) => i.isCorrect === true).length,
      incorrect: items.filter((i) => i.answered && i.isCorrect === false).length,
      toVerify: items.filter((i) => i.needsReview).length,
      unanswered: items.filter((i) => !i.answered).length,
      missedTopics,
    },
    suggestedLessons,
  };
}
