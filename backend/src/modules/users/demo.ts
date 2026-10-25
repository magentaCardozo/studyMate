import { prisma } from '../../services/prisma';
import { storage, documentPrefix } from '../../services/storage';
import { enqueueProcessing, originalKey } from '../documents/documents.service';

/**
 * CONTENU DE DÉMONSTRATION — clairement marqué (isDemo = true, « (démo) » dans le titre).
 * Il n'est créé qu'à la demande de l'étudiant et peut être supprimé en un clic.
 */

const LIMITS_DOC = `# Limites et continuité — support de cours (démo)

## 1. Limite d'une fonction en un point
La limite d'une fonction f en un point a est la valeur dont f(x) se rapproche lorsque x se rapproche de a.
On note lim_{x→a} f(x) = L.
Une fonction est dite convergente en a lorsque cette limite existe et est finie.

Par exemple, lim_{x→2} (3x + 1) = 7, car 3x + 1 se rapproche de 7 lorsque x se rapproche de 2.

## 2. Opérations sur les limites
La limite d'une somme est la somme des limites, lorsque celles-ci existent.
lim (f + g) = lim f + lim g
lim (f · g) = lim f · lim g
Une forme indéterminée est une expression dont on ne peut pas déduire la limite directement, comme 0/0 ou ∞ − ∞.

Attention : ne pas confondre une forme indéterminée avec une limite inexistante.

## 3. Continuité
Une fonction continue en a est une fonction définie en a telle que lim_{x→a} f(x) = f(a).
Le théorème des valeurs intermédiaires affirme qu'une fonction continue sur [a, b] prend toutes les valeurs comprises entre f(a) et f(b).
Une discontinuité est un point où la fonction n'est pas continue.

Par exemple, la fonction partie entière présente une discontinuité en chaque entier.

## 4. Limites usuelles
lim_{x→0} sin(x)/x = 1
lim_{x→+∞} 1/x = 0
lim_{x→0} (e^x − 1)/x = 1
`;

const PROBA_DOC = `# Probabilités — notions de base (démo)

Une expérience aléatoire est une expérience dont on ne peut pas prévoir le résultat avec certitude.
L'univers est l'ensemble de tous les résultats possibles d'une expérience aléatoire.
Un événement est un sous-ensemble de l'univers.
La probabilité d'un événement est un nombre compris entre 0 et 1 qui mesure ses chances de se réaliser.

P(A ∪ B) = P(A) + P(B) − P(A ∩ B)
P(Ā) = 1 − P(A)

Deux événements incompatibles sont des événements qui ne peuvent pas se réaliser simultanément.
Deux événements indépendants sont des événements tels que P(A ∩ B) = P(A) · P(B).

Par exemple, lors du lancer d'un dé équilibré, la probabilité d'obtenir un nombre pair est 1/2.

Attention : des événements incompatibles ne sont généralement pas indépendants.
`;

async function addTextDocument(userId: string, data: { courseId: string; folderId?: string; fileName: string; text: string }) {
  const buffer = Buffer.from(data.text, 'utf-8');
  const doc = await prisma.document.create({
    data: { userId, courseId: data.courseId, folderId: data.folderId, fileName: data.fileName, mimeType: 'text/markdown', fileSize: buffer.length, storageKey: 'pending', isDemo: true, processingStatus: 'UPLOADED', source: 'text' },
  });
  const key = originalKey(userId, doc.id);
  await storage.put(key, buffer, 'text/markdown');
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
  await enqueueProcessing(doc.id);
  return doc;
}

