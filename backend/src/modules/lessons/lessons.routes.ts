import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedCourse, ownedFolder, ownedLesson, tombstone } from '../../services/ownership';
import { body, param, query, userId } from '../../utils/http';
import { badRequest } from '../../utils/errors';
import { folderBreadcrumb } from '../folders/folders.routes';

export const courseLessonsRouter = Router({ mergeParams: true });
export const lessonsRouter = Router();

const item = z.object({ title: z.string().trim().max(300), body: z.string().max(10_000) });
const lessonSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  description: z.string().trim().max(4000).nullish(),
  content: z.string().max(200_000).optional(),
  learningObjectives: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  definitions: z.array(item).max(100).optional(),
  formulas: z.array(item).max(100).optional(),
  examples: z.array(item).max(100).optional(),
  exercises: z.array(item).max(100).optional(),
  folderId: z.string().uuid().nullish(),
  estimatedMinutes: z.number().int().min(1).max(1000).nullish(),
  revisionDate: z.coerce.date().nullish(),
});

async function checkFolder(uid: string, courseId: string, folderId: string | null | undefined) {
  if (!folderId) return;
  const folder = await ownedFolder(uid, folderId);
  if (folder.courseId !== courseId) throw badRequest('Le dossier appartient à une autre matière.');
}

courseLessonsRouter.get('/', async (req, res) => {
  const courseId = param(req, 'courseId');
  await ownedCourse(userId(req), courseId);
  const q = query(req, z.object({ folderId: z.string().uuid().optional(), status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional() }));
  const lessons = await prisma.lesson.findMany({
    where: { courseId, folderId: q.folderId, status: q.status },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, description: true, folderId: true, status: true, sortOrder: true, estimatedMinutes: true, revisionDate: true, updatedAt: true, completedAt: true },
  });
  res.json({ data: lessons });
});

courseLessonsRouter.post('/', async (req, res) => {
  const courseId = param(req, 'courseId');
  const uid = userId(req);
  await ownedCourse(uid, courseId);
  const input = body(req, lessonSchema);
  await checkFolder(uid, courseId, input.folderId);
  const last = await prisma.lesson.aggregate({ where: { courseId, folderId: input.folderId ?? null }, _max: { sortOrder: true } });
  const lesson = await prisma.lesson.create({ data: { ...input, courseId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  res.status(201).json({ data: lesson });
});

courseLessonsRouter.post('/reorder', async (req, res) => {
  const courseId = param(req, 'courseId');
  await ownedCourse(userId(req), courseId);
  const input = body(req, z.object({ lessonIds: z.array(z.string().uuid()).min(1).max(500) }));
  const owned = await prisma.lesson.count({ where: { id: { in: input.lessonIds }, courseId } });
  if (owned !== input.lessonIds.length) throw badRequest('Certaines leçons ne font pas partie de cette matière.');
  await prisma.$transaction(input.lessonIds.map((id, i) => prisma.lesson.update({ where: { id }, data: { sortOrder: i } })));
  res.status(204).end();
});

lessonsRouter.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  await ownedLesson(uid, id);
  const lesson = await prisma.lesson.update({
    where: { id },
    data: { lastOpenedAt: new Date() },
    include: {
      course: { select: { id: true, title: true, color: true } },
      notes: { orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, updatedAt: true, documentId: true } },
      decks: { select: { id: true, title: true, origin: true, _count: { select: { cards: true } } } },
      quizzes: { select: { id: true, title: true, createdAt: true, configuration: true, _count: { select: { questions: true } } } },
      summaries: { select: { id: true, title: true, length: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      sessions: { where: { status: 'PLANNED' }, orderBy: { scheduledStart: 'asc' }, take: 5 },
    },
  });
  const breadcrumb = await folderBreadcrumb(lesson.folderId);
  res.json({ data: { ...lesson, breadcrumb } });
});

lessonsRouter.patch('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  const lesson = await ownedLesson(uid, id);
  const input = body(
    req,
    lessonSchema
      .omit({ id: true })
      .partial()
      .extend({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(), sortOrder: z.number().int().min(0).optional() }),
  );
  if (input.folderId !== undefined) await checkFolder(uid, lesson.courseId, input.folderId);
  const updated = await prisma.lesson.update({
    where: { id },
    data: {
      ...input,
      ...(input.status === 'COMPLETED' && lesson.status !== 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(input.status && input.status !== 'COMPLETED' ? { completedAt: null } : {}),
    },
  });
  res.json({ data: updated });
});

lessonsRouter.post('/:id/complete', async (req, res) => {
  const id = param(req, 'id');
  await ownedLesson(userId(req), id);
  const { completed } = body(req, z.object({ completed: z.boolean().default(true) }));
  const updated = await prisma.lesson.update({
    where: { id },
    data: completed ? { status: 'COMPLETED', completedAt: new Date() } : { status: 'IN_PROGRESS', completedAt: null },
  });
  res.json({ data: updated });
});

lessonsRouter.delete('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  await ownedLesson(uid, id);
  // Les documents et notes liés restent dans la matière (rattachement leçon retiré).
  await prisma.lesson.delete({ where: { id } });
  await tombstone(uid, 'lesson', id);
  res.status(204).end();
});
