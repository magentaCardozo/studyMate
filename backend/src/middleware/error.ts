import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route introuvable.' } });
}

// Format d'erreur unique : { error: { code, message, details? } }. Jamais de pile en production.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Cette ressource existe déjà.' } });
    }
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Corps de requête JSON invalide.' } });
  }
  if (e?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Fichier ou requête trop volumineux.' } });
  }
  logger.error({ err, path: req.path, method: req.method }, 'Erreur non gérée');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur inattendue est survenue. Réessayez dans un instant.',
      ...(env.NODE_ENV === 'development' ? { details: String((err as Error)?.message ?? err) } : {}),
    },
  });
}
