import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedSemester } from '../../services/ownership';
import { body, param, query, userId } from '../../utils/http';
import { notFound } from '../../utils/errors';

export const academicYearsRouter = Router();
export const semestersRouter = Router();

const yearSchema = z.object({
  name: z.string().trim().min(1).max(60),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
});

academicYearsRouter.get('/', async (req, res) => {
  const years = await prisma.academicYear.findMany({
    where: { userId: userId(req) },
    include: { semesters: { orderBy: { startDate: 'asc' }, include: { _count: { select: { courses: true } } } } },
    orderBy: { startDate: 'desc' },
  });
  res.json({ data: years });
});

academicYearsRouter.post('/', async (req, res) => {
  const input = body(req, yearSchema.extend({ semesters: z.array(z.string().trim().min(1).max(60)).max(4).optional() }));
  const year = await prisma.academicYear.create({
    data: {
      userId: userId(req),
      name: input.name,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      semesters: input.semesters?.length ? { create: input.semesters.map((name) => ({ name })) } : undefined,
    },
    include: { semesters: true },
  });
  res.status(201).json({ data: year });
});

academicYearsRouter.patch('/:id', async (req, res) => {
  const id = param(req, 'id');
  const input = body(req, yearSchema.partial());
  const found = await prisma.academicYear.findFirst({ where: { id, userId: userId(req) } });
  if (!found) throw notFound('Année académique');
  res.json({ data: await prisma.academicYear.update({ where: { id }, data: input }) });
});

academicYearsRouter.delete('/:id', async (req, res) => {
  const id = param(req, 'id');
  const found = await prisma.academicYear.findFirst({ where: { id, userId: userId(req) } });
  if (!found) throw notFound('Année académique');
  // Les matières associées sont conservées (semestre remis à vide).
  await prisma.academicYear.delete({ where: { id } });
  res.status(204).end();
});

semestersRouter.get('/', async (req, res) => {
  const q = query(req, z.object({ academicYearId: z.string().uuid().optional() }));
  const semesters = await prisma.semester.findMany({
    where: { academicYear: { userId: userId(req) }, academicYearId: q.academicYearId },
    include: { academicYear: { select: { id: true, name: true } } },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { startDate: 'asc' }],
  });
  res.json({ data: semesters });
});

semestersRouter.post('/', async (req, res) => {
  const input = body(req, yearSchema.extend({ academicYearId: z.string().uuid() }));
  const year = await prisma.academicYear.findFirst({ where: { id: input.academicYearId, userId: userId(req) } });
  if (!year) throw notFound('Année académique');
  const semester = await prisma.semester.create({ data: input });
  res.status(201).json({ data: semester });
});

semestersRouter.patch('/:id', async (req, res) => {
  const id = param(req, 'id');
  await ownedSemester(userId(req), id);
  const input = body(req, yearSchema.partial());
  res.json({ data: await prisma.semester.update({ where: { id }, data: input }) });
});

semestersRouter.delete('/:id', async (req, res) => {
  const id = param(req, 'id');
  await ownedSemester(userId(req), id);
  await prisma.semester.delete({ where: { id } });
  res.status(204).end();
});
