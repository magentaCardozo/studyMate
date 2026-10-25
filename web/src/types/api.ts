export type LessonStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type ProcessingStatus = 'PENDING_UPLOAD' | 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'FILL_BLANK' | 'MATCHING';
export type SessionStatus = 'PLANNED' | 'COMPLETED' | 'SKIPPED' | 'MISSED';

export interface UserSettings {
  availability?: Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', number>>;
  preferredSessionMinutes?: number;
  preferredStartTime?: string;
  notifications?: { sessions?: boolean; exams?: boolean; flashcards?: boolean; documents?: boolean };
  quietHours?: { start: string; end: string };
  offline?: { wifiOnly: boolean };
  courseView?: 'grid' | 'list';
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferredLanguage: 'fr' | 'en';
  timezone: string;
  faculty: string | null;
  institutionId: string | null;
  institution?: { id: string; name: string } | null;
  settings: UserSettings;
  aiConsentAt: string | null;
  createdAt: string;
}

export interface Semester {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  academicYearId: string;
  _count?: { courses: number };
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  semesters: Semester[];
}

export interface Course {
  id: string;
  title: string;
  code: string | null;
  faculty: string | null;
  description: string | null;
  color: string | null;
  importance: number;
  confidence: number | null;
  isDemo: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  lastActivityAt: string | null;
  semester: { id: string; name: string } | null;
  academicYear: { id: string; name: string } | null;
  stats?: { folders: number; lessons: number; documents: number; completedLessons: number; progress: number | null };
}

export interface TreeLesson {
  id: string;
  title: string;
  status: LessonStatus;
  sortOrder: number;
  estimatedMinutes: number | null;
}

export interface TreeFolder {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parentFolderId: string | null;
  sortOrder: number;
  updatedAt: string;
  counts: { lessons: number; documents: number; subfolders: number };
  children: TreeFolder[];
  lessons: TreeLesson[];
}

export interface CourseDetail extends Course {
  tree: { folders: TreeFolder[]; lessons: TreeLesson[]; rootDocuments: number };
}

export interface Crumb {
  id: string;
  name: string;
}

export interface DocumentItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Dossier de la base de connaissances (toujours défini). */
  courseId: string;
  folderId: string | null;
  source: 'file' | 'scan' | 'text';
  processingStatus: ProcessingStatus;
  processingError: string | null;
  extractionMethod: string | null;
  pageCount: number | null;
  pinned: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  course?: { id: string; title: string } | null;
  folder?: { id: string; name: string } | null;
}

export interface DocumentDetail extends DocumentItem {
  notes: { id: string; title: string; updatedAt: string }[];
  jobs: { id: string; status: string; attempts: number; errorCode: string | null }[];
  chunkCount: number;
  breadcrumb: Crumb[];
}

export interface FolderDetail {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  parentFolderId: string | null;
  course: { id: string; title: string; color: string | null };
  breadcrumb: Crumb[];
  children: { id: string; name: string; description: string | null; updatedAt: string; _count: { lessons: number; documents: number; children: number } }[];
  lessons: { id: string; title: string; description: string | null; status: LessonStatus; estimatedMinutes: number | null; updatedAt: string; _count: { notes: number } }[];
  documents: DocumentItem[];
  notes: { id: string; title: string; updatedAt: string }[];
}

