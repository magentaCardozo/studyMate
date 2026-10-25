import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { env } from '../../config/env';
import { AiError, type AiProvider, type ChatTurn, type ProviderResult, type QuizRequest, type SourceBlock } from './provider';
import { answerOutput, flashcardsOutput, jsonSchemas, quizOutput, summaryOutput, type AnswerOutput, type FlashcardsOutput, type QuizOutput, type SummaryOutput } from './schemas';
import { SYSTEM_BASE, answerPrompt, flashcardsPrompt, quizPrompt, summaryPrompt } from './prompts';

/**
 * Adaptateur Anthropic (Claude). Utilise les sorties structurées (JSON Schema)
 * puis revalide chaque réponse avec Zod avant de la transmettre au service.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly external = true;
  readonly model = env.AI_MODEL;
  private client: Anthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) throw new AiError('NOT_CONFIGURED', 'ANTHROPIC_API_KEY manquante.');
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 180_000 });
  }

  private async generate<T>(prompt: string, schema: Record<string, unknown>, validator: ZodType<T>): Promise<ProviderResult<T>> {
    const params = {
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_BASE,
      messages: [{ role: 'user' as const, content: prompt }],
      thinking: { type: 'adaptive' as const },
      output_config: { effort: env.AI_EFFORT, format: { type: 'json_schema' as const, schema } },
    };
    let message: { content: Array<{ type: string; text?: string }>; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number }; model: string };
    try {
      message = env.AI_ENABLE_FALLBACKS
        ? // Repli côté serveur en cas de refus d'un classifieur de sécurité (bêta).
          ((await this.client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as never)) as never)
        : ((await this.client.messages.create(params)) as never);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new AiError('RATE_LIMITED', "Le service d'IA est momentanément saturé. Réessayez dans une minute.");
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError('NOT_CONFIGURED', "La configuration du service d'IA est invalide.");
      if (e instanceof Anthropic.BadRequestError) throw new AiError('PROVIDER_ERROR', "La demande n'a pas pu être traitée par le service d'IA.");
      if (e instanceof Anthropic.APIConnectionError) throw new AiError('PROVIDER_UNAVAILABLE', "Le service d'IA est injoignable. Vérifiez la connexion du serveur.");
      if (e instanceof Anthropic.APIError) throw new AiError('PROVIDER_UNAVAILABLE', "Le service d'IA est momentanément indisponible.");
      throw e;
    }
    if (message.stop_reason === 'refusal') throw new AiError('REFUSED', "L'assistant a refusé de traiter ce contenu.");
    if (message.stop_reason === 'max_tokens') throw new AiError('TRUNCATED', 'La réponse générée était trop longue. Réduisez la sélection ou le nombre d’éléments.');
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError('INVALID_OUTPUT', "La réponse de l'IA était mal formée.");
    }
    const parsed = validator.safeParse(json);
    if (!parsed.success) throw new AiError('INVALID_OUTPUT', "La réponse de l'IA ne respecte pas le format attendu.");
    return { output: parsed.data, usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model: message.model } };
  }

  summarize(sources: SourceBlock[], o: { length: 'brief' | 'standard' | 'detailed'; title: string; language: string }) {
    return this.generate<SummaryOutput>(summaryPrompt(sources, o.length, o.title, o.language), jsonSchemas.summary, summaryOutput);
  }

  flashcards(sources: SourceBlock[], o: { count: number; title: string; language: string }) {
    return this.generate<FlashcardsOutput>(flashcardsPrompt(sources, o.count, o.title, o.language), jsonSchemas.flashcards, flashcardsOutput);
  }

  quiz(sources: SourceBlock[], o: QuizRequest & { title: string; language: string }) {
    return this.generate<QuizOutput>(quizPrompt(sources, o), jsonSchemas.quiz, quizOutput);
  }

  answer(question: string, sources: SourceBlock[], history: ChatTurn[], o: { language: string; scopeLabel: string }) {
    return this.generate<AnswerOutput>(answerPrompt(question, sources, history, o.language, o.scopeLabel), jsonSchemas.answer, answerOutput);
  }
}
