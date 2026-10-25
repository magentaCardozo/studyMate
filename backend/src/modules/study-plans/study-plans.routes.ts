import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedCourse, ownedGoal, ownedLesson, ownedSession, tombstone } from '../../services/ownership';
import { generatePlan, localDate, type PlannerCourse, type Weekday } from '../../services/planner';
import { body, param, query, userId } from '../../utils/http';
import { badRequest } from '../../utils/errors';

export const goalsRouter = Router();
export const studySessionsRouter = Router();
export const studyPlansRouter = Router();
export const calendarRouter = Router();

// ───────────────────────────── Objectifs et examens ─────────────────────────────

const goalSchema = z.object({
  kind: z.enum(['exam', 'goal']).default('exam'),
  title: z.string().trim().min(1).max(200),
  courseId: z.string().uuid().nullish(),
  targetDate: z.coerce.date().nullish(),
  targetGrade: z.string().max(40).nullish(),
  status: z.enum(['active', 'done', 'cancelled']).optional(),
});

goalsRouter.get('/', async (req, res) => {
  const q = query(req, z.object({ upcoming: z.enum(['true', 'false']).optional() }));
  res.json({
    data: await prisma.studyGoal.findMany({
      where: { userId: userId(req), ...(q.upcoming === 'true' ? { status: 'active', targetDate: { gte: new Date() } } : {}) },
      include: { course: { select: { id: true, title: true, color: true } } },
      orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }],
    }),
  });
});

goalsRouter.post('/', async (req, res) => {
  const uid = userId(req);
  const input = body(req, goalSchema);
  if (input.courseId) await ownedCourse(uid, input.courseId);
  if (input.kind === 'exam' && !input.targetDate) throw badRequest("Indiquez la date de l'examen.");
  res.status(201).json({ data: await prisma.studyGoal.create({ data: { ...input, userId: uid }, include: { course: { select: { id: true, title: true } } } }) });
});

goalsRouter.patch('/:id', async (req, res) => {
  const uid = userId(req);
  const goal = await ownedGoal(uid, param(req, 'id'));
  const input = body(req, goalSchema.partial());
  if (input.courseId) await ownedCourse(uid, input.courseId);
  res.json({ data: await prisma.studyGoal.update({ where: { id: goal.id }, data: input }) });
});

goalsRouter.delete('/:id', async (req, res) => {
  const uid = userId(req);
  const goal = await ownedGoal(uid, param(req, 'id'));
  await prisma.studyGoal.delete({ where: { id: goal.id } });
  await tombstone(uid, 'goal', goal.id);
  res.status(204).end();
});

// ───────────────────────────── Sessions d'étude ─────────────────────────────

const include = { course: { select: { id: true, title: true, color: true } }, lesson: { select: { id: true, title: true } } } as const;
const activity = z.enum(['lesson', 'flashcards', 'quiz', 'mock_exam', 'summary', 'free']);

/** Les sessions planifiées dont l'heure est passée sans être faites deviennent « manquées ». */
async function markMissed(uid: string) {
  await prisma.studySession.updateMany({ where: { userId: uid, status: 'PLANNED', scheduledEnd: { lt: new Date(Date.now() - 60 * 60_000) } }, data: { status: 'MISSED' } });
}

studySessionsRouter.get('/', async (req, res) => {
  const uid = userId(req);
  await markMissed(uid);
  const q = query(
    req,
    z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      status: z.enum(['PLANNED', 'COMPLETED', 'SKIPPED', 'MISSED']).optional(),
      courseId: z.string().uuid().optional(),
    }),
  );
  res.json({
    data: await prisma.studySession.findMany({
      where: { userId: uid, status: q.status, courseId: q.courseId, scheduledStart: { gte: q.from, lte: q.to } },
      include,
      orderBy: { scheduledStart: 'asc' },
      take: 500,
    }),
  });
});

studySessionsRouter.post('/', async (req, res) => {
  const uid = userId(req);
  const input = body(
    req,
    z.object({
      id: z.string().uuid().optional(),
      courseId: z.string().uuid(),
      lessonId: z.string().uuid().nullish(),
      scheduledStart: z.coerce.date(),
      scheduledEnd: z.coerce.date(),
      activityType: activity.default('free'),
      objective: z.string().max(500).nullish(),
    }),
  );
  await ownedCourse(uid, input.courseId);
  if (input.lessonId) {
    const l = await ownedLesson(uid, input.lessonId);
    if (l.courseId !== input.courseId) throw badRequest('La leçon ne fait pas partie de cette matière.');
  }
  if (input.scheduledEnd <= input.scheduledStart) throw badRequest('La fin doit être postérieure au début.');
  res.status(201).json({ data: await prisma.studySession.create({ data: { ...input, userId: uid, origin: 'manual' }, include }) });
});

