import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './services/prisma';
import { storage } from './services/storage';
import { claimNextJob, recoverStaleJobs, runJob } from './services/jobs';
import { generateReminders } from './services/notifications';

/**
 * Worker de traitement en arrière-plan : extraction de texte / OCR des documents
 * et génération périodique des rappels (sessions, examens, cartes).
 */
let running = true;

async function loop() {
  await storage.ensureReady();
  logger.info('Worker StudyMate démarré');
  let lastReminders = 0;
  let lastRecovery = 0;
  while (running) {
    try {
      if (Date.now() - lastRecovery > 5 * 60_000) {
        await recoverStaleJobs();
        lastRecovery = Date.now();
      }
      if (Date.now() - lastReminders > 5 * 60_000) {
        await generateReminders();
        lastReminders = Date.now();
      }
      const job = await claimNextJob();
      if (job) {
        await runJob(job);
        continue;
      }
    } catch (err) {
      logger.error({ err }, 'Erreur du worker');
    }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_MS));
  }
  await prisma.$disconnect();
}

process.on('SIGTERM', () => (running = false));
process.on('SIGINT', () => (running = false));
loop().catch((err) => {
  logger.fatal({ err }, 'Worker arrêté');
  process.exit(1);
});
