import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { ownedCourse, ownedSemester, tombstone } from '../../services/ownership';
import { storage, documentPrefix } from '../../services/storage';
import { body, pageArgs, pageMeta, pagination, param, query, userId } from '../../utils/http';
import { buildCourseTree, courseStats, presentCourse } from './courses.service';

export const coursesRouter = Router();

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hexadécimale attendue');
const courseSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Titre requis').max(160),
  code: z.string().trim().max(40).nullish(),
  faculty: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(4000).nullish(),
  color: color.nullish(),
  semesterId: z.string().uuid().nullish(),
  importance: z.number().int().min(1).max(5).optional(),
  confidence: z.number().int().min(1).max(5).nullish(),
});

const include = { semester: { include: { academicYear: true } } } as const;

coursesRouter.get('/', async (req, res) => {
  const q = query(
    req,
    pagination.extend({
      q: z.string().trim().max(100).optional(),
      semesterId: z.string().uuid().optional(),
      academicYearId: z.string().uuid().optional(),
      archived: z.enum(['true', 'false', 'all']).default('false'),
      sort: z.enum(['alpha', 'recent']).default('recent'),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  const where: Prisma.CourseWhereInput = {
    userId: userId(req),
    semesterId: q.semesterId,
    ...(q.academicYearId ? { semester: { academicYearId: q.academicYearId } } : {}),
    ...(q.archived === 'all' ? {} : { archivedAt: q.archived === 'true' ? { not: null } : null }),
    ...(q.q
      ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { faculty: { contains: q.q, mode: 'insensitive' } }] }
      : {}),
  };
  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    q.sort === 'alpha' ? [{ title: 'asc' }] : [{ lastOpenedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }];
  const [total, courses] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({ where, include, orderBy, ...pageArgs(q) }),
  ]);
  const stats = await courseStats(courses.map((c) => c.id));
  res.json({ data: courses.map((c) => presentCourse(c, stats.get(c.id))), meta: pageMeta(q, total) });
});

coursesRouter.post('/', async (req, res) => {
  const input = body(req, courseSchema);
  const uid = userId(req);
  if (input.semesterId) await ownedSemester(uid, input.semesterId);
  const course = await prisma.course.create({ data: { ...input, userId: uid }, include });
  res.status(201).json({ data: presentCourse(course, (await courseStats([course.id])).get(course.id)) });
});

coursesRouter.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  await ownedCourse(userId(req), id);
  const course = await prisma.course.update({ where: { id }, data: { lastOpenedAt: new Date() }, include });
  const [stats, tree] = await Promise.all([courseStats([id]), buildCourseTree(id)]);
  res.json({ data: { ...presentCourse(course, stats.get(id)), tree } });
});

coursesRouter.get('/:id/tree', async (req, res) => {
  const id = param(req, 'id');
  await ownedCourse(userId(req), id);
  res.json({ data: await buildCourseTree(id) });
});

/**
 * État de la base de connaissances d'un dossier : documents par mode d'ajout et par état,
 * volume de texte exploitable. La génération n'est possible que s'il y a du texte prêt.
 */
coursesRouter.get('/:id/knowledge-base', async (req, res) => {
  const uid = userId(req);
  const course = await ownedCourse(uid, param(req, 'id'));
  const [docs, chunks] = await Promise.all([
    prisma.document.findMany({ where: { courseId: course.id, userId: uid }, select: { id: true, source: true, processingStatus: true, pageCount: true, updatedAt: true } }),
    prisma.documentChunk.findMany({ where: { userId: uid, document: { courseId: course.id, processingStatus: 'READY' } }, select: { content: true } }),
  ]);
  const count = (pred: (d: (typeof docs)[number]) => boolean) => docs.filter(pred).length;
  const characters = chunks.reduce((n, c) => n + c.content.length, 0);
  res.json({
    data: {
      courseId: course.id,
      documents: docs.length,
      bySource: { file: count((d) => d.source === 'file'), scan: count((d) => d.source === 'scan'), text: count((d) => d.source === 'text') },
      ready: count((d) => d.processingStatus === 'READY'),
      processing: count((d) => ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(d.processingStatus)),
      failed: count((d) => d.processingStatus === 'FAILED'),
      pages: docs.reduce((n, d) => n + (d.pageCount ?? 0), 0),
      characters,
      passages: chunks.length,
      lastUpdatedAt: docs.length ? new Date(Math.max(...docs.map((d) => d.updatedAt.getTime()))) : null,
      // Même seuil que la génération (au moins ~80 caractères utiles).
      canGenerate: characters >= 80,
    },
  });
});

coursesRouter.patch('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  await ownedCourse(uid, id);
  const input = body(req, courseSchema.omit({ id: true }).partial().extend({ archived: z.boolean().optional() }));
  if (input.semesterId) await ownedSemester(uid, input.semesterId);
  const { archived, ...rest } = input;
  const course = await prisma.course.update({
    where: { id },
    data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
    include,
  });
  res.json({ data: presentCourse(course, (await courseStats([id])).get(id)) });
});

coursesRouter.delete('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  await ownedCourse(uid, id);
  // Les documents rattachés à la matière sont supprimés avec elle (fichiers compris).
  const docs = await prisma.document.findMany({ where: { courseId: id, userId: uid }, select: { id: true } });
  for (const d of docs) await storage.deletePrefix(documentPrefix(uid, d.id));
  await prisma.$transaction([prisma.document.deleteMany({ where: { courseId: id, userId: uid } }), prisma.course.delete({ where: { id } })]);
  await tombstone(uid, 'course', id);
  res.status(204).end();
});
