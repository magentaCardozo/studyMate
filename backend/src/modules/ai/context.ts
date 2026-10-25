import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { ownedCourse, ownedDocument, ownedFolder, ownedLesson } from '../../services/ownership';
import { chunkPages } from '../../services/extraction';
import { badRequest } from '../../utils/errors';
import type { SourceBlock } from './provider';

export interface Scope {
  courseId?: string | null;
  folderId?: string | null;
  lessonId?: string | null;
  documentIds?: string[];
}

export interface GatheredContext {
  label: string;
  courseId: string | null;
  lessonId: string | null;
  documents: { id: string; fileName: string; status: string }[];
  blocks: SourceBlock[];
  totalChars: number;
  usedChars: number;
  skippedDocuments: { id: string; fileName: string; reason: string }[];
}

async function folderSubtree(courseId: string, rootId: string) {
  const all = await prisma.folder.findMany({ where: { courseId }, select: { id: true, parentFolderId: true } });
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) if (f.parentFolderId && ids.has(f.parentFolderId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
  }
  return [...ids];
}

/**
 * Rassemble les passages autorisés pour une portée donnée. Seuls les documents
 * de l'utilisateur sont lus : aucune donnée d'un autre étudiant ne peut entrer
 * dans le contexte de l'IA.
 */
export async function gatherContext(userId: string, scope: Scope, opts: { budgetChars?: number; allChunks?: boolean } = {}): Promise<GatheredContext> {
  const budget = opts.budgetChars ?? env.AI_MAX_CONTEXT_CHARS;
  let label = 'Question générale';
  let courseId: string | null = null;
  let lessonId: string | null = null;
  const docWhere: Prisma.DocumentWhereInput[] = [];
  let lessons: { id: string; title: string; content: string; description: string | null; learningObjectives: string[] }[] = [];
  const lessonSelect = { id: true, title: true, content: true, description: true, learningObjectives: true } as const;

  if (scope.documentIds?.length) {
    for (const id of scope.documentIds) {
      const d = await ownedDocument(userId, id);
      courseId = courseId ?? d.courseId;
    }
    docWhere.push({ id: { in: scope.documentIds } });
    label = scope.documentIds.length === 1 ? 'Document sélectionné' : `${scope.documentIds.length} documents sélectionnés`;
  } else if (scope.lessonId) {
    const l = await ownedLesson(userId, scope.lessonId);
    courseId = l.courseId;
    lessonId = l.id;
    label = `Leçon « ${l.title} »`;
    lessons = await prisma.lesson.findMany({ where: { id: l.id }, select: lessonSelect });
  } else if (scope.folderId) {
    const f = await ownedFolder(userId, scope.folderId);
    courseId = f.courseId;
    label = `Sous-dossier « ${f.name} »`;
    const ids = await folderSubtree(f.courseId, f.id);
    // Base de connaissances = documents du sous-dossier et de ses descendants.
    docWhere.push({ folderId: { in: ids } });
  } else if (scope.courseId) {
    const c = await ownedCourse(userId, scope.courseId);
    courseId = c.id;
    label = `Dossier « ${c.title} »`;
    // Base de connaissances = tous les documents du dossier (PDF, scans, textes collés).
    docWhere.push({ courseId: c.id });
  }

  const documents = docWhere.length
    ? await prisma.document.findMany({ where: { userId, OR: docWhere }, select: { id: true, fileName: true, processingStatus: true }, orderBy: { createdAt: 'asc' } })
    : [];
  const ready = documents.filter((d) => d.processingStatus === 'READY');
  const skippedDocuments = documents
    .filter((d) => d.processingStatus !== 'READY')
    .map((d) => ({ id: d.id, fileName: d.fileName, reason: d.processingStatus === 'FAILED' ? 'traitement échoué' : 'traitement en cours' }));

  const chunks = ready.length
    ? await prisma.documentChunk.findMany({ where: { userId, documentId: { in: ready.map((d) => d.id) } }, orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }] })
    : [];

  const raw: Omit<SourceBlock, 'id'>[] = [];
  for (const l of lessons) {
    const text = [l.description, l.learningObjectives.length ? 'Objectifs : ' + l.learningObjectives.join(' ; ') : '', l.content].filter(Boolean).join('\n\n');
    for (const c of chunkPages([{ page: null, text }])) raw.push({ kind: 'lesson', lessonId: l.id, title: `Leçon : ${l.title}`, page: null, text: c.content });
  }
  for (const d of ready) {
    for (const c of chunks.filter((x) => x.documentId === d.id)) {
      raw.push({ kind: 'document', documentId: d.id, chunkId: c.id, title: d.fileName, page: c.page, text: c.content });
    }
  }
  const totalChars = raw.reduce((n, b) => n + b.text.length, 0);
  const selected: Omit<SourceBlock, 'id'>[] = [];
  let used = 0;
  if (opts.allChunks || totalChars <= budget) {
    selected.push(...raw);
    used = totalChars;
  } else {
    // Couverture uniforme du contenu plutôt que les seuls premiers passages.
    const ratio = budget / totalChars;
    let acc = 0;
    for (const b of raw) {
      acc += ratio;
      if (acc >= 1 && used + b.text.length <= budget) {
        selected.push(b);
        used += b.text.length;
        acc -= 1;
      }
    }
  }
  return {
    label,
    courseId,
    lessonId,
    documents: documents.map((d) => ({ id: d.id, fileName: d.fileName, status: d.processingStatus })),
    blocks: selected.map((b, i) => ({ ...b, id: `S${i + 1}` })),
    totalChars,
    usedChars: used,
    skippedDocuments,
  };
}

export function requireContent(ctx: GatheredContext) {
  const chars = ctx.blocks.reduce((n, b) => n + b.text.replace(/\s/g, '').length, 0);
  if (chars < 80) {
    const pending = ctx.skippedDocuments.length ? ` ${ctx.skippedDocuments.length} document(s) ne sont pas encore prêts.` : '';
    throw badRequest(
      `La base de connaissances ne contient pas assez de texte pour générer du matériel de révision fiable.${pending} Ajoutez un PDF, un scan lisible ou collez du texte dans ce dossier.`,
      { skippedDocuments: ctx.skippedDocuments },
      'INSUFFICIENT_CONTENT',
    );
  }
}

/** Référence de source stockable avec le contenu généré (provenance). */
export function sourceRef(block: SourceBlock) {
  return { sourceId: block.id, kind: block.kind, documentId: block.documentId ?? null, lessonId: block.lessonId ?? null, title: block.title, page: block.page };
}

/** Ne conserve que les identifiants de sources réellement fournis (jamais de citation inventée). */
export function resolveSources(ids: string[], blocks: SourceBlock[]) {
  const seen = new Set<string>();
  const refs = [];
  for (const id of ids) {
    const b = blocks.find((x) => x.id === id.trim().replace(/^\[|\]$/g, ''));
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      refs.push(sourceRef(b));
    }
  }
  return refs;
}
