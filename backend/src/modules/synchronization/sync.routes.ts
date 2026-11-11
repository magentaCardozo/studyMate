import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { ownedCard, ownedCourse, ownedLesson, ownedNote, ownedQuiz, ownedSession, resolvePlacement, tombstone } from '../../services/ownership';
import { schedule } from '../../services/srs';
import { body, query, userId } from '../../utils/http';
import { AppError } from '../../utils/errors';
import { configOf, submitAttempt } from '../quizzes/quizzes.service';

export const syncRouter = Router();

/**
 * Synchronisation incrémentale pour le client Android hors ligne.
 * GET /sync/changes?since=…  → tout ce qui a changé côté serveur + suppressions.
 */
syncRouter.get('/changes', async (req, res) => {
  const uid = userId(req);
  const { since } = query(req, z.object({ since: z.coerce.date().default(new Date(0)) }));
  const serverTime = new Date();
  const changed = { gt: since };
  const [courses, folders, lessons, notes, documents, decks, flashcards, goals, sessions, quizzes, summaries, tombstones, years] = await Promise.all([
    prisma.course.findMany({ where: { userId: uid, updatedAt: changed }, include: { semester: { select: { id: true, name: true } } } }),
    prisma.folder.findMany({ where: { course: { userId: uid }, updatedAt: changed } }),
    prisma.lesson.findMany({ where: { course: { userId: uid }, updatedAt: changed } }),
    prisma.note.findMany({ where: { userId: uid, updatedAt: changed } }),
    prisma.document.findMany({ where: { userId: uid, updatedAt: changed } }),
    prisma.flashcardDeck.findMany({ where: { userId: uid, updatedAt: changed } }),
    prisma.flashcard.findMany({ where: { deck: { userId: uid }, updatedAt: changed } }),
    prisma.studyGoal.findMany({ where: { userId: uid, updatedAt: changed } }),
    prisma.studySession.findMany({ where: { userId: uid, updatedAt: changed } }),
    prisma.quiz.findMany({ where: { userId: uid, createdAt: changed }, include: { questions: { orderBy: { ordinal: 'asc' } } } }),
    prisma.summary.findMany({ where: { userId: uid, createdAt: changed } }),
    prisma.tombstone.findMany({ where: { userId: uid, deletedAt: changed }, select: { entity: true, entityId: true, deletedAt: true } }),
    prisma.academicYear.findMany({ where: { userId: uid }, include: { semesters: true } }),
  ]);
  res.json({
    data: {
      serverTime,
      years,
      courses,
      folders,
      lessons,
      notes,
      documents,
      decks,
      flashcards,
      goals,
      sessions,
      // Seuls les quiz d'entraînement sont livrés avec leurs corrections (utilisables hors ligne).
      quizzes: quizzes.map((q) => {
        const offline = configOf(q.configuration).mode !== 'exam';
        return {
          ...q,
          offlineEligible: offline,
          questions: q.questions.map((qq) => (offline ? qq : { ...qq, correctAnswer: null, explanation: null })),
        };
      }),
      summaries,
      tombstones,
    },
  });
});

const operation = z.object({
  opId: z.string().uuid(),
  entity: z.enum(['note', 'lesson', 'course', 'folder', 'flashcard', 'flashcard_review', 'session', 'quiz_result']),
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  baseUpdatedAt: z.coerce.date().nullish(),
  clientTime: z.coerce.date().optional(),
});
type Op = z.infer<typeof operation>;

type Result = { opId: string; status: 'applied' | 'duplicate' | 'conflict' | 'error'; entity: string; id: string; server?: unknown; message?: string; code?: string };

const isNewer = (serverUpdatedAt: Date, base?: Date | null) => !!base && serverUpdatedAt.getTime() > base.getTime() + 1;

/**
 * Règles de résolution des conflits (documentées dans docs/offline-sync.md) :
 *  - notes : si la note a changé sur le serveur depuis la version de base, la version serveur
 *    est conservée et la version locale est enregistrée comme copie « (conflit) » — rien n'est perdu ;
 *  - autres ressources : la version serveur l'emporte et est renvoyée au client ;
 *  - révisions de cartes et résultats de QCM passés sur l'appareil : ajout pur, idempotent (jamais de conflit).
 */
