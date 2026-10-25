import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { corsOrigins, env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './services/prisma';
import { requireAuth } from './middleware/auth';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { academicYearsRouter, semestersRouter } from './modules/academic-years/academic.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { courseFoldersRouter, foldersRouter } from './modules/folders/folders.routes';
import { courseLessonsRouter, lessonsRouter } from './modules/lessons/lessons.routes';
import { documentsRouter, fileTransferRouter } from './modules/documents/documents.routes';
import { notesRouter } from './modules/notes/notes.routes';
import { flashcardsRouter } from './modules/flashcards/flashcards.routes';
import { attemptsRouter, quizzesRouter } from './modules/quizzes/quizzes.routes';
import { aiRouter, summariesRouter } from './modules/ai/ai.routes';
import { calendarRouter, goalsRouter, studyPlansRouter, studySessionsRouter } from './modules/study-plans/study-plans.routes';
import { dashboardRouter, progressRouter } from './modules/progress/progress.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { searchRouter } from './modules/search/search.routes';
import { syncRouter } from './modules/synchronization/sync.routes';

function loadOpenApi() {
  const candidates = [path.resolve(__dirname, '../openapi.yaml'), path.resolve(__dirname, '../../shared/api-contracts/openapi.yaml'), path.resolve(process.cwd(), 'openapi.yaml')];
  const file = candidates.find((f) => fs.existsSync(f));
  return file ? YAML.parse(fs.readFileSync(file, 'utf-8')) : null;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client'],
    }),
  );
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  const spec = loadOpenApi();
  if (spec) {
    app.get('/api/docs/openapi.json', (_req, res) => res.json(spec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'StudyMate AI — API' }));
  }

  const api = Router();
  // Transferts de fichiers : authentifiés par jeton signé, avant le parseur JSON.
  api.use(fileTransferRouter);
  api.use(express.json({ limit: '2mb' }));
  api.use(apiLimiter);
  api.use('/auth', authRouter);

  const secured = Router();
  secured.use(requireAuth);
  secured.use('/users', usersRouter);
  secured.use('/academic-years', academicYearsRouter);
  secured.use('/semesters', semestersRouter);
  secured.use('/courses/:courseId/folders', courseFoldersRouter);
  secured.use('/courses/:courseId/lessons', courseLessonsRouter);
  secured.use('/courses', coursesRouter);
  secured.use('/folders', foldersRouter);
  secured.use('/lessons', lessonsRouter);
  secured.use('/documents', documentsRouter);
  secured.use('/notes', notesRouter);
  secured.use('/flashcards', flashcardsRouter);
  secured.use('/quizzes', quizzesRouter);
  secured.use('/quiz-attempts', attemptsRouter);
  secured.use('/ai', aiRouter);
  secured.use('/summaries', summariesRouter);
  secured.use('/goals', goalsRouter);
  secured.use('/study-sessions', studySessionsRouter);
  secured.use('/study-plans', studyPlansRouter);
  secured.use('/calendar', calendarRouter);
  secured.use('/progress', progressRouter);
  secured.use('/dashboard', dashboardRouter);
  secured.use('/notifications', notificationsRouter);
  secured.use('/search', searchRouter);
  secured.use('/sync', syncRouter);
  api.use(secured);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
