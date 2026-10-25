import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError, unauthorized } from '../utils/errors';

export const ACCESS_COOKIE = 'sm_access';
export const REFRESH_COOKIE = 'sm_refresh';
export const CSRF_HEADER = 'x-requested-with';

export interface AccessClaims {
  sub: string;
  email: string;
  typ: 'access';
}

export function signAccessToken(user: { id: string; email: string }) {
  return jwt.sign({ sub: user.id, email: user.email, typ: 'access' } satisfies AccessClaims, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`,
    issuer: 'studymate-api',
    audience: 'studymate-clients',
  });
}

function verify(token: string): AccessClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'studymate-api',
      audience: 'studymate-clients',
    }) as AccessClaims;
    if (claims.typ !== 'access') throw new Error('type');
    return claims;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw unauthorized('Session expirée.', 'TOKEN_EXPIRED');
    throw unauthorized('Jeton invalide.', 'INVALID_TOKEN');
  }
}

/**
 * Authentifie la requête via l'en-tête Bearer (Android) ou le cookie HttpOnly (web).
 * Pour l'authentification par cookie, les requêtes modifiantes doivent porter
 * l'en-tête X-Requested-With (protection CSRF en plus de SameSite).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const claims = verify(header.slice(7));
    req.user = { id: claims.sub, email: claims.email };
    req.authVia = 'bearer';
    return next();
  }
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (cookie) {
    const claims = verify(cookie);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers[CSRF_HEADER] !== 'StudyMate') {
      throw new AppError(403, 'CSRF_REJECTED', 'Requête refusée (protection CSRF).');
    }
    req.user = { id: claims.sub, email: claims.email };
    req.authVia = 'cookie';
    return next();
  }
  throw unauthorized();
}
