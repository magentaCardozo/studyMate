import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { query, userId } from '../../utils/http';

export const searchRouter = Router();

/** Recherche globale : chaque résultat indique sa matière et son dossier parents. */
searchRouter.get('/', async (req, res) => {
  const q = query(
    req,
    z.object({
      q: z.string().trim().min(2, 'Au moins deux caractères').max(100),
      types: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(30).default(8),
    }),
  );
  const uid = userId(req);
  const contains = { contains: q.q, mode: 'insensitive' as const };
  const want = (t: string) => !q.types || q.types.split(',').includes(t);
  const take = q.limit;
  const [courses, folders, lessons, documents, notes, flashcards] = await Promise.all([
    want('course') ? prisma.course.findMany({ where: { userId: uid, OR: [{ title: contains }, { code: contains }, { description: contains }] }, take, select: { id: true, title: true, code: true, archivedAt: true, semester: { select: { name: true } } } }) : [],
    want('folder') ? prisma.folder.findMany({ where: { course: { userId: uid }, name: contains }, take, select: { id: true, name: true, course: { select: { id: true, title: true } }, parent: { select: { id: true, name: true } } } }) : [],
    want('lesson') ? prisma.lesson.findMany({ where: { course: { userId: uid }, OR: [{ title: contains }, { content: contains }, { description: contains }] }, take, select: { id: true, title: true, status: true, course: { select: { id: true, title: true } }, folder: { select: { id: true, name: true } } } }) : [],
    want('document') ? prisma.document.findMany({ where: { userId: uid, fileName: contains }, take, select: { id: true, fileName: true, mimeType: true, course: { select: { id: true, title: true } }, folder: { select: { id: true, name: true } } } }) : [],
    want('note') ? prisma.note.findMany({ where: { userId: uid, OR: [{ title: contains }, { content: contains }] }, take, select: { id: true, title: true, content: true, course: { select: { id: true, title: true } }, folder: { select: { id: true, name: true } } } }) : [],
    want('flashcard') ? prisma.flashcard.findMany({ where: { deck: { userId: uid }, OR: [{ question: contains }, { answer: contains }] }, take, select: { id: true, question: true, deck: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } } }) : [],
  ]);
  // Passages de documents correspondant au texte (recherche dans le contenu extrait).
  const passages = want('document')
    ? await prisma.documentChunk.findMany({ where: { userId: uid, content: contains }, take, select: { id: true, page: true, content: true, document: { select: { id: true, fileName: true, course: { select: { id: true, title: true } } } } } })
    : [];
  const snippet = (text: string) => {
    const i = text.toLowerCase().indexOf(q.q.toLowerCase());
    const start = Math.max(0, i - 60);
    return (start > 0 ? '…' : '') + text.slice(start, start + 180).replace(/\s+/g, ' ') + (text.length > start + 180 ? '…' : '');
  };
  res.json({
    data: {
      courses,
      folders,
      lessons,
      documents,
      notes: notes.map(({ content, ...n }) => ({ ...n, snippet: snippet(content) })),
      flashcards,
      passages: passages.map((p) => ({ id: p.id, page: p.page, snippet: snippet(p.content), document: p.document })),
    },
  });
});
