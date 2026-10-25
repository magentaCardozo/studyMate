import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedCourse, ownedFolder, tombstone } from '../../services/ownership';
import { body, param, query, userId } from '../../utils/http';
import { badRequest } from '../../utils/errors';

export const courseFoldersRouter = Router({ mergeParams: true });
export const foldersRouter = Router();

const folderSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Nom requis').max(120),
  description: z.string().trim().max(2000).nullish(),
  parentFolderId: z.string().uuid().nullish(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullish(),
  icon: z.string().max(40).nullish(),
});

export async function folderBreadcrumb(folderId: string | null) {
  const trail: { id: string; name: string }[] = [];
  let current = folderId;
  let guard = 0;
  while (current && guard++ < 50) {
    const f = await prisma.folder.findUnique({ where: { id: current }, select: { id: true, name: true, parentFolderId: true } });
    if (!f) break;
    trail.unshift({ id: f.id, name: f.name });
    current = f.parentFolderId;
  }
  return trail;
}

async function isDescendant(candidateId: string, ancestorId: string) {
  let current: string | null = candidateId;
  let guard = 0;
  while (current && guard++ < 100) {
    if (current === ancestorId) return true;
    const f: { parentFolderId: string | null } | null = await prisma.folder.findUnique({ where: { id: current }, select: { parentFolderId: true } });
    current = f?.parentFolderId ?? null;
  }
  return false;
}

courseFoldersRouter.get('/', async (req, res) => {
  const courseId = param(req, 'courseId');
  await ownedCourse(userId(req), courseId);
  const folders = await prisma.folder.findMany({
    where: { courseId, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { lessons: true, documents: true, children: true } } },
  });
  res.json({ data: folders });
});

courseFoldersRouter.post('/', async (req, res) => {
  const courseId = param(req, 'courseId');
  const uid = userId(req);
  await ownedCourse(uid, courseId);
  const input = body(req, folderSchema);
  if (input.parentFolderId) {
    const parent = await ownedFolder(uid, input.parentFolderId);
    if (parent.courseId !== courseId) throw badRequest('Le dossier parent appartient à une autre matière.');
  }
  const last = await prisma.folder.aggregate({ where: { courseId, parentFolderId: input.parentFolderId ?? null }, _max: { sortOrder: true } });
  const folder = await prisma.folder.create({
    data: { ...input, courseId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json({ data: folder });
});

foldersRouter.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  const folder = await ownedFolder(uid, id);
  const q = query(req, z.object({ q: z.string().trim().max(100).optional() }));
  const contains = q.q ? { contains: q.q, mode: 'insensitive' as const } : undefined;
  const [course, breadcrumb, children, lessons, documents, notes] = await Promise.all([
    prisma.course.findUniqueOrThrow({ where: { id: folder.courseId }, select: { id: true, title: true, color: true } }),
    folderBreadcrumb(folder.id),
    prisma.folder.findMany({
      where: { parentFolderId: id, archivedAt: null, ...(contains ? { name: contains } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { lessons: true, documents: true, children: true } } },
    }),
    prisma.lesson.findMany({
      where: { folderId: id, ...(contains ? { title: contains } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, description: true, status: true, sortOrder: true, estimatedMinutes: true, updatedAt: true, _count: { select: { notes: true } } },
    }),
    prisma.document.findMany({
      where: { folderId: id, userId: uid, ...(contains ? { fileName: contains } : {}) },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.note.findMany({
      where: { folderId: id, userId: uid, lessonId: null, ...(contains ? { title: contains } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    }),
  ]);
  res.json({ data: { ...folder, course, breadcrumb, children, lessons, documents, notes } });
});

foldersRouter.patch('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  const folder = await ownedFolder(uid, id);
  const input = body(req, folderSchema.omit({ id: true }).partial().extend({ sortOrder: z.number().int().min(0).optional(), archived: z.boolean().optional() }));
  if (input.parentFolderId !== undefined && input.parentFolderId !== folder.parentFolderId) {
    if (input.parentFolderId) {
      const parent = await ownedFolder(uid, input.parentFolderId);
      if (parent.courseId !== folder.courseId) throw badRequest('Impossible de déplacer un dossier vers une autre matière.');
      if (await isDescendant(parent.id, folder.id)) throw badRequest('Un dossier ne peut pas être déplacé dans lui-même ou dans un de ses sous-dossiers.');
    }
  }
  const { archived, ...rest } = input;
  const updated = await prisma.folder.update({
    where: { id },
    data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
  });
  res.json({ data: updated });
});

// Réordonne les éléments d'un même niveau (glisser-déposer ou actions « monter/descendre »).
courseFoldersRouter.post('/reorder', async (req, res) => {
  const courseId = param(req, 'courseId');
  await ownedCourse(userId(req), courseId);
  const input = body(req, z.object({ folderIds: z.array(z.string().uuid()).min(1).max(200) }));
  const owned = await prisma.folder.count({ where: { id: { in: input.folderIds }, courseId } });
  if (owned !== input.folderIds.length) throw badRequest('Certains dossiers ne font pas partie de cette matière.');
  await prisma.$transaction(input.folderIds.map((id, i) => prisma.folder.update({ where: { id }, data: { sortOrder: i } })));
  res.status(204).end();
});

// Duplique la structure (dossiers et sous-dossiers, sans contenu) — utile d'un semestre à l'autre.
foldersRouter.post('/:id/duplicate', async (req, res) => {
  const id = param(req, 'id');
  const folder = await ownedFolder(userId(req), id);
  const all = await prisma.folder.findMany({ where: { courseId: folder.courseId, archivedAt: null } });
  async function copy(src: typeof folder, parentId: string | null, suffix: string): Promise<string> {
    const created = await prisma.folder.create({
      data: { courseId: src.courseId, parentFolderId: parentId, name: src.name + suffix, description: src.description, color: src.color, icon: src.icon, sortOrder: src.sortOrder + (suffix ? 1 : 0) },
    });
    for (const child of all.filter((f) => f.parentFolderId === src.id)) await copy(child, created.id, '');
    return created.id;
  }
  const newId = await copy(folder, folder.parentFolderId, ' (copie)');
  res.status(201).json({ data: await prisma.folder.findUnique({ where: { id: newId } }) });
});

foldersRouter.delete('/:id', async (req, res) => {
  const id = param(req, 'id');
  const uid = userId(req);
  await ownedFolder(uid, id);
  // Sous-dossiers et leçons supprimés ; les documents et notes sont conservés à la racine du dossier.
  await prisma.folder.delete({ where: { id } });
  await tombstone(uid, 'folder', id);
  res.status(204).end();
});