export interface Item {
  title: string;
  body: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  folderId: string | null;
  title: string;
  description: string | null;
  content: string;
  learningObjectives: string[];
  definitions: Item[];
  formulas: Item[];
  examples: Item[];
  exercises: Item[];
  status: LessonStatus;
  estimatedMinutes: number | null;
  revisionDate: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface LessonDetail extends Lesson {
  course: { id: string; title: string; color: string | null };
  breadcrumb: Crumb[];
  notes: { id: string; title: string; updatedAt: string; documentId: string | null }[];
  decks: { id: string; title: string; origin: string; _count: { cards: number } }[];
  quizzes: { id: string; title: string; createdAt: string; configuration: QuizConfig; _count: { questions: number } }[];
  summaries: { id: string; title: string; length: string; createdAt: string }[];
  sessions: StudySession[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  courseId: string | null;
  folderId: string | null;
  lessonId: string | null;
  documentId: string | null;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  course?: { id: string; title: string } | null;
  folder?: { id: string; name: string } | null;
  lesson?: { id: string; title: string } | null;
  document?: { id: string; fileName: string } | null;
}

export interface SourceRef {
  sourceId: string;
  kind: 'document' | 'lesson';
  documentId: string | null;
  lessonId: string | null;
  title: string;
  page: number | null;
}

export interface SummaryContent {
  mainTopic: string;
  keyConcepts: { term: string; explanation: string; sources: SourceRef[] }[];
  definitions: { term: string; definition: string; sources: SourceRef[] }[];
  formulas: { expression: string; description: string; sources: SourceRef[] }[];
  explanations: { title: string; steps: string[]; sources: SourceRef[] }[];
  examples: { title: string; content: string; sources: SourceRef[] }[];
  commonMistakes: { mistake: string; correction: string; sources: SourceRef[] }[];
  recap: string;
  selfAssessment: string[];
  additionalExplanations: { title: string; content: string }[];
  limitations: string[];
  insufficientSource: boolean;
}

export interface Summary {
  id: string;
  title: string;
  length: string;
  content: SummaryContent;
  sources: SourceRef[];
  provider: string;
  model: string;
  courseId: string | null;
  lessonId: string | null;
  createdAt: string;
  course?: { id: string; title: string } | null;
  lesson?: { id: string; title: string } | null;
}

export interface Flashcard {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  sourceReference: SourceRef | null;
  difficulty: number | null;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
  deck?: { id: string; title: string; courseId: string | null };
}

export interface Deck {
  id: string;
  title: string;
  origin: string;
  provider: string | null;
  courseId: string | null;
  lessonId: string | null;
  sources: { refs?: SourceRef[]; limitations?: string[] } | SourceRef[];
  updatedAt: string;
  course?: { id: string; title: string } | null;
  lesson?: { id: string; title: string } | null;
  counts: { total: number; due: number; new: number };
  cards?: Flashcard[];
}

export interface QuizConfig {
  mode?: 'practice' | 'exam';
  timed?: boolean;
  durationMinutes?: number | null;
  difficulty?: string;
  questionTypes?: string[];
  isMockExam?: boolean;
  limitations?: string[];
}

export interface Quiz {
  id: string;
  title: string;
  courseId: string | null;
  lessonId: string | null;
  origin: string;
  provider: string | null;
  configuration: QuizConfig;
  createdAt: string;
  course?: { id: string; title: string } | null;
  lesson?: { id: string; title: string } | null;
  _count?: { questions: number };
  lastAttempt?: { id: string; status: string; score: number | null; maxScore: number | null; completedAt: string | null } | null;
}

export interface Question {
  id: string;
  ordinal: number;
  question: string;
  questionType: QuestionType;
  options: string[] | { left: string[]; right: string[] };
  points: number;
  topic: string | null;
  difficulty: string | null;
  correctAnswer?: unknown;
  explanation?: string | null;
  sourceReference?: (SourceRef & { all?: SourceRef[] }) | null;
  uncertain?: boolean;
  response?: unknown;
  isCorrect?: boolean | null;
}

export interface Attempt {
  id: string;
  quizId: string;
  mode: 'practice' | 'exam';
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: string;
  deadlineAt: string | null;
  completedAt: string | null;
  score: number | null;
  maxScore: number | null;
}

export interface AttemptView {
  attempt: Attempt;
  quiz: { id: string; title: string; configuration: QuizConfig; origin: string; provider: string | null };
  serverTime: string;
  questions: Question[];
}

export interface Results {
  attempt: Attempt & { percentage: number | null };
  quiz: { id: string; title: string; configuration: QuizConfig; course: { id: string; title: string } | null; lesson: { id: string; title: string } | null; origin: string; provider: string | null };
  items: (Question & { answered: boolean; needsReview: boolean })[];
  summary: { correct: number; incorrect: number; toVerify: number; unanswered: number; missedTopics: string[] };
  suggestedLessons: { id: string; title: string; courseId: string }[];
}

export interface Goal {
  id: string;
  kind: 'exam' | 'goal';
  title: string;
  courseId: string | null;
  targetDate: string | null;
  targetGrade: string | null;
  status: string;
  course?: { id: string; title: string; color?: string | null } | null;
}

export interface StudySession {
  id: string;
  courseId: string;
  lessonId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  activityType: 'lesson' | 'flashcards' | 'quiz' | 'mock_exam' | 'summary' | 'free';
  objective: string | null;
  reason: string | null;
  origin: 'manual' | 'plan';
  status: SessionStatus;
  completedAt: string | null;
  course?: { id: string; title: string; color?: string | null };
  lesson?: { id: string; title: string } | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: { refs?: SourceRef[]; generalKnowledgeUsed?: boolean; uncertainty?: string; followUpQuestion?: string } | [];
  grounded: boolean;
  provider: string | null;
  createdAt: string;
}

export interface AiStatus {
  provider: string | null;
  model: string | null;
  configured: boolean;
  demoMode: boolean;
  external: boolean;
  requiresConsent: boolean;
  consentGivenAt: string | null;
  dailyLimit: number;
  usedToday: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Scope {
  courseId?: string | null;
  folderId?: string | null;
  lessonId?: string | null;
  documentIds?: string[];
}