export async function createDemoContent(userId: string) {
  const existing = await prisma.course.findFirst({ where: { userId, isDemo: true } });
  if (existing) return existing;
  const semester = await prisma.semester.findFirst({ where: { academicYear: { userId } }, orderBy: { startDate: 'asc' } });

  const analyse = await prisma.course.create({
    data: { userId, semesterId: semester?.id, title: 'Analyse mathématique (démo)', code: 'MATH-101', faculty: 'Faculté des Sciences', description: 'Matière de démonstration pour découvrir StudyMate AI.', color: '#A51C30', importance: 4, confidence: 2, isDemo: true },
  });
  const intro = await prisma.folder.create({ data: { courseId: analyse.id, name: '01 - Introduction', sortOrder: 0 } });
  const limits = await prisma.folder.create({ data: { courseId: analyse.id, name: '02 - Limites et continuité', sortOrder: 1 } });
  await prisma.folder.create({ data: { courseId: analyse.id, name: '03 - Dérivation', sortOrder: 2 } });
  await prisma.folder.create({ data: { courseId: analyse.id, name: '04 - Intégration', sortOrder: 3 } });
  await prisma.folder.create({ data: { courseId: analyse.id, name: 'Examens précédents', sortOrder: 4 } });

  await prisma.lesson.create({
    data: {
      courseId: analyse.id,
      folderId: intro.id,
      title: 'Leçon 1 - Notions fondamentales',
      sortOrder: 0,
      estimatedMinutes: 40,
      learningObjectives: ['Manipuler les ensembles de nombres', 'Lire et écrire des intervalles'],
      content: `## Ensembles de nombres\nL'ensemble des entiers naturels est noté $\\mathbb{N}$. L'ensemble des nombres réels est noté $\\mathbb{R}$.\n\n## Intervalles\nUn intervalle est un ensemble de réels compris entre deux bornes, par exemple $[a, b] = \\{x \\in \\mathbb{R} \\mid a \\le x \\le b\\}$.`,
    },
  });
  await prisma.lesson.create({ data: { courseId: analyse.id, folderId: intro.id, title: 'Leçon 2 - Ensembles et applications', sortOrder: 1, estimatedMinutes: 45, content: 'Une application associe à chaque élément d’un ensemble de départ un unique élément d’un ensemble d’arrivée.' } });
  const lLimits = await prisma.lesson.create({
    data: {
      courseId: analyse.id,
      folderId: limits.id,
      title: 'Leçon 1 - Limites',
      sortOrder: 0,
      estimatedMinutes: 60,
      learningObjectives: ['Calculer une limite simple', 'Reconnaître une forme indéterminée'],
      content: 'Voir le support de cours joint. Points clés : définition de la limite, opérations, formes indéterminées.',
    },
  });
  await prisma.lesson.create({ data: { courseId: analyse.id, folderId: limits.id, title: 'Leçon 2 - Continuité', sortOrder: 1, estimatedMinutes: 50, content: 'Une fonction continue en $a$ vérifie $\\lim_{x \\to a} f(x) = f(a)$.' } });
  await addTextDocument(userId, { courseId: analyse.id, folderId: limits.id, fileName: 'Support - Limites et continuité (démo).md', text: LIMITS_DOC });
  await prisma.note.create({
    data: { userId, courseId: analyse.id, folderId: limits.id, lessonId: lLimits.id, isDemo: true, title: 'Mes notes — limites (démo)', content: '## À retenir\n- Toujours vérifier si on est face à une **forme indéterminée**.\n- Limite usuelle : $\\lim_{x\\to0} \\frac{\\sin x}{x} = 1$' },
  });

  const proba = await prisma.course.create({
    data: { userId, semesterId: semester?.id, title: 'Probabilités et statistiques (démo)', code: 'STAT-110', faculty: 'Faculté des Sciences économiques', color: '#1F2937', importance: 3, confidence: 3, isDemo: true },
  });
  const pFolder = await prisma.folder.create({ data: { courseId: proba.id, name: '01 - Probabilités', sortOrder: 0 } });
  const pLesson = await prisma.lesson.create({ data: { courseId: proba.id, folderId: pFolder.id, title: 'Leçon 1 - Vocabulaire des probabilités', estimatedMinutes: 45, content: 'Voir le document joint.' } });
  await addTextDocument(userId, { courseId: proba.id, folderId: pFolder.id, fileName: 'Probabilités - notions de base (démo).md', text: PROBA_DOC });
  return analyse;
}

export async function deleteDemoContent(userId: string) {
  const docs = await prisma.document.findMany({ where: { userId, isDemo: true }, select: { id: true } });
  for (const d of docs) await storage.deletePrefix(documentPrefix(userId, d.id));
  await prisma.document.deleteMany({ where: { userId, isDemo: true } });
  await prisma.note.deleteMany({ where: { userId, isDemo: true } });
  await prisma.course.deleteMany({ where: { userId, isDemo: true } });
}
