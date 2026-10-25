import { prisma } from '../../services/prisma';

/** Crée une année académique et deux semestres vides pour un nouveau compte. */
export async function createStarterStructure(userId: string, now = new Date()) {
  // L'année universitaire commence en septembre/octobre en RDC.
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  await prisma.academicYear.create({
    data: {
      userId,
      name: `${startYear}-${startYear + 1}`,
      startDate: new Date(Date.UTC(startYear, 9, 1)),
      endDate: new Date(Date.UTC(startYear + 1, 6, 31)),
      semesters: {
        create: [
          { name: 'Semestre 1', startDate: new Date(Date.UTC(startYear, 9, 1)), endDate: new Date(Date.UTC(startYear + 1, 1, 15)) },
          { name: 'Semestre 2', startDate: new Date(Date.UTC(startYear + 1, 1, 16)), endDate: new Date(Date.UTC(startYear + 1, 6, 31)) },
        ],
      },
    },
  });
}
