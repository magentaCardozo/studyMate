import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedCourse } from '../../services/ownership';
import { isMastered } from '../../services/srs';
import { localDate } from '../../services/planner';
import { param, query, userId } from '../../utils/http';

export const progressRouter = Router();
export const dashboardRouter = Router();

const pct = (score: number | null, max: number | null) => (max ? Math.round(((score ?? 0) / max) * 100) : null);

/** Tous les indicateurs sont calculés à partir des activités réellement enregistrées. */
progressRouter.get('/overview', async (req, res) => {
  const uid = userId(req);
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const since7 = new Date(Date.now() - 7 * 86400_000);
  const [courses, lessons, completedLessons, attempts, reviews7, sessionsPast, sessionsDone, cards, mastered] = await Promise.all([
    prisma.course.count({ where: { userId: uid, archivedAt: null } }),
    prisma.lesson.count({ where: { course: { userId: uid, archivedAt: null } } }),
    prisma.lesson.count({ where: { course: { userId: uid, archivedAt: null }, status: 'COMPLETED' } }),
    prisma.quizAttempt.findMany({ where: { userId: uid, status: { not: 'IN_PROGRESS' }, completedAt: { gte: since30 } }, select: { score: true, maxScore: true } }),
    prisma.flashcardReview.count({ where: { userId: uid, reviewedAt: { gte: since7 } } }),
    prisma.studySession.count({ where: { userId: uid, scheduledStart: { gte: since30, lte: new Date() } } }),
    prisma.studySession.count({ where: { userId: uid, status: 'COMPLETED', scheduledStart: { gte: since30 } } }),
    prisma.flashcard.count({ where: { deck: { userId: uid } } }),
    prisma.flashcard.count({ where: { deck: { userId: uid }, intervalDays: { gte: 21 } } }),
  ]);
  const scored = attempts.filter((a) => a.maxScore);
  res.json({
    data: {
      courses,
      lessons: { total: lessons, completed: completedLessons },
      quizzes: { attemptsLast30Days: attempts.length, averageLast30Days: scored.length ? Math.round(scored.reduce((n, a) => n + (a.score ?? 0) / a.maxScore!, 0) / scored.length * 100) : null },
      flashcards: { total: cards, mastered, reviewsLast7Days: reviews7 },
      sessions: { plannedLast30Days: sessionsPast, completedLast30Days: sessionsDone },
    },
  });
});

progressRouter.get('/courses', async (req, res) => {
  const uid = userId(req);
  const courses = await prisma.course.findMany({ where: { userId: uid, archivedAt: null }, select: { id: true, title: true, color: true }, orderBy: { title: 'asc' } });
  const data = [];
  for (const c of courses) {
    const [total, done, attempts] = await Promise.all([
      prisma.lesson.count({ where: { courseId: c.id } }),
      prisma.lesson.count({ where: { courseId: c.id, status: 'COMPLETED' } }),
      prisma.quizAttempt.findMany({ where: { userId: uid, quiz: { courseId: c.id }, status: { not: 'IN_PROGRESS' }, maxScore: { gt: 0 } }, orderBy: { completedAt: 'desc' }, take: 10, select: { score: true, maxScore: true } }),
    ]);
    data.push({
      ...c,
      lessons: { total, completed: done, progress: total ? Math.round((done / total) * 100) : null },
      quizAverage: attempts.length ? Math.round((attempts.reduce((n, a) => n + (a.score ?? 0) / a.maxScore!, 0) / attempts.length) * 100) : null,
      quizAttempts: attempts.length,
    });
  }
  res.json({ data });
});

