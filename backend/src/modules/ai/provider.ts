import type { AnswerOutput, FlashcardsOutput, QuizOutput, SummaryOutput } from './schemas';

/** Passage source numéroté (S1, S2…) transmis au fournisseur. */
export interface SourceBlock {
  id: string;
  kind: 'document' | 'lesson';
  documentId?: string;
  lessonId?: string;
  chunkId?: string;
  title: string;
  page: number | null;
  text: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ProviderResult<T> {
  output: T;
  usage: Usage;
}

export interface QuizRequest {
  count: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  types: string[];
  topics: string[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Interface commune à tous les fournisseurs de modèles de langage.
 * Les implémentations ne reçoivent que des passages déjà autorisés pour l'utilisateur.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Vrai si les contenus sont envoyés à un service tiers (consentement requis). */
  readonly external: boolean;
  summarize(sources: SourceBlock[], opts: { length: 'brief' | 'standard' | 'detailed'; title: string; language: string }): Promise<ProviderResult<SummaryOutput>>;
  flashcards(sources: SourceBlock[], opts: { count: number; title: string; language: string }): Promise<ProviderResult<FlashcardsOutput>>;
  quiz(sources: SourceBlock[], opts: QuizRequest & { title: string; language: string }): Promise<ProviderResult<QuizOutput>>;
  answer(question: string, sources: SourceBlock[], history: ChatTurn[], opts: { language: string; scopeLabel: string }): Promise<ProviderResult<AnswerOutput>>;
}

export class AiError extends Error {
  constructor(
    public code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR' | 'REFUSED' | 'TRUNCATED' | 'INVALID_OUTPUT' | 'RATE_LIMITED' | 'NOT_CONFIGURED',
    message: string,
  ) {
    super(message);
  }
}
