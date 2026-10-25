import express, { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { storage, documentPrefix } from '../../services/storage';
import { signFileToken, verifyFileToken } from '../../services/file-tokens';
import { ownedDocument, resolveDocumentPlacement, tombstone } from '../../services/ownership';
import { body, pageArgs, pageMeta, pagination, param, query, userId } from '../../utils/http';
import { AppError, badRequest, conflict } from '../../utils/errors';
import { ALLOWED_TYPES, matchAllowedType, sanitizeFileName, sniffMatches } from '../../utils/file-types';
import { enqueueProcessing, loadExtraction, originalKey, saveExtraction } from './documents.service';
import { normalizeText } from '../../services/extraction';
import { folderBreadcrumb } from '../folders/folders.routes';

export const documentsRouter = Router();
/** Routes publiques protégées uniquement par un jeton signé à courte durée de vie. */
export const fileTransferRouter = Router();

const maxBytes = () => env.MAX_UPLOAD_MB * 1024 * 1024;

const presentDocument = (d: Prisma.DocumentGetPayload<object>) => ({
  id: d.id,
  fileName: d.fileName,
  mimeType: d.mimeType,
  fileSize: d.fileSize,
  courseId: d.courseId,
  folderId: d.folderId,
  source: d.source,
  processingStatus: d.processingStatus,
  processingError: d.processingError,
  extractionMethod: d.extractionMethod,
  pageCount: d.pageCount,
  pinned: d.pinned,
  isDemo: d.isDemo,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  lastOpenedAt: d.lastOpenedAt,
});

documentsRouter.get('/allowed-types', (_req, res) => {
  res.json({ data: { types: ALLOWED_TYPES, maxBytes: maxBytes() } });
});

documentsRouter.get('/', async (req, res) => {
  const q = query(
    req,
    pagination.extend({
      courseId: z.string().uuid().optional(),
      folderId: z.string().uuid().optional(),
      q: z.string().trim().max(100).optional(),
      sort: z.enum(['recent', 'name', 'opened']).default('recent'),
    }),
  );
  const where: Prisma.DocumentWhereInput = {
    userId: userId(req),
    courseId: q.courseId,
    folderId: q.folderId,
    ...(q.q ? { fileName: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
    q.sort === 'name' ? [{ fileName: 'asc' }] : q.sort === 'opened' ? [{ lastOpenedAt: { sort: 'desc', nulls: 'last' } }] : [{ pinned: 'desc' }, { createdAt: 'desc' }];
  const [total, docs] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy,
      ...pageArgs(q),
      include: { course: { select: { id: true, title: true } }, folder: { select: { id: true, name: true } } },
    }),
  ]);
  res.json({
    data: docs.map((d) => ({ ...presentDocument(d), course: d.course, folder: d.folder })),
    meta: pageMeta(q, total),
  });
});

// Étape 1 : demande d'autorisation d'import (métadonnées validées côté serveur).
documentsRouter.post('/upload-url', async (req, res) => {
  const uid = userId(req);
  const input = body(
    req,
    z.object({
      id: z.string().uuid().optional(),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().max(150).default(''),
      fileSize: z.number().int().positive(),
      courseId: z.string().uuid().nullish(),
      folderId: z.string().uuid().nullish(),
      source: z.enum(['file', 'scan']).default('file'),
    }),
  );
  const type = matchAllowedType(input.fileName, input.mimeType);
  if (!type) throw badRequest('Type de fichier non pris en charge. Formats acceptés : PDF, Word (.docx), TXT, Markdown, JPEG, PNG.', undefined, 'UNSUPPORTED_TYPE');
  if (input.fileSize > maxBytes()) throw new AppError(413, 'FILE_TOO_LARGE', `Fichier trop volumineux (maximum ${env.MAX_UPLOAD_MB} Mo).`);
  const placement = await resolveDocumentPlacement(uid, input);
  const doc = await prisma.document.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      userId: uid,
      ...placement,
      source: input.source,
      fileName: sanitizeFileName(input.fileName),
      mimeType: type.mime,
      fileSize: input.fileSize,
      storageKey: 'pending',
    },
  });
  const key = originalKey(uid, doc.id);
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
  const { token, expiresAt } = signFileToken({ d: doc.id, u: uid, p: 'upload' });
  res.status(201).json({
    data: {
      document: presentDocument({ ...doc, storageKey: key }),
      upload: { method: 'PUT', url: `/api/v1/uploads/${token}`, headers: { 'Content-Type': type.mime }, expiresAt, maxBytes: input.fileSize },
    },
  });
});