progressRouter.get('/courses/:id', async (req, res) => {
  const uid = userId(req);
  const course = await ownedCourse(uid, param(req, 'id'));
  const [lessons, attempts, wrong, cards, sessions] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId: course.id }, select: { id: true, title: true, status: true, revisionDate: true, completedAt: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.quizAttempt.findMany({ where: { userId: uid, quiz: { courseId: course.id }, status: { not: 'IN_PROGRESS' } }, orderBy: { completedAt: 'asc' }, select: { id: true, score: true, maxScore: true, completedAt: true, quiz: { select: { title: true, lessonId: true } } } }),
    prisma.quizResponse.findMany({ where: { isCorrect: false, attempt: { userId: uid, quiz: { courseId: course.id } } }, select: { question: { select: { topic: true, sourceReference: true } } } }),
    prisma.flashcard.findMany({ where: { deck: { userId: uid, courseId: course.id } }, select: { intervalDays: true, lapses: true, dueAt: true } }),
    prisma.studySession.groupBy({ by: ['status'], where: { userId: uid, courseId: course.id }, _count: true }),
  ]);
  const topicCounts = new Map<string, number>();
  for (const w of wrong) if (w.question.topic) topicCounts.set(w.question.topic, (topicCounts.get(w.question.topic) ?? 0) + 1);
  // Leçons à revoir : quiz associé < 60 %, ou date de révision passée.
  const weakLessons = new Set(attempts.filter((a) => a.quiz.lessonId && (pct(a.score, a.maxScore) ?? 100) < 60).map((a) => a.quiz.lessonId!));
  const now = new Date();
  res.json({
    data: {
      course: { id: course.id, title: course.title },
      lessons: { total: lessons.length, completed: lessons.filter((l) => l.status === 'COMPLETED').length, inProgress: lessons.filter((l) => l.status === 'IN_PROGRESS').length },
      quizTrend: attempts.map((a) => ({ id: a.id, date: a.completedAt, percentage: pct(a.score, a.maxScore), title: a.quiz.title })),
      frequentlyMissed: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count })),
      lessonsToRevisit: lessons.filter((l) => weakLessons.has(l.id) || (l.revisionDate && l.revisionDate < now && l.status !== 'COMPLETED')).map((l) => ({ id: l.id, title: l.title })),
      flashcards: { total: cards.length, mastered: cards.filter((c) => isMastered(c.intervalDays)).length, due: cards.filter((c) => c.dueAt <= now).length, difficult: cards.filter((c) => c.lapses > 0).length },
      sessions: Object.fromEntries(sessions.map((s) => [s.status, s._count])),
    },
  });
});

progressRouter.get('/history', async (req, res) => {
  const uid = userId(req);
  const { days } = query(req, z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { timezone: true } });
  const since = new Date(Date.now() - days * 86400_000);
  const [reviews, attempts, sessions] = await Promise.all([
    prisma.flashcardReview.findMany({ where: { userId: uid, reviewedAt: { gte: since } }, select: { reviewedAt: true } }),
    prisma.quizAttempt.findMany({ where: { userId: uid, completedAt: { gte: since } }, select: { completedAt: true, score: true, maxScore: true } }),
    prisma.studySession.findMany({ where: { userId: uid, status: 'COMPLETED', completedAt: { gte: since } }, select: { completedAt: true, scheduledStart: true, scheduledEnd: true } }),
  ]);
  const byDay = new Map<string, { date: string; reviews: number; quizzes: number; sessions: number; studyMinutes: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = localDate(new Date(Date.now() - i * 86400_000), user.timezone);
    byDay.set(d, { date: d, reviews: 0, quizzes: 0, sessions: 0, studyMinutes: 0 });
  }
  for (const r of reviews) { const e = byDay.get(localDate(r.reviewedAt, user.timezone)); if (e) e.reviews++; }
  for (const a of attempts) { const e = byDay.get(localDate(a.completedAt!, user.timezone)); if (e) e.quizzes++; }
  for (const s of sessions) {
    const e = byDay.get(localDate(s.completedAt!, user.timezone));
    if (e) { e.sessions++; e.studyMinutes += Math.round((s.scheduledEnd.getTime() - s.scheduledStart.getTime()) / 60_000); }
  }
  res.json({ data: [...byDay.values()] });
});

progressRouter.get('/deadlines', async (req, res) => {
  const uid = userId(req);
  const in30 = new Date(Date.now() + 30 * 86400_000);
  const [exams, sessions] = await Promise.all([
    prisma.studyGoal.findMany({ where: { userId: uid, status: 'active', targetDate: { gte: new Date(), lte: in30 } }, include: { course: { select: { id: true, title: true } } }, orderBy: { targetDate: 'asc' } }),
    prisma.studySession.findMany({ where: { userId: uid, status: 'PLANNED', scheduledStart: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400_000) } }, include: { course: { select: { id: true, title: true } } }, orderBy: { scheduledStart: 'asc' } }),
  ]);
  res.json({ data: { exams, sessions } });
});

// ───────────────────────────── Tableau de bord ─────────────────────────────

