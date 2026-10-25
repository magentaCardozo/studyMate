import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  // Nombre de relais (nginx, Caddy…) devant l'API : nécessaire pour connaître l'IP réelle du client.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  DATABASE_URL: z.string().min(1),
  // Origines web autorisées (CORS), séparées par des virgules.
  CORS_ORIGINS: z.string().default('http://localhost:8088,http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:8088'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().default(15),
  FILE_TOKEN_SECRET: z.string().min(32),
  COOKIE_SECURE: bool.default(false),

  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('studymate-documents'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  MAX_UPLOAD_MB: z.coerce.number().default(25),

  // mock | anthropic
  AI_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_ENABLE_FALLBACKS: bool.default(true),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().default(60),
  AI_MAX_CONTEXT_CHARS: z.coerce.number().default(120_000),

  OCR_LANGUAGES: z.string().default('fra+eng'),
  WORKER_POLL_MS: z.coerce.number().default(2000),
  MAIL_PROVIDER: z.enum(['console']).default('console'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