// Étape 2 : envoi du fichier vers le stockage privé via l'URL signée.
fileTransferRouter.put('/uploads/:token', express.raw({ type: () => true, limit: maxBytes() }), async (req, res) => {
  const claims = verifyFileToken(String(req.params.token), 'upload');
  const doc = await prisma.document.findFirst({ where: { id: claims.d, userId: claims.u } });
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document introuvable.');
  if (!['PENDING_UPLOAD', 'UPLOADED'].includes(doc.processingStatus)) throw conflict('Ce document a déjà été importé.');
  const buffer = req.body as Buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('Fichier vide.');
  if (buffer.length > doc.fileSize) throw badRequest('La taille du fichier ne correspond pas à la demande.', undefined, 'SIZE_MISMATCH');
  if (!sniffMatches(buffer, doc.mimeType)) {
    throw badRequest("Le contenu du fichier ne correspond pas à son type déclaré.", undefined, 'CONTENT_MISMATCH');
  }
  await storage.put(doc.storageKey, buffer, doc.mimeType);
  await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: 'UPLOADED', fileSize: buffer.length } });
  res.status(204).end();
});

// Troisième mode d'ajout à la base de connaissances : texte copié-collé.
documentsRouter.post('/text', async (req, res) => {
  const uid = userId(req);
  const input = body(
    req,
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1, 'Donnez un titre à ce texte').max(200),
      content: z.string().max(500_000, 'Texte trop long (500 000 caractères maximum).'),
      courseId: z.string().uuid().nullish(),
      folderId: z.string().uuid().nullish(),
    }),
  );
  const text = normalizeText(input.content);
  if (text.replace(/\s/g, '').length < 20) throw badRequest('Le texte est trop court pour constituer une base de connaissances.', undefined, 'TEXT_TOO_SHORT');
  const placement = await resolveDocumentPlacement(uid, input);
  const buffer = Buffer.from(text, 'utf-8');
  const doc = await prisma.document.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      userId: uid,
      ...placement,
      source: 'text',
      fileName: sanitizeFileName(input.title.replace(/\.(txt|md)$/i, '')) + '.txt',
      mimeType: 'text/plain',
      fileSize: buffer.length,
      storageKey: 'pending',
    },
  });
  const key = originalKey(uid, doc.id);
  await storage.put(key, buffer, 'text/plain');
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key, processingStatus: 'UPLOADED' } });
  await enqueueProcessing(doc.id);
  res.status(201).json({ data: presentDocument(await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })) });
});

// Étape 3 : confirmation, puis traitement asynchrone.
documentsRouter.post('/:id/confirm-upload', async (req, res) => {
  const doc = await ownedDocument(userId(req), param(req, 'id'));
  if (doc.processingStatus === 'PENDING_UPLOAD' || !(await storage.exists(doc.storageKey))) {
    throw badRequest("Le fichier n'a pas encore été reçu.", undefined, 'UPLOAD_MISSING');
  }
  if (doc.processingStatus === 'UPLOADED') await enqueueProcessing(doc.id);
  const fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  res.json({ data: presentDocument(fresh) });
});

documentsRouter.get('/:id', async (req, res) => {
  const uid = userId(req);
  const id = param(req, 'id');
  await ownedDocument(uid, id);
  const doc = await prisma.document.update({
    where: { id },
    data: { lastOpenedAt: new Date() },
    include: {
      course: { select: { id: true, title: true } },
      folder: { select: { id: true, name: true } },
      notes: { select: { id: true, title: true, updatedAt: true } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, status: true, attempts: true, errorCode: true, createdAt: true, completedAt: true } },
      _count: { select: { chunks: true } },
    },
  });
  res.json({
    data: {
      ...presentDocument(doc),
      course: doc.course,
      folder: doc.folder,
      notes: doc.notes,
      jobs: doc.jobs,
      chunkCount: doc._count.chunks,
      breadcrumb: await folderBreadcrumb(doc.folderId),
    },
  });
});

documentsRouter.get('/:id/status', async (req, res) => {
  const doc = await ownedDocument(userId(req), param(req, 'id'));
  const job = await prisma.documentProcessingJob.findFirst({ where: { documentId: doc.id }, orderBy: { createdAt: 'desc' } });
  res.json({
    data: {
      id: doc.id,
      processingStatus: doc.processingStatus,
      processingError: doc.processingError,
      pageCount: doc.pageCount,
      job: job && { status: job.status, attempts: job.attempts, maxAttempts: job.maxAttempts, errorCode: job.errorCode },
    },
  });
});

