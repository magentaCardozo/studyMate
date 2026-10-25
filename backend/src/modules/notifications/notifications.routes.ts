import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { body, pageArgs, pageMeta, pagination, param, query, userId } from '../../utils/http';
import { notFound } from '../../utils/errors';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const q = query(req, pagination.extend({ unread: z.enum(['true', 'false']).optional() }));
  const where = { userId: userId(req), ...(q.unread === 'true' ? { readAt: null } : {}) };
  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: userId(req), readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
  ]);
  res.json({ data: items, meta: { ...pageMeta(q, total), unread } });
});

notificationsRouter.post('/read', async (req, res) => {
  const input = body(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }));
  await prisma.notification.updateMany({
    where: { userId: userId(req), readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

notificationsRouter.delete('/:id', async (req, res) => {
  const n = await prisma.notification.findFirst({ where: { id: param(req, 'id'), userId: userId(req) } });
  if (!n) throw notFound('Notification');
  await prisma.notification.delete({ where: { id: n.id } });
  res.status(204).end();
});
