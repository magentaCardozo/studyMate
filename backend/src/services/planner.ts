/**
 * Planificateur de révisions déterministe (sans IA) : il fonctionne hors fournisseur
 * et ses recommandations sont explicables. Il ne dépasse jamais la disponibilité
 * déclarée : une session manquée est redistribuée dans le temps restant, pas ajoutée.
 */

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface PlannerCourse {
  id: string;
  title: string;
  importance: number; // 1..5
  confidence: number | null; // 1..5
  examDate: Date | null;
  lessons: { id: string; title: string; completed: boolean; estimatedMinutes: number | null }[];
  avgQuizScore: number | null; // 0..1
  difficultCards: number;
  dueCards: number;
}

export interface PlannerInput {
  now: Date;
  timezone: string;
  availability: Partial<Record<Weekday, number>>; // minutes par jour
  sessionMinutes: number;
  startTime: string; // HH:MM, heure locale
  courses: PlannerCourse[];
  // Minutes déjà occupées par des sessions manuelles, par date locale AAAA-MM-JJ.
  busyMinutes: Record<string, number>;
  horizonDays?: number;
}

export interface PlannedSession {
  courseId: string;
  lessonId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  activityType: 'lesson' | 'flashcards' | 'quiz' | 'mock_exam';
  objective: string;
  reason: string;
}

/** Date locale (AAAA-MM-JJ) dans un fuseau horaire. */
export function localDate(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Convertit une heure locale (date + HH:MM dans un fuseau) en instant UTC. */
export function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asLocal - guess));
}

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => WEEKDAYS[new Date(date + 'T12:00:00Z').getUTCDay()];

export function generatePlan(input: PlannerInput): PlannedSession[] {
  const today = localDate(input.now, input.timezone);
  const exams = input.courses.map((c) => c.examDate).filter(Boolean) as Date[];
  const lastExam = exams.length ? localDate(new Date(Math.max(...exams.map((e) => e.getTime()))), input.timezone) : null;
  const horizon = Math.min(60, input.horizonDays ?? 14);
  const endDate = lastExam ?? addDays(today, horizon);
  const sessions: PlannedSession[] = [];
  const assigned = new Map<string, number>();
  const lessonQueue = new Map(input.courses.map((c) => [c.id, c.lessons.filter((l) => !l.completed)]));
  const mockDone = new Set<string>();
  const sinceReview = new Map<string, number>();

  for (let offset = 0; offset < 61; offset++) {
    const day = addDays(today, offset);
    if (day > endDate) break;
    const capacity = Math.max(0, (input.availability[weekdayOf(day)] ?? 0) - (input.busyMinutes[day] ?? 0));
    const slots = Math.floor(capacity / input.sessionMinutes);
    let cursor = zonedToUtc(day, input.startTime, input.timezone);
    if (offset === 0) {
      // Aujourd'hui : on ne planifie pas dans le passé.
      const minStart = new Date(input.now.getTime() + 15 * 60_000);
      if (cursor < minStart) cursor = new Date(Math.ceil(minStart.getTime() / (15 * 60_000)) * 15 * 60_000);
      if (localDate(cursor, input.timezone) !== day) continue;
    }
    let lastCourse: string | null = null;
    for (let s = 0; s < slots; s++) {
      const candidates = input.courses
        .map((c) => {
          const examDay = c.examDate ? localDate(c.examDate, input.timezone) : null;
          if (examDay && day >= examDay) return null; // examen passé ou le jour même
          const daysLeft = examDay ? Math.max(1, (Date.parse(examDay) - Date.parse(day)) / 86400_000) : horizon;
          const remaining = lessonQueue.get(c.id)!.length;
          const urgency = 1 / Math.pow(daysLeft, 0.7);
          const weakness = 1 + (5 - (c.confidence ?? 3)) / 4 + (c.avgQuizScore === null ? 0.3 : 1 - c.avgQuizScore) + Math.min(c.difficultCards, 20) / 40;
          const workload = 1 + remaining / Math.max(1, c.lessons.length);
          const priority = (urgency * weakness * workload * (c.importance / 3)) / (1 + (assigned.get(c.id) ?? 0) * 0.3);
          return { c, priority: c.id === lastCourse ? priority * 0.6 : priority, daysLeft, examDay, urgency, weakness };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => b.priority - a.priority);
      const pick = candidates[0];
      if (!pick) break;
      const { c, daysLeft } = pick;
      const queue = lessonQueue.get(c.id)!;
      const reviews = sinceReview.get(c.id) ?? 0;
      let activityType: PlannedSession['activityType'];
      let lessonId: string | null = null;
      let objective: string;
      if (pick.examDay && daysLeft <= 2 && !mockDone.has(c.id)) {
        activityType = 'mock_exam';
        mockDone.add(c.id);
        objective = `Examen blanc de ${c.title} en conditions réelles.`;
      } else if (queue.length && reviews < 2) {
        const lesson = queue.shift()!;
        activityType = 'lesson';
        lessonId = lesson.id;
        objective = `Étudier « ${lesson.title} » et noter les points difficiles.`;
        sinceReview.set(c.id, reviews + 1);
      } else if (c.dueCards > 0 || c.difficultCards > 0 || reviews >= 2) {
        activityType = c.dueCards > 0 || c.difficultCards > 0 ? 'flashcards' : 'quiz';
        objective = activityType === 'flashcards' ? `Réviser les cartes de ${c.title} (priorité aux cartes difficiles).` : `Quiz d’entraînement sur ${c.title} pour vérifier les acquis.`;
        sinceReview.set(c.id, 0);
      } else {
        activityType = 'quiz';
        objective = `Quiz d’entraînement sur ${c.title} pour vérifier les acquis.`;
        sinceReview.set(c.id, 0);
      }
      const why: string[] = [];
      if (pick.examDay) why.push(`examen dans ${Math.round(daysLeft)} jour${daysLeft >= 2 ? 's' : ''}`);
      if (queue.length + (lessonId ? 1 : 0) > 0) why.push(`${queue.length + (lessonId ? 1 : 0)} leçon(s) non terminée(s)`);
      if (c.avgQuizScore !== null && c.avgQuizScore < 0.6) why.push(`résultats de quiz récents à ${Math.round(c.avgQuizScore * 100)} %`);
      if (c.confidence !== null && c.confidence <= 2) why.push('confiance déclarée faible');
      if (c.difficultCards > 0) why.push(`${c.difficultCards} carte(s) marquée(s) difficiles`);
      const end = new Date(cursor.getTime() + input.sessionMinutes * 60_000);
      sessions.push({
        courseId: c.id,
        lessonId,
        scheduledStart: cursor,
        scheduledEnd: end,
        activityType,
        objective,
        reason: why.length ? `Recommandé : ${why.join(', ')}.` : 'Révision régulière pour consolider vos acquis.',
      });
      assigned.set(c.id, (assigned.get(c.id) ?? 0) + 1);
      lastCourse = c.id;
      cursor = new Date(end.getTime() + 10 * 60_000); // pause de 10 minutes
    }
  }
  return sessions;
}