documentsRouter.post('/:id/download-url', async (req, res) => {
  const uid = userId(req);
  const doc = await ownedDocument(uid, param(req, 'id'));
  if (doc.processingStatus === 'PENDING_UPLOAD') throw badRequest("Le fichier n'a pas encore été importé.");
  const { inline } = body(req, z.object({ inline: z.boolean().default(false) }));
  const { token, expiresAt } = signFileToken({ d: doc.id, u: uid, p: 'download', i: inline });
  res.json({ data: { url: `/api/v1/files/${token}`, expiresAt, fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize } });
});

fileTransferRouter.get('/files/:token', async (req, res) => {
  const claims = verifyFileToken(String(req.params.token), 'download');
  const doc = await prisma.document.findFirst({ where: { id: claims.d, userId: claims.u } });
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document introuvable.');
  const stream = await storage.stream(doc.storageKey);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.fileSize));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${claims.i ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
  stream.pipe(res);
});

documentsRouter.get('/:id/text', async (req, res) => {
  const uid = userId(req);
  const doc = await ownedDocument(uid, param(req, 'id'));
  const extraction = await loadExtraction(uid, doc.id);
  if (!extraction) throw new AppError(404, 'TEXT_UNAVAILABLE', "Le texte de ce document n'est pas encore disponible.");
  res.json({ data: extraction });
});

// Correction manuelle du texte extrait (OCR) ; les passages de recherche sont recalculés.
documentsRouter.put('/:id/text', async (req, res) => {
  const uid = userId(req);
  const doc = await ownedDocument(uid, param(req, 'id'));
  const input = body(req, z.object({ pages: z.array(z.object({ page: z.number().int().positive().nullable(), text: z.string().max(200_000) })).min(1).max(500) }));
  const previous = await loadExtraction(uid, doc.id);
  await saveExtraction(uid, doc.id, {
    method: previous?.method ?? 'manual',
    pageCount: previous?.pageCount ?? doc.pageCount,
    pages: input.pages,
    warnings: [],
    corrected: true,
    updatedAt: new Date().toISOString(),
  });
  const updated = await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: 'READY', processingError: null } });
  res.json({ data: presentDocument(updated) });
});

documentsRouter.post('/:id/reprocess', async (req, res) => {
  const doc = await ownedDocument(userId(req), param(req, 'id'));
  if (!['READY', 'FAILED'].includes(doc.processingStatus)) throw conflict('Le document est déjà en cours de traitement.');
  await enqueueProcessing(doc.id, 'reprocess');
  res.status(202).json({ data: presentDocument(await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })) });
});

// Renommer, déplacer (dossier / sous-dossier), épingler.
documentsRouter.patch('/:id', async (req, res) => {
  const uid = userId(req);
  const doc = await ownedDocument(uid, param(req, 'id'));
  const input = body(
    req,
    z.object({
      fileName: z.string().trim().min(1).max(255).optional(),
      courseId: z.string().uuid().optional(),
      folderId: z.string().uuid().nullish(),
      pinned: z.boolean().optional(),
    }),
  );
  const moving = input.courseId !== undefined || input.folderId !== undefined;
  const placement = moving
    ? await resolveDocumentPlacement(uid, {
        courseId: input.courseId ?? doc.courseId,
        folderId: input.folderId === undefined ? (input.courseId && input.courseId !== doc.courseId ? null : doc.folderId) : input.folderId,
      })
    : {};
  if (input.fileName) {
    const ext = doc.fileName.split('.').pop();
    input.fileName = sanitizeFileName(input.fileName.endsWith(`.${ext}`) ? input.fileName : `${input.fileName}.${ext}`);
  }
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { fileName: input.fileName, pinned: input.pinned, ...placement },
  });
  res.json({ data: presentDocument(updated) });
});

documentsRouter.delete('/:id', async (req, res) => {
  const uid = userId(req);
  const doc = await ownedDocument(uid, param(req, 'id'));
  await storage.deletePrefix(documentPrefix(uid, doc.id));
  await prisma.document.delete({ where: { id: doc.id } });
  await tombstone(uid, 'document', doc.id);
  res.status(204).end();
});
