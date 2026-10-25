import type { DocumentProcessingJob } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../config/logger';
import { isRetryable, markProcessingFailed, processDocument } from '../modules/documents/documents.service';

/**
 * File de tâches adossée à PostgreSQL (FOR UPDATE SKIP LOCKED) : plusieurs workers
 * peuvent tourner en parallèle sans traiter deux fois la même tâche.
 */
export async function claimNextJob(): Promise<DocumentProcessingJob | null> {
  const rows = await prisma.$queryRaw<DocumentProcessingJob[]>`
    UPDATE "DocumentProcessingJob" SET status = 'RUNNING', "startedAt" = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "DocumentProcessingJob"
      WHERE status = 'QUEUED' AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

export async function runJob(job: DocumentProcessingJob) {
  const started = Date.now();
  try {
    await processDocument(job.documentId);
    await prisma.documentProcessingJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
    logger.info({ jobId: job.id, documentId: job.documentId, ms: Date.now() - started }, 'Tâche terminée');
  } catch (err) {
    const retry = isRetryable(err) && job.attempts < job.maxAttempts;
    logger.warn({ err, jobId: job.id, attempt: job.attempts, retry }, 'Échec de tâche');
    await prisma.documentProcessingJob.update({
      where: { id: job.id },
      data: retry
        ? { status: 'QUEUED', runAfter: new Date(Date.now() + 2 ** job.attempts * 5000), errorCode: (err as { code?: string }).code ?? 'ERROR', errorDetail: String((err as Error).message).slice(0, 500) }
        : { status: 'FAILED', completedAt: new Date(), errorCode: (err as { code?: string }).code ?? 'ERROR', errorDetail: String((err as Error).message).slice(0, 500) },
    });
    if (retry) await prisma.document.update({ where: { id: job.documentId }, data: { processingStatus: 'QUEUED' } }).catch(() => {});
    else await markProcessingFailed(job.documentId, err).catch(() => {});
  }
}

/** Remet en file les tâches bloquées (worker arrêté en cours de traitement). */
export async function recoverStaleJobs() {
  const n = await prisma.documentProcessingJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { status: 'QUEUED' },
  });
  if (n.count) logger.warn({ count: n.count }, 'Tâches bloquées remises en file');
}

/** Traite toutes les tâches en attente (utilisé par les tests et le worker). */
export async function drainJobs(max = 50) {
  let processed = 0;
  for (let job = await claimNextJob(); job && processed < max; job = await claimNextJob()) {
    await runJob(job);
    processed++;
  }
  return processed;
}