studySessionsRouter.patch('/:id', async (req, res) => {
  const uid = userId(req);
  const session = await ownedSession(uid, param(req, 'id'));
  const input = body(
    req,
    z.object({
      scheduledStart: z.coerce.date().optional(),
      scheduledEnd: z.coerce.date().optional(),
      status: z.enum(['PLANNED', 'COMPLETED', 'SKIPPED']).optional(),
      objective: z.string().max(500).nullish(),
      activityType: activity.optional(),
    }),
  );
  const start = input.scheduledStart ?? session.scheduledStart;
  const end = input.scheduledEnd ?? (input.scheduledStart ? new Date(start.getTime() + (session.scheduledEnd.getTime() - session.scheduledStart.getTime())) : session.scheduledEnd);
  if (end <= start) throw badRequest('La fin doit être postérieure au début.');
  const rescheduled = input.scheduledStart && input.scheduledStart.getTime() !== session.scheduledStart.getTime();
  const updated = await prisma.studySession.update({
    where: { id: session.id },
    data: {
      ...input,
      scheduledStart: start,
      scheduledEnd: end,
      // Une session replanifiée par l'étudiant devient « manuelle » et n'est plus écrasée par le planificateur.
      ...(rescheduled ? { origin: 'manual', status: input.status ?? 'PLANNED' } : {}),
      ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : input.status ? { completedAt: null } : {}),
    },
    include,
  });
  if (input.status === 'COMPLETED' && session.lessonId && session.activityType === 'lesson') {
    await prisma.lesson.updateMany({ where: { id: session.lessonId, status: 'NOT_STARTED' }, data: { status: 'IN_PROGRESS' } });
  }
  res.json({ data: updated });
});

studySessionsRouter.delete('/:id', async (req, res) => {
  const uid = userId(req);
  const s = await ownedSession(uid, param(req, 'id'));
  await prisma.studySession.delete({ where: { id: s.id } });
  await tombstone(uid, 'session', s.id);
  res.status(204).end();
});

// ───────────────────────────── Programme de révision ─────────────────────────────

