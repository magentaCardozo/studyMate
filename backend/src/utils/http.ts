import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest, unauthorized } from './errors';

function parse<T extends ZodTypeAny>(schema: T, value: unknown, where: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      'Certaines informations sont invalides.',
      result.error.issues.map((i) => ({ field: [where, ...i.path].join('.'), message: i.message })),
      'VALIDATION_ERROR',
    );
  }
  return result.data;
}

export const body = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.body ?? {}, 'body');
export const query = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.query, 'query');

const uuid = z.string().uuid({ message: 'Identifiant invalide' });
export const param = (req: Request, name: string) => parse(uuid, req.params[name], `params.${name}`);

export function userId(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageArgs(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function pageMeta(p: { page: number; pageSize: number }, total: number) {
  return { page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

export const optionalUuid = uuid.nullish();
export const isoDate = z.coerce.date();
