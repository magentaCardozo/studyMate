import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { storage, userPrefix } from '../../services/storage';
import { audit } from '../../services/audit';
import { body, userId } from '../../utils/http';
import { notFound, unauthorized } from '../../utils/errors';
import { publicUser, verifyPassword } from '../auth/auth.service';
import { createDemoContent, deleteDemoContent } from './demo';

export const usersRouter = Router();

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM');
const minutes = z.number().int().min(0).max(720);

const settingsSchema = z
  .object({
    availability: z.object({ mon: minutes, tue: minutes, wed: minutes, thu: minutes, fri: minutes, sat: minutes, sun: minutes }).partial(),
    preferredSessionMinutes: z.number().int().min(15).max(180),
    preferredStartTime: time,
    notifications: z.object({ sessions: z.boolean(), exams: z.boolean(), flashcards: z.boolean(), documents: z.boolean() }).partial(),
    quietHours: z.object({ start: time, end: time }),
    offline: z.object({ wifiOnly: z.boolean() }),
    courseView: z.enum(['grid', 'list']),
  })
  .partial();

usersRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: userId(req) }, include: { institution: true } });
  if (!user) throw notFound('Utilisateur');
  res.json({ data: { ...publicUser(user), institution: user.institution } });
});

usersRouter.patch('/me', async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(100).optional(),
      preferredLanguage: z.enum(['fr', 'en']).optional(),
      timezone: z.string().max(64).optional(),
      faculty: z.string().trim().max(120).nullish(),
      institutionName: z.string().trim().max(160).nullish(),
    }),
  );
  let institutionId: string | null | undefined;
  if (input.institutionName) {
    const inst = await prisma.institution.upsert({
      where: { name_country: { name: input.institutionName, country: 'CD' } },
      update: {},
      create: { name: input.institutionName, country: 'CD' },
    });
    institutionId = inst.id;
  } else if (input.institutionName === null) institutionId = null;
  const user = await prisma.user.update({
    where: { id: userId(req) },
    data: {
      name: input.name,
      preferredLanguage: input.preferredLanguage,
      timezone: input.timezone,
      faculty: input.faculty,
      institutionId,
    },
    include: { institution: true },
  });
  res.json({ data: { ...publicUser(user), institution: user.institution } });
});

usersRouter.patch('/me/settings', async (req, res) => {
  const input = body(req, settingsSchema);
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(req) } });
  const prev = (current.settings ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(input)) {
    merged[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...((prev[k] as object) ?? {}), ...v } : v;
  }
  const user = await prisma.user.update({ where: { id: current.id }, data: { settings: merged as object } });
  res.json({ data: publicUser(user) });
});

// Consentement explicite au traitement des documents par un fournisseur d'IA tiers.
usersRouter.post('/me/ai-consent', async (req, res) => {
  const { granted } = body(req, z.object({ granted: z.boolean() }));
  const user = await prisma.user.update({ where: { id: userId(req) }, data: { aiConsentAt: granted ? new Date() : null } });
  await audit(granted ? 'privacy.ai_consent_granted' : 'privacy.ai_consent_revoked', req, user.id);
  res.json({ data: publicUser(user) });
});

// Export des données personnelles (portabilité).
usersRouter.get('/me/export', async (req, res) => {
  const uid = userId(req);
  const [user, years, courses, notes, decks, quizzes, attempts, goals, sessions, summaries, documents] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: uid } }),
    prisma.academicYear.findMany({ where: { userId: uid }, include: { semesters: true } }),
    prisma.course.findMany({ where: { userId: uid }, include: { folders: true, lessons: true } }),
    prisma.note.findMany({ where: { userId: uid } }),
    prisma.flashcardDeck.findMany({ where: { userId: uid }, include: { cards: true } }),
    prisma.quiz.findMany({ where: { userId: uid }, include: { questions: true } }),
    prisma.quizAttempt.findMany({ where: { userId: uid }, include: { responses: true } }),
    prisma.studyGoal.findMany({ where: { userId: uid } }),
    prisma.studySession.findMany({ where: { userId: uid } }),
    prisma.summary.findMany({ where: { userId: uid } }),
    prisma.document.findMany({ where: { userId: uid }, select: { id: true, fileName: true, mimeType: true, fileSize: true, courseId: true, folderId: true, source: true, createdAt: true } }),
  ]);
  await audit('privacy.export', req, uid);
  res.setHeader('Content-Disposition', 'attachment; filename="studymate-export.json"');
  res.json({ exportedAt: new Date(), user: publicUser(user), years, courses, notes, decks, quizzes, attempts, goals, sessions, summaries, documents });
});

// Suppression définitive du compte, des documents stockés et de toutes les données.
usersRouter.delete('/me', async (req, res) => {
  const { password } = body(req, z.object({ password: z.string().min(1) }));
  const uid = userId(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid } });
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }
  await storage.deletePrefix(userPrefix(uid));
  await audit('privacy.account_deleted', req, null, { userId: uid });
  await prisma.user.delete({ where: { id: uid } });
  res.clearCookie('sm_access', { path: '/api' });
  res.clearCookie('sm_refresh', { path: '/api/v1/auth' });
  res.status(204).end();
});

usersRouter.post('/me/demo-content', async (req, res) => {
  const course = await createDemoContent(userId(req));
  res.status(201).json({ data: course });
});

usersRouter.delete('/me/demo-content', async (req, res) => {
  await deleteDemoContent(userId(req));
  res.status(204).end();
});