studyPlansRouter.post('/generate', async (req, res) => {
  const uid = userId(req);
  const input = body(
    req,
    z.object({
      courseIds: z.array(z.string().uuid()).max(30).optional(),
      preview: z.boolean().default(true),
      horizonDays: z.number().int().min(1).max(60).default(14),
    }),
  );
  await markMissed(uid);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid } });
  const settings = (user.settings ?? {}) as { availability?: Partial<Record<Weekday, number>>; preferredSessionMinutes?: number; preferredStartTime?: string };
  const now = new Date();
  const exams = await prisma.studyGoal.findMany({ where: { userId: uid, kind: 'exam', status: 'active', targetDate: { gt: now }, courseId: { not: null } } });
  let courseIds = input.courseIds?.length ? input.courseIds : [...new Set(exams.map((e) => e.courseId!))];
  if (!courseIds.length) {
    throw badRequest("Ajoutez une date d'examen pour au moins une matière, ou choisissez les matières à réviser.", undefined, 'NO_PLAN_TARGET');
  }
  for (const id of courseIds) await ownedCourse(uid, id);
  courseIds = [...new Set(courseIds)];

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds }, userId: uid },
    include: { lessons: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, status: true, estimatedMinutes: true } } },
  });
  const plannerCourses: PlannerCourse[] = [];
  for (const c of courses) {
    const attempts = await prisma.quizAttempt.findMany({ where: { userId: uid, quiz: { courseId: c.id }, status: { not: 'IN_PROGRESS' }, maxScore: { gt: 0 } }, orderBy: { completedAt: 'desc' }, take: 5 });
    const avg = attempts.length ? attempts.reduce((n, a) => n + (a.score ?? 0) / (a.maxScore ?? 1), 0) / attempts.length : null;
    const [difficultCards, dueCards] = await Promise.all([
      prisma.flashcard.count({ where: { deck: { userId: uid, courseId: c.id }, OR: [{ lapses: { gt: 0 } }, { easeFactor: { lt: 2.2 } }] } }),
      prisma.flashcard.count({ where: { deck: { userId: uid, courseId: c.id }, dueAt: { lte: now } } }),
    ]);
    const exam = exams.filter((e) => e.courseId === c.id).sort((a, b) => a.targetDate!.getTime() - b.targetDate!.getTime())[0];
    plannerCourses.push({
      id: c.id,
      title: c.title,
      importance: c.importance,
      confidence: c.confidence,
      examDate: exam?.targetDate ?? null,
      lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, completed: l.status === 'COMPLETED', estimatedMinutes: l.estimatedMinutes })),
      avgQuizScore: avg,
      difficultCards,
      dueCards,
    });
  }

  // Sessions manuelles à venir : leur durée est retirée de la disponibilité du jour.
  const manual = await prisma.studySession.findMany({ where: { userId: uid, status: 'PLANNED', origin: 'manual', scheduledStart: { gte: now } } });
  const busyMinutes: Record<string, number> = {};
  for (const m of manual) {
    const d = localDate(m.scheduledStart, user.timezone);
    busyMinutes[d] = (busyMinutes[d] ?? 0) + (m.scheduledEnd.getTime() - m.scheduledStart.getTime()) / 60_000;
  }
  const plan = generatePlan({
    now,
    timezone: user.timezone,
    availability: settings.availability ?? { mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 180, sun: 60 },
    sessionMinutes: settings.preferredSessionMinutes ?? 45,
    startTime: settings.preferredStartTime ?? '18:00',
    courses: plannerCourses,
    busyMinutes,
    horizonDays: input.horizonDays,
  });
  const missed = await prisma.studySession.count({ where: { userId: uid, status: 'MISSED', courseId: { in: courseIds } } });
  const titles = new Map(courses.map((c) => [c.id, c.title]));
  const lessonTitles = new Map(courses.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)));
  const summary = {
    sessionCount: plan.length,
    totalMinutes: plan.reduce((n, s) => n + (s.scheduledEnd.getTime() - s.scheduledStart.getTime()) / 60_000, 0),
    missedSessions: missed,
    courses: plannerCourses.map((c) => ({ id: c.id, title: c.title, examDate: c.examDate, sessions: plan.filter((s) => s.courseId === c.id).length, remainingLessons: c.lessons.filter((l) => !l.completed).length })),
    note: plan.length ? null : "Aucune disponibilité n'a été trouvée avant les examens. Augmentez votre temps d'étude dans les paramètres.",
  };

  if (input.preview) {
    return res.json({
      data: {
        preview: true,
        summary,
        sessions: plan.map((s) => ({ ...s, course: { id: s.courseId, title: titles.get(s.courseId) }, lesson: s.lessonId ? { id: s.lessonId, title: lessonTitles.get(s.lessonId) } : null })),
      },
    });
  }

  // Acceptation : remplace les sessions futures générées pour ces matières (les sessions manuelles et terminées sont conservées).
  await prisma.$transaction([
    prisma.studySession.deleteMany({ where: { userId: uid, origin: 'plan', status: 'PLANNED', courseId: { in: courseIds }, scheduledStart: { gte: now } } }),
    prisma.studySession.createMany({ data: plan.map((s) => ({ ...s, userId: uid, origin: 'plan' })) }),
  ]);
  const saved = await prisma.studySession.findMany({ where: { userId: uid, origin: 'plan', status: 'PLANNED', courseId: { in: courseIds }, scheduledStart: { gte: now } }, include, orderBy: { scheduledStart: 'asc' } });
  res.status(201).json({ data: { preview: false, summary, sessions: saved } });
});

// ───────────────────────────── Calendrier ─────────────────────────────

calendarRouter.get('/', async (req, res) => {
  const uid = userId(req);
  await markMissed(uid);
  const q = query(req, z.object({ from: z.coerce.date(), to: z.coerce.date() }));
  if (q.to.getTime() - q.from.getTime() > 100 * 86400_000) throw badRequest('Période trop longue (100 jours maximum).');
  const [sessions, exams, revisions] = await Promise.all([
    prisma.studySession.findMany({ where: { userId: uid, scheduledStart: { gte: q.from, lte: q.to } }, include, orderBy: { scheduledStart: 'asc' } }),
    prisma.studyGoal.findMany({ where: { userId: uid, targetDate: { gte: q.from, lte: q.to } }, include: { course: { select: { id: true, title: true, color: true } } } }),
    prisma.lesson.findMany({ where: { course: { userId: uid }, revisionDate: { gte: q.from, lte: q.to } }, select: { id: true, title: true, revisionDate: true, course: { select: { id: true, title: true, color: true } } } }),
  ]);
  res.json({ data: { sessions, exams, revisions } });
});
