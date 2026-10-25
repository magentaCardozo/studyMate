/**
 * Répétition espacée — variante de SM-2.
 * Les intervalles dépendent uniquement des réponses réelles de l'étudiant.
 *   0 = « À revoir »   1 = « Difficile »   2 = « Compris »   3 = « Facile »
 */
export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface SrsResult extends SrsState {
  dueAt: Date;
}

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365;

export function schedule(state: SrsState, rating: 0 | 1 | 2 | 3, now = new Date()): SrsResult {
  let { easeFactor, intervalDays, repetitions, lapses } = state;
  if (rating === 0) {
    lapses += 1;
    repetitions = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
    intervalDays = 10 / (24 * 60); // revue dans 10 minutes
  } else if (rating === 1) {
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
    intervalDays = repetitions === 0 ? 1 : Math.max(1, intervalDays * 1.2);
    repetitions += 1;
  } else if (rating === 2) {
    intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(1, intervalDays * easeFactor);
    repetitions += 1;
  } else {
    easeFactor = easeFactor + 0.15;
    intervalDays = repetitions === 0 ? 3 : Math.max(2, intervalDays * easeFactor * 1.3);
    repetitions += 1;
  }
  intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays * 1000) / 1000);
  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + intervalDays * 86400_000),
  };
}

/** Une carte est considérée « maîtrisée » lorsqu'elle tient au moins 21 jours. */
export const isMastered = (intervalDays: number) => intervalDays >= 21;
