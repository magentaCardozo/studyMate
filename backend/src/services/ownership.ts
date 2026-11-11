import { prisma } from './prisma';
import { badRequest, notFound } from '../utils/errors';

/**
 * Contrôles de propriété centralisés. Chaque accès à une ressource passe par
 * ces fonctions : un identifiant appartenant à un autre étudiant renvoie 404.
 */

export async function ownedCourse(userId: string, id: string) {
  const course = await prisma.course.findFirst({ where: { id, userId } });
  if (!course) throw notFound('Matière');
  return course;
}

export async function ownedFolder(userId: string, id: string) {
  const folder = await prisma.folder.findFirst({ where: { id, course: { userId } } });
  if (!folder) throw notFound('Dossier');
  return folder;
}

export async function ownedLesson(userId: string, id: string) {
  const lesson = await prisma.lesson.findFirst({ where: { id, course: { userId } } });
  if (!lesson) throw notFound('Leçon');
  return lesson;
}

export async function ownedDocument(userId: string, id: string) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw notFound('Document');
  return doc;
}

export async function ownedNote(userId: string, id: string) {
  const note = await prisma.note.findFirst({ where: { id, userId } });
  if (!note) throw notFound('Note');
  return note;
}

export async function ownedDeck(userId: string, id: string) {
  const deck = await prisma.flashcardDeck.findFirst({ where: { id, userId } });
  if (!deck) throw notFound('Paquet de cartes');
  return deck;
}

export async function ownedCard(userId: string, id: string) {
  const card = await prisma.flashcard.findFirst({ where: { id, deck: { userId } } });
  if (!card) throw notFound('Carte');
  return card;
}

export async function ownedQuiz(userId: string, id: string) {
  const quiz = await prisma.quiz.findFirst({ where: { id, userId } });
  if (!quiz) throw notFound('Quiz');
  return quiz;
}

export async function ownedAttempt(userId: string, id: string) {
  const attempt = await prisma.quizAttempt.findFirst({ where: { id, userId } });
  if (!attempt) throw notFound('Tentative');
  return attempt;
}

export async function ownedSession(userId: string, id: string) {
  const s = await prisma.studySession.findFirst({ where: { id, userId } });
  if (!s) throw notFound('Session');
  return s;
}

export async function ownedGoal(userId: string, id: string) {
  const g = await prisma.studyGoal.findFirst({ where: { id, userId } });
  if (!g) throw notFound('Objectif');
  return g;
}

export async function ownedSemester(userId: string, id: string) {
  const s = await prisma.semester.findFirst({ where: { id, academicYear: { userId } } });
  if (!s) throw notFound('Semestre');
  return s;
}

/**
 * Vérifie la cohérence d'un emplacement (matière / dossier / leçon) :
 * tout doit appartenir à l'utilisateur et le dossier/la leçon à la même matière.
 */
export async function resolvePlacement(
  userId: string,
  p: { courseId?: string | null; folderId?: string | null; lessonId?: string | null },
) {
  let courseId = p.courseId ?? null;
  let folderId = p.folderId ?? null;
  const lessonId = p.lessonId ?? null;
  if (lessonId) {
    const lesson = await ownedLesson(userId, lessonId);
    if (courseId && courseId !== lesson.courseId) throw badRequest('La leçon ne fait pas partie de cette matière.');
    courseId = lesson.courseId;
    folderId = folderId ?? lesson.folderId;
  }
  if (folderId) {
    const folder = await ownedFolder(userId, folderId);
    if (courseId && courseId !== folder.courseId) throw badRequest('Le dossier ne fait pas partie de cette matière.');
    courseId = folder.courseId;
  }
  if (courseId) await ownedCourse(userId, courseId);
  return { courseId, folderId, lessonId };
}

/**
 * Emplacement d'un document : toujours la racine du dossier du cours (seul endroit où l'on
 * dépose des documents ; les sous-dossiers QCM, Flash-cards et Fiches ne contiennent que du
 * contenu généré). Un ancien client qui indique un sous-dossier est ramené à son dossier.
 */
export async function resolveDocumentPlacement(userId: string, p: { courseId?: string | null; folderId?: string | null }) {
  let courseId = p.courseId ?? null;
  if (p.folderId) {
    const folder = await ownedFolder(userId, p.folderId);
    if (courseId && courseId !== folder.courseId) throw badRequest('Ce sous-dossier ne fait pas partie de ce dossier.');
    courseId = folder.courseId;
  }
  if (!courseId) throw badRequest("Créez ou choisissez d'abord le dossier du cours : chaque document y est déposé.", undefined, 'FOLDER_REQUIRED');
  await ownedCourse(userId, courseId);
  return { courseId, folderId: null as string | null };
}

export async function tombstone(userId: string, entity: string, entityId: string) {
  await prisma.tombstone.create({ data: { userId, entity, entityId } });
}
