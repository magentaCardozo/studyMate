import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { audit } from '../../services/audit';
import { authLimiter } from '../../middleware/rate-limit';
import { ACCESS_COOKIE, REFRESH_COOKIE, requireAuth } from '../../middleware/auth';
import { body, userId } from '../../utils/http';
import { AppError, conflict, unauthorized } from '../../utils/errors';
import {
  consumePasswordReset,
  createPasswordReset,
  hashPassword,
  issueTokens,
  publicUser,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from './auth.service';
import { createStarterStructure } from '../users/starter';

export const authRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('studymate-dummy-password', 10);

const password = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .max(128)
  .regex(/[A-Za-z]/, 'Doit contenir une lettre')
  .regex(/[0-9]/, 'Doit contenir un chiffre');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(100),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  password,
  preferredLanguage: z.enum(['fr', 'en']).default('fr'),
  timezone: z.string().max(64).default('Africa/Kinshasa'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

// Les clients natifs reçoivent les jetons dans le corps ; le web uniquement en cookies HttpOnly.
const isNativeClient = (req: Request) => req.headers['x-client'] === 'android';

function cookieOptions(path: string, maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict' as const,
    path,
    maxAge: maxAgeMs,
  };
}

function sendSession(req: Request, res: Response, status: number, user: Parameters<typeof publicUser>[0], tokens: Awaited<ReturnType<typeof issueTokens>>) {
  if (isNativeClient(req)) {
    return res.status(status).json({
      data: {
        user: publicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresIn: tokens.accessExpiresIn,
      },
    });
  }
  res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions('/api', tokens.accessExpiresIn * 1000));
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions('/api/v1/auth', env.JWT_REFRESH_TTL_DAYS * 86400_000));
  return res.status(status).json({ data: { user: publicUser(user), accessExpiresIn: tokens.accessExpiresIn } });
}

function clearCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = body(req, registerSchema);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Un compte existe déjà avec cette adresse e-mail.');
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      preferredLanguage: input.preferredLanguage,
      timezone: input.timezone,
      settings: {
        availability: { mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 180, sun: 60 },
        preferredSessionMinutes: 45,
        preferredStartTime: '18:00',
        notifications: { sessions: true, exams: true, flashcards: true, documents: true },
        quietHours: { start: '22:00', end: '07:00' },
        offline: { wifiOnly: true },
      },
    },
  });
  await createStarterStructure(user.id);
  await audit('auth.register', req, user.id);
  const tokens = await issueTokens(user, isNativeClient(req) ? 'android' : 'web', req.headers['user-agent']);
  return sendSession(req, res, 201, user, tokens);
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = body(req, loginSchema);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Comparaison effectuée même si l'utilisateur n'existe pas (temps de réponse homogène).
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) {
    await audit('auth.login_failed', req, user?.id ?? null, { email: input.email });
    throw unauthorized('Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }
  await audit('auth.login', req, user.id);
  const tokens = await issueTokens(user, isNativeClient(req) ? 'android' : 'web', req.headers['user-agent']);
  return sendSession(req, res, 200, user, tokens);
});

authRouter.post('/refresh', authLimiter, async (req, res) => {
  const token: string | undefined = isNativeClient(req) ? req.body?.refreshToken : req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('Session absente.', 'NO_REFRESH');
  try {
    const { user, tokens } = await rotateRefreshToken(token, req.headers['user-agent']);
    return sendSession(req, res, 200, user, tokens);
  } catch (e) {
    if (e instanceof AppError && e.code === 'REFRESH_REUSED') await audit('auth.refresh_reuse_detected', req, null);
    clearCookies(res);
    throw e;
  }
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
  if (token) {
    const uid = await revokeRefreshToken(token);
    if (uid) await audit('auth.logout', req, uid);
  }
  clearCookies(res);
  res.status(204).end();
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  const uid = userId(req);
  await prisma.refreshToken.updateMany({ where: { userId: uid, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit('auth.logout_all', req, uid);
  clearCookies(res);
  res.status(204).end();
});

authRouter.post('/password-reset/request', authLimiter, async (req, res) => {
  const { email } = body(req, z.object({ email: z.string().trim().toLowerCase().email() }));
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createPasswordReset(user.id);
    const link = `${env.PUBLIC_WEB_URL}/reset-password?token=${token}`;
    // Aucun service d'e-mail n'est configuré : en développement, le lien est écrit dans les journaux.
    if (env.MAIL_PROVIDER === 'console' && env.NODE_ENV !== 'production') {
      logger.info({ email, link }, 'Lien de réinitialisation (fournisseur e-mail : console)');
    }
    await audit('auth.password_reset_requested', req, user.id);
  }
  // Réponse identique que le compte existe ou non.
  res.status(202).json({ data: { message: 'Si un compte existe, un lien de réinitialisation a été envoyé.' } });
});

authRouter.post('/password-reset/confirm', authLimiter, async (req, res) => {
  const input = body(req, z.object({ token: z.string().min(20), password }));
  const uid = await consumePasswordReset(input.token, input.password);
  await audit('auth.password_reset', req, uid);
  res.json({ data: { message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' } });
});