dashboardRouter.get('/', async (req, res) => {
  const uid = userId(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { name: true, timezone: true } });
  const now = new Date();
  const today = localDate(now, user.timezone);
  const startOfDay = new Date(now.getTime() - 14 * 3600_000);
  const endOfDay = new Date(now.getTime() + 24 * 3600_000);
  const [todaySessions, lastLesson, lastDocument, openAttempt, courses, exams, recentDocuments, dueCards, recentAttempts, recentReviews, lessonsCompleted, coursesCount] = await Promise.all([
    prisma.studySession.findMany({ where: { userId: uid, scheduledStart: { gte: startOfDay, lte: endOfDay } }, include: { course: { select: { id: true, title: true, color: true } }, lesson: { select: { id: true, title: true } } }, orderBy: { scheduledStart: 'asc' } }),
    prisma.lesson.findFirst({ where: { course: { userId: uid, archivedAt: null }, lastOpenedAt: { not: null }, status: { not: 'COMPLETED' } }, orderBy: { lastOpenedAt: 'desc' }, select: { id: true, title: true, status: true, lastOpenedAt: true, course: { select: { id: true, title: true } } } }),
    prisma.document.findFirst({ where: { userId: uid, lastOpenedAt: { not: null } }, orderBy: { lastOpenedAt: 'desc' }, select: { id: true, fileName: true, lastOpenedAt: true, course: { select: { id: true, title: true } } } }),
    prisma.quizAttempt.findFirst({ where: { userId: uid, status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' }, select: { id: true, startedAt: true, deadlineAt: true, quiz: { select: { id: true, title: true } } } }),
    prisma.course.findMany({ where: { userId: uid, archivedAt: null }, orderBy: [{ lastOpenedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 4, select: { id: true, title: true, code: true, color: true, isDemo: true, lastOpenedAt: true, semester: { select: { name: true } }, _count: { select: { lessons: true, documents: true, folders: true } } } }),
    prisma.studyGoal.findMany({ where: { userId: uid, kind: 'exam', status: 'active', targetDate: { gte: now } }, orderBy: { targetDate: 'asc' }, take: 5, include: { course: { select: { id: true, title: true } } } }),
    prisma.document.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, fileName: true, mimeType: true, processingStatus: true, createdAt: true, course: { select: { id: true, title: true } } } }),
    prisma.flashcard.count({ where: { deck: { userId: uid }, dueAt: { lte: now } } }),
    prisma.quizAttempt.findMany({ where: { userId: uid, status: { not: 'IN_PROGRESS' } }, orderBy: { completedAt: 'desc' }, take: 5, select: { id: true, score: true, maxScore: true, completedAt: true, quiz: { select: { title: true, course: { select: { title: true } } } } } }),
    prisma.flashcardReview.count({ where: { userId: uid, reviewedAt: { gte: new Date(now.getTime() - 86400_000) } } }),
    prisma.lesson.findMany({ where: { course: { userId: uid }, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 5, select: { id: true, title: true, completedAt: true, course: { select: { title: true } } } }),
    prisma.course.count({ where: { userId: uid, archivedAt: null } }),
  ]);

  const recommendations: { type: string; title: string; description: string; link: string }[] = [];
  if (dueCards > 0) recommendations.push({ type: 'flashcards', title: `${dueCards} carte${dueCards > 1 ? 's' : ''} à réviser`, description: 'Une courte session maintient vos acquis en mémoire.', link: '/revision/study' });
  const nextExam = exams[0];
  if (nextExam) {
    const planned = await prisma.studySession.count({ where: { userId: uid, status: 'PLANNED', courseId: nextExam.courseId ?? undefined, scheduledStart: { gte: now } } });
    if (!planned) recommendations.push({ type: 'plan', title: 'Planifier vos révisions', description: `Aucune session prévue avant « ${nextExam.title} ».`, link: '/coach' });
  }
  const weak = recentAttempts.find((a) => a.maxScore && (a.score ?? 0) / a.maxScore < 0.6);
  if (weak) recommendations.push({ type: 'quiz', title: 'Revoir vos erreurs', description: `Résultat de ${pct(weak.score, weak.maxScore)} % à « ${weak.quiz.title} ».`, link: `/revision/attempts/${weak.id}` });

  const activity = [
    ...recentAttempts.map((a) => ({ type: 'quiz', date: a.completedAt, label: `Quiz « ${a.quiz.title} » — ${pct(a.score, a.maxScore) ?? '–'} %` })),
    ...lessonsCompleted.map((l) => ({ type: 'lesson', date: l.completedAt, label: `Leçon terminée : ${l.title}` })),
    ...recentDocuments.map((d) => ({ type: 'document', date: d.createdAt, label: `Document importé : ${d.fileName}` })),
  ]
    .filter((a) => a.date)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime())
    .slice(0, 8);

  res.json({
    data: {
      firstName: user.name.split(' ')[0],
      today,
      todaySessions: todaySessions.filter((s) => localDate(s.scheduledStart, user.timezone) === today),
      continueLearning: openAttempt
        ? { type: 'quiz_attempt', id: openAttempt.id, title: openAttempt.quiz.title, subtitle: 'Quiz en cours' }
        : lastLesson
          ? { type: 'lesson', id: lastLesson.id, title: lastLesson.title, subtitle: lastLesson.course.title }
          : lastDocument
            ? { type: 'document', id: lastDocument.id, title: lastDocument.fileName, subtitle: lastDocument.course?.title ?? 'Non classé' }
            : null,
      courses,
      coursesCount,
      exams,
      recentDocuments,
      dueCards,
      reviewsLast24h: recentReviews,
      recommendations,
      activity,
    },
  });
});
