import { prisma } from './prisma';

type PreferenceKey = 'sessions' | 'exams' | 'flashcards' | 'documents';

interface Settings {
  notifications?: Partial<Record<PreferenceKey, boolean>>;
  quietHours?: { start: string; end: string };
}

export function inQuietHours(settings: Settings, timezone: string, now = new Date()) {
  const q = settings.quietHours;
  if (!q?.start || !q?.end) return false;
  const local = new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = toMin(local), start = toMin(q.start), end = toMin(q.end);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

/**
 * Crée une notification dans l'application en respectant les préférences.
 * La clé de déduplication évite les rappels répétitifs. Les heures calmes
 * ne s'appliquent qu'aux rappels (pas aux résultats de traitement).
 */
export async function notify(
  userId: string,
  n: { type: string; title: string; body: string; link?: string; dedupeKey: string; preference: PreferenceKey; respectQuietHours?: boolean },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true, timezone: true } });
  if (!user) return null;
  const settings = (user.settings ?? {}) as Settings;
  if (settings.notifications?.[n.preference] === false) return null;
  if (n.respectQuietHours && inQuietHours(settings, user.timezone)) return null;
  try {
    return await prisma.notification.create({
      data: { userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey },
    });
  } catch {
    return null; // déjà envoyée (clé unique)
  }
}

/** Rappels planifiés, exécutés périodiquement par le worker. */
export async function generateReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const sessions = await prisma.studySession.findMany({
    where: { status: 'PLANNED', scheduledStart: { gte: now, lte: soon } },
    include: { course: { select: { title: true } }, user: { select: { timezone: true } } },
  });
  for (const s of sessions) {
    const time = new Intl.DateTimeFormat('fr-FR', { timeZone: s.user.timezone, hour: '2-digit', minute: '2-digit' }).format(s.scheduledStart);
    await notify(s.userId, {
      type: 'session_reminder',
      title: 'Session de révision bientôt',
      body: `${s.course.title} — début à ${time}.`,
      link: '/coach',
      dedupeKey: `session:${s.id}`,
      preference: 'sessions',
      respectQuietHours: true,
    });
  }

  const inThreeDays = new Date(now.getTime() + 3 * 86400_000);
  const exams = await prisma.studyGoal.findMany({
    where: { kind: 'exam', status: 'active', targetDate: { gte: now, lte: inThreeDays } },
    include: { course: { select: { title: true } } },
  });
  const day = now.toISOString().slice(0, 10);
  for (const e of exams) {
    const days = Math.max(0, Math.ceil((e.targetDate!.getTime() - now.getTime()) / 86400_000));
    await notify(e.userId, {
      type: 'exam_reminder',
      title: 'Examen à venir',
      body: `${e.title}${e.course ? ` (${e.course.title})` : ''} — ${days <= 1 ? 'demain' : `dans ${days} jours`}.`,
      link: '/calendar',
      dedupeKey: `exam:${e.id}:${day}`,
      preference: 'exams',
      respectQuietHours: true,
    });
  }

  const due = await prisma.flashcard.groupBy({ by: ['deckId'], where: { dueAt: { lte: now } }, _count: true });
  if (due.length) {
    const decks = await prisma.flashcardDeck.findMany({ where: { id: { in: due.map((d) => d.deckId) } }, select: { id: true, userId: true } });
    const perUser = new Map<string, number>();
    for (const d of due) {
      const deck = decks.find((x) => x.id === d.deckId);
      if (deck) perUser.set(deck.userId, (perUser.get(deck.userId) ?? 0) + d._count);
    }
    for (const [uid, count] of perUser) {
      if (count < 5) continue; // pas de rappel pour quelques cartes isolées
      await notify(uid, {
        type: 'flashcards_due',
        title: 'Cartes à réviser',
        body: `${count} cartes sont prêtes pour une révision.`,
        link: '/revision',
        dedupeKey: `flashcards:${day}`,
        preference: 'flashcards',
        respectQuietHours: true,
      });
    }
  }
}
