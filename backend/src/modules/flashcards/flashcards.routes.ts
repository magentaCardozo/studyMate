import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../services/prisma';
import { ownedCard, ownedDeck, resolvePlacement, tombstone } from '../../services/ownership';
import { schedule } from '../../services/srs';
import { body, param, query, userId } from '../../utils/http';

export const flashcardsRouter = Router();

const deckSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  courseId: z.string().uuid().nullish(),
  folderId: z.string().uuid().nullish(),
  lessonId: z.string().uuid().nullish(),
});

const cardSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().min(1, 'Question requise').max(2000),
  answer: z.string().trim().min(1, 'Réponse requise').max(5000),
  difficulty: z.number().int().min(1).max(3).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

async function deckCounts(deckIds: string[]) {
  const now = new Date();
  const [total, due, fresh] = await Promise.all([
    prisma.flashcard.groupBy({ by: ['deckId'], where: { deckId: { in: deckIds } }, _count: true }),
    prisma.flashcard.groupBy({ by: ['deckId'], where: { deckId: { in: deckIds }, dueAt: { lte: now }, repetitions: { gt: 0 } }, _count: true }),
    prisma.flashcard.groupBy({ by: ['deckId'], where: { deckId: { in: deckIds }, repetitions: 0, lastReviewedAt: null }, _count: true }),
  ]);
  const get = (arr: { deckId: string; _count: number }[], id: string) => arr.find((x) => x.deckId === id)?._count ?? 0;
  return (id: string) => ({ total: get(total, id), due: get(due, id), new: get(fresh, id) });
}