async function apply(uid: string, op: Op): Promise<Result> {
  const base = { opId: op.opId, entity: op.entity, id: op.id };
  const d = op.data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : undefined);
  switch (op.entity) {
    case 'note': {
      if (op.action === 'create') {
        const existing = await prisma.note.findUnique({ where: { id: op.id } });
        if (existing) return { ...base, status: existing.userId === uid ? 'duplicate' : 'error', server: existing.userId === uid ? existing : undefined };
        const placement = await resolvePlacement(uid, { courseId: str('courseId'), folderId: str('folderId'), lessonId: str('lessonId') });
        const note = await prisma.note.create({ data: { id: op.id, userId: uid, title: str('title') || 'Note sans titre', content: str('content') ?? '', ...placement } });
        return { ...base, status: 'applied', server: note };
      }
      const note = await ownedNote(uid, op.id);
      if (op.action === 'delete') {
        await prisma.note.delete({ where: { id: note.id } });
        await tombstone(uid, 'note', note.id);
        return { ...base, status: 'applied' };
      }
      if (isNewer(note.updatedAt, op.baseUpdatedAt)) {
        const copy = await prisma.note.create({
          data: { userId: uid, title: `${str('title') ?? note.title} (conflit)`, content: str('content') ?? note.content, courseId: note.courseId, folderId: note.folderId, lessonId: note.lessonId, documentId: note.documentId },
        });
        return { ...base, status: 'conflict', server: note, message: `Modifiée ailleurs : votre version a été enregistrée dans « ${copy.title} ».`, code: 'NOTE_CONFLICT_COPY' };
      }
      const updated = await prisma.note.update({ where: { id: note.id }, data: { title: str('title'), content: str('content') } });
      return { ...base, status: 'applied', server: updated };
    }
    case 'lesson': {
      if (op.action === 'create') {
        const existing = await prisma.lesson.findUnique({ where: { id: op.id } });
        if (existing) return { ...base, status: 'duplicate', server: existing };
        const courseId = str('courseId');
        if (!courseId) throw new AppError(400, 'BAD_REQUEST', 'courseId requis.');
        const placement = await resolvePlacement(uid, { courseId, folderId: str('folderId') });
        const lesson = await prisma.lesson.create({ data: { id: op.id, courseId: placement.courseId!, folderId: placement.folderId, title: str('title') || 'Nouvelle leçon', content: str('content') ?? '' } });
        return { ...base, status: 'applied', server: lesson };
      }
      const lesson = await ownedLesson(uid, op.id);
      if (op.action === 'delete') {
        await prisma.lesson.delete({ where: { id: lesson.id } });
        await tombstone(uid, 'lesson', lesson.id);
        return { ...base, status: 'applied' };
      }
      // Le statut d'achèvement est un fait local : il est appliqué même si la leçon a changé ailleurs.
      const status = str('status') as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | undefined;
      const contentChange = str('title') !== undefined || str('content') !== undefined;
      if (contentChange && isNewer(lesson.updatedAt, op.baseUpdatedAt)) return { ...base, status: 'conflict', server: lesson, message: 'La leçon a été modifiée ailleurs ; la version serveur est conservée.' };
      const updated = await prisma.lesson.update({
        where: { id: lesson.id },
        data: { title: str('title'), content: str('content'), status, ...(status === 'COMPLETED' ? { completedAt: op.clientTime ?? new Date() } : status ? { completedAt: null } : {}) },
      });
      return { ...base, status: 'applied', server: updated };
    }
    case 'course': {
      if (op.action === 'create') {
        const existing = await prisma.course.findUnique({ where: { id: op.id } });
        if (existing) return { ...base, status: 'duplicate', server: existing };
        const course = await prisma.course.create({ data: { id: op.id, userId: uid, title: str('title') || 'Nouvelle matière', code: str('code'), description: str('description'), semesterId: str('semesterId') } });
        return { ...base, status: 'applied', server: course };
      }
      const course = await ownedCourse(uid, op.id);
      if (op.action === 'delete') return { ...base, status: 'error', code: 'UNSUPPORTED', message: 'La suppression d’une matière doit être faite en ligne.' };
      if (isNewer(course.updatedAt, op.baseUpdatedAt)) return { ...base, status: 'conflict', server: course, message: 'La matière a été modifiée ailleurs ; la version serveur est conservée.' };
      return { ...base, status: 'applied', server: await prisma.course.update({ where: { id: course.id }, data: { title: str('title'), code: str('code'), description: str('description') } }) };
    }
    case 'folder': {
      if (op.action !== 'create') return { ...base, status: 'error', code: 'UNSUPPORTED', message: 'Seule la création de dossier est possible hors ligne.' };
      const existing = await prisma.folder.findUnique({ where: { id: op.id } });
      if (existing) return { ...base, status: 'duplicate', server: existing };
      const courseId = str('courseId');
      if (!courseId) throw new AppError(400, 'BAD_REQUEST', 'courseId requis.');
      const placement = await resolvePlacement(uid, { courseId, folderId: str('parentFolderId') });
      const folder = await prisma.folder.create({ data: { id: op.id, courseId: placement.courseId!, parentFolderId: placement.folderId, name: str('name') || 'Nouveau dossier' } });
      return { ...base, status: 'applied', server: folder };
    }
    case 'flashcard': {
      if (op.action === 'create') {
        const existing = await prisma.flashcard.findUnique({ where: { id: op.id } });
        if (existing) return { ...base, status: 'duplicate', server: existing };
        const deck = await prisma.flashcardDeck.findFirst({ where: { id: str('deckId'), userId: uid } });
        if (!deck) throw new AppError(404, 'NOT_FOUND', 'Paquet introuvable.');
        return { ...base, status: 'applied', server: await prisma.flashcard.create({ data: { id: op.id, deckId: deck.id, question: str('question') ?? '', answer: str('answer') ?? '' } }) };
      }
      const card = await ownedCard(uid, op.id);
      if (op.action === 'delete') {
        await prisma.flashcard.delete({ where: { id: card.id } });
        await tombstone(uid, 'flashcard', card.id);
        return { ...base, status: 'applied' };
      }
      if (isNewer(card.updatedAt, op.baseUpdatedAt) && (str('question') || str('answer'))) return { ...base, status: 'conflict', server: card };
      return { ...base, status: 'applied', server: await prisma.flashcard.update({ where: { id: card.id }, data: { question: str('question'), answer: str('answer') } }) };
    }
    case 'flashcard_review': {
      // op.id = identifiant de la révision (idempotence) ; data.flashcardId, data.rating, data.reviewedAt
      const existing = await prisma.flashcardReview.findUnique({ where: { clientOpId: op.id } });
      if (existing) return { ...base, status: 'duplicate', server: existing };
      const card = await ownedCard(uid, String(d.flashcardId));
      const rating = Number(d.rating);
      if (![0, 1, 2, 3].includes(rating)) throw new AppError(400, 'BAD_REQUEST', 'Note de révision invalide.');
      const reviewedAt = op.clientTime && op.clientTime < new Date() ? op.clientTime : new Date();
      // Les révisions hors ligne sont rejouées dans l'ordre chronologique côté client.
      const next = schedule(card, rating as 0 | 1 | 2 | 3, reviewedAt);
      const [, review] = await prisma.$transaction([
        prisma.flashcard.update({ where: { id: card.id }, data: { easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions, lapses: next.lapses, dueAt: next.dueAt, lastReviewedAt: reviewedAt } }),
        prisma.flashcardReview.create({ data: { userId: uid, flashcardId: card.id, responseRating: rating, reviewedAt, nextReviewAt: next.dueAt, intervalDays: next.intervalDays, clientOpId: op.id } }),
      ]);
      return { ...base, status: 'applied', server: review };
    }
    case 'quiz_result': {
      // QCM d'entraînement passé sur l'appareil (éventuellement hors ligne) : op.id = identifiant de la
      // tentative (idempotence) ; data.quizId, data.responses = [{ questionId, response }].
      const existing = await prisma.quizAttempt.findUnique({ where: { id: op.id } });
      if (existing) return { ...base, status: existing.userId === uid ? 'duplicate' : 'error', server: existing.userId === uid ? existing : undefined };
      const quiz = await ownedQuiz(uid, String(d.quizId));
      if (configOf(quiz.configuration).mode === 'exam') return { ...base, status: 'error', code: 'EXAM_ONLINE_ONLY', message: 'Un examen se passe en ligne.' };
      const questions = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id } });
      const answeredAt = op.clientTime && op.clientTime < new Date() ? op.clientTime : new Date();
      const responses = (Array.isArray(d.responses) ? d.responses : []) as { questionId?: unknown; response?: unknown }[];
      const attempt = await prisma.quizAttempt.create({ data: { id: op.id, userId: uid, quizId: quiz.id, mode: 'practice', startedAt: answeredAt } });
      for (const r of responses) {
        const q = questions.find((x) => x.id === r.questionId);
        if (!q || r.response === undefined || r.response === null) continue;
        await prisma.quizResponse.create({ data: { attemptId: attempt.id, questionId: q.id, response: r.response as Prisma.InputJsonValue, answeredAt } });
      }
      // La notation est faite par le serveur (même barème que sur le web).
      return { ...base, status: 'applied', server: await submitAttempt(attempt) };
    }
    case 'session': {
      const s = await ownedSession(uid, op.id);
      if (op.action !== 'update') return { ...base, status: 'error', code: 'UNSUPPORTED' };
      const status = str('status') as 'COMPLETED' | 'SKIPPED' | 'PLANNED' | undefined;
      return {
        ...base,
        status: 'applied',
        server: await prisma.studySession.update({ where: { id: s.id }, data: { status, completedAt: status === 'COMPLETED' ? (op.clientTime ?? new Date()) : status ? null : undefined } }),
      };
    }
  }
}

syncRouter.post('/push', async (req, res) => {
  const uid = userId(req);
  const { operations } = body(req, z.object({ operations: z.array(operation).max(500) }));
  const results: Result[] = [];
  for (const op of operations) {
    // Idempotence : une opération déjà appliquée (réessai réseau) n'est pas rejouée.
    const done = await prisma.syncOperation.findUnique({ where: { id: op.opId } });
    if (done) {
      results.push({ ...(done.result as object), opId: op.opId, status: 'duplicate', entity: op.entity, id: op.id } as Result);
      continue;
    }
    let result: Result;
    try {
      result = await apply(uid, op);
    } catch (e) {
      const err = e as AppError;
      result = { opId: op.opId, entity: op.entity, id: op.id, status: 'error', code: err.code ?? 'ERROR', message: err.message };
      if (!(e instanceof AppError) && !(e instanceof Prisma.PrismaClientKnownRequestError)) throw e;
    }
    if (result.status !== 'error') {
      await prisma.syncOperation.create({ data: { id: op.opId, userId: uid, entity: op.entity, action: op.action, result: { status: result.status, message: result.message ?? null } } }).catch(() => {});
    }
    results.push(result);
  }
  res.json({ data: { serverTime: new Date(), results } });
});
