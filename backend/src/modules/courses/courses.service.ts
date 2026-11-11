import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';

export async function courseStats(courseIds: string[]) {
  if (!courseIds.length) return new Map<string, CourseStats>();
  const [folders, lessons, completed, docs, quizzes, decks, summaries] = await Promise.all([
    prisma.folder.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, archivedAt: null }, _count: true }),
    prisma.lesson.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true, _max: { updatedAt: true } }),
    prisma.lesson.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, status: 'COMPLETED' }, _count: true }),
    prisma.document.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true, _max: { updatedAt: true } }),
    // Contenu des trois sous-dossiers (QCM, Flash-cards, Fiches de révision).
    prisma.quiz.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true }),
    prisma.flashcardDeck.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true }),
    prisma.summary.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true }),
  ]);
  const map = new Map<string, CourseStats>();
  for (const id of courseIds) map.set(id, { folders: 0, lessons: 0, completedLessons: 0, documents: 0, qcm: 0, flashcards: 0, fiches: 0, lastContentAt: null });
  for (const f of folders) map.get(f.courseId)!.folders = f._count;
  for (const l of lessons) {
    const s = map.get(l.courseId)!;
    s.lessons = l._count;
    s.lastContentAt = l._max.updatedAt;
  }
  for (const c of completed) map.get(c.courseId)!.completedLessons = c._count;
  for (const d of docs) {
    if (!d.courseId) continue;
    const s = map.get(d.courseId)!;
    s.documents = d._count;
    if (d._max.updatedAt && (!s.lastContentAt || d._max.updatedAt > s.lastContentAt)) s.lastContentAt = d._max.updatedAt;
  }
  for (const q of quizzes) if (q.courseId) map.get(q.courseId)!.qcm = q._count;
  for (const d of decks) if (d.courseId) map.get(d.courseId)!.flashcards = d._count;
  for (const r of summaries) if (r.courseId) map.get(r.courseId)!.fiches = r._count;
  return map;
}

export interface CourseStats {
  qcm: number;
  flashcards: number;
  fiches: number;
  folders: number;
  lessons: number;
  completedLessons: number;
  documents: number;
  lastContentAt: Date | null;
}

type CourseWithSemester = Prisma.CourseGetPayload<{ include: { semester: { include: { academicYear: true } } } }>;

export function presentCourse(c: CourseWithSemester, stats?: CourseStats) {
  const lastActivityCandidates = [c.lastOpenedAt, c.updatedAt, stats?.lastContentAt].filter(Boolean) as Date[];
  return {
    id: c.id,
    title: c.title,
    code: c.code,
    faculty: c.faculty,
    description: c.description,
    color: c.color,
    importance: c.importance,
    confidence: c.confidence,
    isDemo: c.isDemo,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastOpenedAt: c.lastOpenedAt,
    semester: c.semester ? { id: c.semester.id, name: c.semester.name } : null,
    academicYear: c.semester?.academicYear ? { id: c.semester.academicYear.id, name: c.semester.academicYear.name } : null,
    stats: stats
      ? {
          folders: stats.folders,
          lessons: stats.lessons,
          documents: stats.documents,
          completedLessons: stats.completedLessons,
          qcm: stats.qcm,
          flashcards: stats.flashcards,
          fiches: stats.fiches,
          // Progression affichée uniquement lorsqu'elle repose sur des données réelles.
          progress: stats.lessons > 0 ? Math.round((stats.completedLessons / stats.lessons) * 100) : null,
        }
      : undefined,
    lastActivityAt: lastActivityCandidates.length ? new Date(Math.max(...lastActivityCandidates.map((d) => d.getTime()))) : null,
  };
}

export interface TreeFolder {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentFolderId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  counts: { lessons: number; documents: number; subfolders: number };
  children: TreeFolder[];
  lessons: { id: string; title: string; status: string; sortOrder: number; estimatedMinutes: number | null }[];
}

/** Arborescence de la matière construite à partir des relations en base. */
export async function buildCourseTree(courseId: string) {
  const [folders, lessons, docs] = await Promise.all([
    prisma.folder.findMany({ where: { courseId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.lesson.findMany({
      where: { courseId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, status: true, sortOrder: true, estimatedMinutes: true, folderId: true },
    }),
    prisma.document.groupBy({ by: ['folderId'], where: { courseId }, _count: true }),
  ]);
  const docCount = new Map(docs.map((d) => [d.folderId, d._count]));
  const nodes = new Map<string, TreeFolder>();
  for (const f of folders) {
    nodes.set(f.id, {
      id: f.id,
      name: f.name,
      description: f.description,
      color: f.color,
      icon: f.icon,
      parentFolderId: f.parentFolderId,
      sortOrder: f.sortOrder,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      counts: { lessons: 0, documents: docCount.get(f.id) ?? 0, subfolders: 0 },
      children: [],
      lessons: [],
    });
  }
  const rootFolders: TreeFolder[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentFolderId ? nodes.get(node.parentFolderId) : undefined;
    if (parent) {
      parent.children.push(node);
      parent.counts.subfolders++;
    } else rootFolders.push(node);
  }
  const rootLessons: TreeFolder['lessons'] = [];
  for (const l of lessons) {
    const item = { id: l.id, title: l.title, status: l.status, sortOrder: l.sortOrder, estimatedMinutes: l.estimatedMinutes };
    const parent = l.folderId ? nodes.get(l.folderId) : undefined;
    if (parent) {
      parent.lessons.push(item);
      parent.counts.lessons++;
    } else rootLessons.push(item);
  }
  return { folders: rootFolders, lessons: rootLessons, rootDocuments: docCount.get(null) ?? 0 };
}
