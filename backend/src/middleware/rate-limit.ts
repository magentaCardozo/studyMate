import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

const handler = (message: string) => ({
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  ...handler('Trop de tentatives. Réessayez dans quelques minutes.'),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  ...handler('Trop de requêtes. Ralentissez un instant.'),
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anon',
  ...handler("Trop de demandes à l'assistant. Patientez une minute."),
});