flashcardsRouter.get('/decks', async (req, res) => {
  const q = query(req, z.object({ courseId: z.string().uuid().optional(), lessonId: z.string().uuid().optional() }));
  const decks = await prisma.flashcardDeck.findMany({
    where: { userId: userId(req), courseId: q.courseId, lessonId: q.lessonId },
    include: { course: { select: { id: true, title: true } }, lesson: { select: { id: true, title: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  const counts = await deckCounts(decks.map((d) => d.id));
  res.json({ data: decks.map((d) => ({ ...d, counts: counts(d.id) })) });
});

flashcardsRouter.post('/decks', async (req, res) => {
  const uid = userId(req);
  const input = body(req, deckSchema.extend({ cards: z.array(cardSchema).max(500).optional() }));
  const placement = await resolvePlacement(uid, input);
  const deck = await prisma.flashcardDeck.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      userId: uid,
      title: input.title,
      origin: 'manual',
      ...placement,
      cards: input.cards?.length ? { create: input.cards.map(({ id, ...c }) => ({ ...(id ? { id } : {}), ...c })) } : undefined,
    },
  });
  res.status(201).json({ data: deck });
});

flashcardsRouter.get('/decks/:id', async (req, res) => {
  const deck = await ownedDeck(userId(req), param(req, 'id'));
  const full = await prisma.flashcardDeck.findUniqueOrThrow({
    where: { id: deck.id },
    include: {
      cards: { orderBy: { createdAt: 'asc' } },
      course: { select: { id: true, title: true } },
      lesson: { select: { id: true, title: true } },
    },
  });
  res.json({ data: { ...full, counts: (await deckCounts([deck.id]))(deck.id) } });
});

flashcardsRouter.patch('/decks/:id', async (req, res) => {
  const deck = await ownedDeck(userId(req), param(req, 'id'));
  const input = body(req, z.object({ title: z.string().trim().min(1).max(200) }));
  res.json({ data: await prisma.flashcardDeck.update({ where: { id: deck.id }, data: input }) });
});

flashcardsRouter.delete('/decks/:id', async (req, res) => {
  const uid = userId(req);
  const deck = await ownedDeck(uid, param(req, 'id'));
  await prisma.flashcardDeck.delete({ where: { id: deck.id } });
  await tombstone(uid, 'deck', deck.id);
  res.status(204).end();
});

flashcardsRouter.post('/decks/:id/cards', async (req, res) => {
  const deck = await ownedDeck(userId(req), param(req, 'id'));
  const input = body(req, cardSchema);
  const card = await prisma.flashcard.create({ data: { ...input, deckId: deck.id } });
  await prisma.flashcardDeck.update({ where: { id: deck.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ data: card });
});

flashcardsRouter.patch('/cards/:id', async (req, res) => {
  const card = await ownedCard(userId(req), param(req, 'id'));
  const input = body(req, cardSchema.omit({ id: true }).partial());
  res.json({ data: await prisma.flashcard.update({ where: { id: card.id }, data: input }) });
});

flashcardsRouter.delete('/cards/:id', async (req, res) => {
  const uid = userId(req);
  const card = await ownedCard(uid, param(req, 'id'));
  await prisma.flashcard.delete({ where: { id: card.id } });
  await tombstone(uid, 'flashcard', card.id);
  res.status(204).end();
});

// Cartes à étudier : cartes dues + nouvelles (ou toutes), filtrables par thème.
flashcardsRouter.get('/study', async (req, res) => {
  const q = query(
    req,
    z.object({
      deckId: z.string().uuid().optional(),
      courseId: z.string().uuid().optional(),
      mode: z.enum(['due', 'all', 'difficult']).default('due'),
      tag: z.string().max(40).optional(),
      shuffle: z.enum(['true', 'false']).default('false'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  );
  const uid = userId(req);
  if (q.deckId) await ownedDeck(uid, q.deckId);
  const now = new Date();
  const cards = await prisma.flashcard.findMany({
    where: {
      deck: { userId: uid, courseId: q.courseId },
      deckId: q.deckId,
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.mode === 'due' ? { dueAt: { lte: now } } : q.mode === 'difficult' ? { OR: [{ lapses: { gt: 0 } }, { easeFactor: { lt: 2.2 } }] } : {}),
    },
    orderBy: [{ dueAt: 'asc' }],
    take: q.limit,
    include: { deck: { select: { id: true, title: true, courseId: true } } },
  });
  if (q.shuffle === 'true') cards.sort(() => Math.random() - 0.5);
  res.json({ data: cards });
});

// Enregistre une réponse ; idempotent via clientOpId (révisions faites hors ligne).
flashcardsRouter.post('/cards/:id/review', async (req, res) => {
  const uid = userId(req);
  const card = await ownedCard(uid, param(req, 'id'));
  const input = body(
    req,
    z.object({ rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), clientOpId: z.string().uuid().optional(), reviewedAt: z.coerce.date().optional() }),
  );
  if (input.clientOpId) {
    const existing = await prisma.flashcardReview.findUnique({ where: { clientOpId: input.clientOpId } });
    if (existing) return res.json({ data: { card: await prisma.flashcard.findUnique({ where: { id: card.id } }), review: existing, duplicate: true } });
  }
  const reviewedAt = input.reviewedAt && input.reviewedAt < new Date() ? input.reviewedAt : new Date();
  const next = schedule(card, input.rating, reviewedAt);
  const [updated, review] = await prisma.$transaction([
    prisma.flashcard.update({
      where: { id: card.id },
      data: { easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions, lapses: next.lapses, dueAt: next.dueAt, lastReviewedAt: reviewedAt },
    }),
    prisma.flashcardReview.create({
      data: { userId: uid, flashcardId: card.id, responseRating: input.rating, reviewedAt, nextReviewAt: next.dueAt, intervalDays: next.intervalDays, clientOpId: input.clientOpId },
    }),
  ]);
  res.json({ data: { card: updated, review } });
});

flashcardsRouter.get('/cards/:id/reviews', async (req, res) => {
  const card = await ownedCard(userId(req), param(req, 'id'));
  res.json({ data: await prisma.flashcardReview.findMany({ where: { flashcardId: card.id }, orderBy: { reviewedAt: 'desc' }, take: 100 }) });
});
