import type { QuestionType } from '@prisma/client';

/**
 * Formats des réponses (identiques côté client et serveur) :
 *  SINGLE_CHOICE   correct: number           réponse: number
 *  MULTIPLE_CHOICE correct: number[]         réponse: number[]
 *  TRUE_FALSE      correct: boolean          réponse: boolean
 *  SHORT_ANSWER    correct: string[] (acceptées) réponse: string
 *  FILL_BLANK      correct: string[] (acceptées) réponse: string
 *  MATCHING        correct: number[] (index droite pour chaque gauche) réponse: number[]
 */
export interface ScoreResult {
  isCorrect: boolean | null;
  // Réponse libre proche mais non identique : à vérifier par l'étudiant plutôt que rejetée.
  needsReview: boolean;
  credit: number; // 0..1
}

export function normalizeAnswer(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[«»"'’.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export function scoreResponse(type: QuestionType, correct: unknown, response: unknown): ScoreResult {
  if (response === null || response === undefined || response === '') return { isCorrect: false, needsReview: false, credit: 0 };
  switch (type) {
    case 'SINGLE_CHOICE': {
      const ok = Number(response) === Number(correct);
      return { isCorrect: ok, needsReview: false, credit: ok ? 1 : 0 };
    }
    case 'TRUE_FALSE': {
      const ok = Boolean(response) === Boolean(correct);
      return { isCorrect: ok, needsReview: false, credit: ok ? 1 : 0 };
    }
    case 'MULTIPLE_CHOICE': {
      const r = Array.isArray(response) ? response.map(Number) : [];
      const c = Array.isArray(correct) ? correct.map(Number) : [];
      const ok = sameSet(r, c);
      return { isCorrect: ok, needsReview: false, credit: ok ? 1 : 0 };
    }
    case 'MATCHING': {
      const r = Array.isArray(response) ? response.map(Number) : [];
      const c = Array.isArray(correct) ? correct.map(Number) : [];
      const good = c.filter((v, i) => r[i] === v).length;
      return { isCorrect: good === c.length && c.length > 0, needsReview: false, credit: c.length ? good / c.length : 0 };
    }
    case 'SHORT_ANSWER':
    case 'FILL_BLANK': {
      const accepted = (Array.isArray(correct) ? correct : [correct]).map((x) => normalizeAnswer(String(x)));
      const given = normalizeAnswer(String(response));
      if (accepted.includes(given)) return { isCorrect: true, needsReview: false, credit: 1 };
      // Tolérance aux fautes de frappe pour les réponses courtes.
      const close = accepted.some((a) => a.length >= 4 && levenshtein(a, given) <= Math.max(1, Math.floor(a.length / 8)));
      if (close) return { isCorrect: true, needsReview: false, credit: 1 };
      // Réponse longue contenant la réponse attendue : on ne tranche pas automatiquement.
      const contains = accepted.some((a) => a.length >= 3 && given.includes(a));
      if (type === 'SHORT_ANSWER' && contains) return { isCorrect: null, needsReview: true, credit: 0 };
      return { isCorrect: false, needsReview: false, credit: 0 };
    }
    default:
      return { isCorrect: null, needsReview: true, credit: 0 };
  }
}
