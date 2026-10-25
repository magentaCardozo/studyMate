import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './services/prisma';
import { storage } from './services/storage';

async function main() {
  await storage.ensureReady();
  const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT, ai: env.AI_PROVIDER }, 'API StudyMate démarrée'));
  const shutdown = () => {
    logger.info('Arrêt en cours…');
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Démarrage impossible');
  process.exit(1);
});
