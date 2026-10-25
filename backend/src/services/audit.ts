import type { Request } from 'express';
import { prisma } from './prisma';
import { logger } from '../config/logger';

export async function audit(event: string, req: Request | null, userId?: string | null, metadata: object = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        userId: userId ?? null,
        ip: req?.ip ?? null,
        userAgent: req?.headers['user-agent']?.slice(0, 300) ?? null,
        metadata,
      },
    });
  } catch (err) {
    logger.warn({ err, event }, "Échec d'écriture du journal d'audit");
  }
}
