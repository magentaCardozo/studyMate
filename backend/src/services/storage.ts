import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { env } from '../config/env';

/**
 * Stockage objet privé. Les fichiers ne sont jamais exposés par une URL publique :
 * l'API les sert après vérification d'un jeton signé à courte durée de vie.
 */
export interface StorageService {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  deletePrefix(prefix: string): Promise<void>;
  ensureReady(): Promise<void>;
}

class S3Storage implements StorageService {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  private bucket = env.S3_BUCKET;

  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: env.S3_ENDPOINT ? undefined : 'AES256' }),
    );
  }

  async stream(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return out.Body as Readable;
  }

  async get(key: string) {
    const s = await this.stream(key);
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const list = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
}

/** Stockage en mémoire — uniquement pour les tests automatisés. */
export class MemoryStorage implements StorageService {
  files = new Map<string, { body: Buffer; contentType: string }>();
  async ensureReady() {}
  async put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error('NoSuchKey');
    return f.body;
  }
  async stream(key: string) {
    return Readable.from(await this.get(key));
  }
  async exists(key: string) {
    return this.files.has(key);
  }
  async deletePrefix(prefix: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k);
  }
}

export const storage: StorageService = env.STORAGE_DRIVER === 'memory' ? new MemoryStorage() : new S3Storage();

export const documentPrefix = (userId: string, documentId: string) => `users/${userId}/documents/${documentId}/`;
export const userPrefix = (userId: string) => `users/${userId}/`;
