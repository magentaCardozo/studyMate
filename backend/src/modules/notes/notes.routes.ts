import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { ownedDocument, ownedNote, resolvePlacement, tombstone } from '../../services/ownership';
import { body, pageArgs, pageMeta, pagination, param, query, userId } from '../../utils/http';
import { conflict } from '../../utils/errors';

export const notesRouter = Router();

const noteSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  content: z.string().max(200_000).default(''),
  courseId: z.string().uuid().nullish(),
  folderId: z.string().uuid().nullish(),
  lessonId: z.string().uuid().nullish(),
  documentId: z.string().uuid().nullish(),
});

const include = {
  course: { select: { id: true, title: true } },
  folder: { select: { id: true, name: true } },
  lesson: { select: { id: true, title: true } },
  document: { select: { id: true, fileName: true } },
} as const;

notesRouter.get('/', async (req, res) => {
  const q = query(
    req,
    pagination.extend({
      courseId: z.string().uuid().optional(),
      folderId: z.string().uuid().optional(),
      lessonId: z.string().uuid().optional(),
      documentId: z.string().uuid().optional(),
      q: z.string().trim().max(100).optional(),
    }),
  );
  const where: Prisma.NoteWhereInput = {
    userId: userId(req),
    courseId: q.courseId,
    folderId: q.folderId,
    lessonId: q.lessonId,
    documentId: q.documentId,
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { content: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [total, notes] = await Promise.all([
    prisma.note.count({ where }),
    prisma.note.findMany({ where, include, orderBy: { updatedAt: 'desc' }, ...pageArgs(q) }),
  ]);
  res.json({ data: notes, meta: pageMeta(q, total) });
});

notesRouter.post('/', async (req, res) => {
  const uid = userId(req);
  const input = body(req, noteSchema);
  let placement = await resolvePlacement(uid, input);
  if (input.documentId) {
    const doc = await ownedDocument(uid, input.documentId);
    if (!placement.courseId) placement = { courseId: doc.courseId, folderId: doc.folderId, lessonId: null };
  }
  const note = await prisma.note.create({
    data: { ...(input.id ? { id: input.id } : {}), userId: uid, title: input.title, content: input.content, documentId: input.documentId ?? null, ...placement },
    include,
  });
  res.status(201).json({ data: note });
});

notesRouter.get('/:id', async (req, res) => {
  const note = await ownedNote(userId(req), param(req, 'id'));
  res.json({ data: await prisma.note.findUnique({ where: { id: note.id }, include }) });
});

notesRouter.patch('/:id', async (req, res) => {
  const uid = userId(req);
  const note = await ownedNote(uid, param(req, 'id'));
  const input = body(req, noteSchema.omit({ id: true }).partial().extend({ baseUpdatedAt: z.coerce.date().optional() }));
  // Détection de conflit : la note a été modifiée ailleurs depuis la version de base du client.
  if (input.baseUpdatedAt && note.updatedAt.getTime() > input.baseUpdatedAt.getTime() + 1) {
    throw conflict('Cette note a été modifiée sur un autre appareil.', { server: note });
  }
  const moving = input.courseId !== undefined || input.folderId !== undefined || input.lessonId !== undefined;
  const placement = moving
    ? await resolvePlacement(uid, {
        courseId: input.courseId === undefined ? note.courseId : input.courseId,
        folderId: input.folderId === undefined ? note.folderId : input.folderId,
        lessonId: input.lessonId === undefined ? note.lessonId : input.lessonId,
      })
    : {};
  if (input.documentId) await ownedDocument(uid, input.documentId);
  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { title: input.title, content: input.content, documentId: input.documentId, ...placement },
    include,
  });
  res.json({ data: updated });
});

notesRouter.delete('/:id', async (req, res) => {
  const uid = userId(req);
  const note = await ownedNote(uid, param(req, 'id'));
  await prisma.note.delete({ where: { id: note.id } });
  await tombstone(uid, 'note', note.id);
  res.status(204).end();
});
