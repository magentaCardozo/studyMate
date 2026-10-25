import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { signAccessToken } from '../../middleware/auth';
import { AppError, unauthorized } from '../../utils/errors';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = () => crypto.randomBytes(48).toString('base64url');

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function publicUser(u: {
  id: string;
  name: string;
  email: string;
  preferredLanguage: string;
  timezone: string;
  faculty: string | null;
  institutionId: string | null;
  settings: unknown;
  aiConsentAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    preferredLanguage: u.preferredLanguage,
    timezone: u.timezone,
    faculty: u.faculty,
    institutionId: u.institutionId,
    settings: u.settings,
    aiConsentAt: u.aiConsentAt,
    createdAt: u.createdAt,
  };
}

export async function issueTokens(
  user: { id: string; email: string },
  clientType: string,
  userAgent?: string,
  familyId: string = crypto.randomUUID(),
) {
  const refreshToken = randomToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      familyId,
      clientType,
      userAgent: userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400_000),
    },
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    refreshTokenId: record.id,
    accessExpiresIn: env.JWT_ACCESS_TTL_MINUTES * 60,
  };
}

/**
 * Rotation des jetons de rafraîchissement. Réutiliser un jeton déjà remplacé
 * signale un vol probable : toute la famille de jetons est révoquée.
 */
export async function rotateRefreshToken(token: string, userAgent?: string) {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record) throw unauthorized('Session invalide.', 'INVALID_REFRESH');
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new AppError(401, 'REFRESH_REUSED', 'Session révoquée pour des raisons de sécurité. Reconnectez-vous.');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Session expirée. Reconnectez-vous.', 'REFRESH_EXPIRED');
  const tokens = await issueTokens(record.user, record.clientType, userAgent, record.familyId);
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date(), replacedBy: tokens.refreshTokenId },
  });
  return { user: record.user, tokens, reused: false };
}

export async function revokeRefreshToken(token: string) {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (record && !record.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return record?.userId ?? null;
}

export async function createPasswordReset(userId: string) {
  const token = randomToken();
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

export async function consumePasswordReset(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, 'RESET_INVALID', 'Ce lien de réinitialisation est invalide ou expiré.');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Changer de mot de passe déconnecte toutes les sessions.
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return record.userId;
}
