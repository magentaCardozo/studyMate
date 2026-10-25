import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';

export const app = createApp();

export interface TestUser {
  id: string;
  token: string;
  refreshToken: string;
  email: string;
  auth: (r: request.Test) => request.Test;
}

/** Crée un compte via l'API (client natif → jetons dans le corps). */
export async function createUser(name = 'Étudiant Test'): Promise<TestUser> {
  const email = `${randomUUID()}@test.cd`;
  const res = await request(app).post('/api/v1/auth/register').set('X-Client', 'android').send({ name, email, password: 'Motdepasse1' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.data.accessToken;
  return { id: res.body.data.user.id, token, refreshToken: res.body.data.refreshToken, email, auth: (r) => r.set('Authorization', `Bearer ${token}`) };
}

export const api = {
  get: (u: TestUser, path: string) => u.auth(request(app).get(`/api/v1${path}`)),
  post: (u: TestUser, path: string, body: object = {}) => u.auth(request(app).post(`/api/v1${path}`)).send(body),
  patch: (u: TestUser, path: string, body: object = {}) => u.auth(request(app).patch(`/api/v1${path}`)).send(body),
  put: (u: TestUser, path: string, body: object = {}) => u.auth(request(app).put(`/api/v1${path}`)).send(body),
  del: (u: TestUser, path: string, body: object = {}) => u.auth(request(app).delete(`/api/v1${path}`)).send(body),
};

export const COURSE_TEXT = `# Dérivation

## Définitions
La dérivée est la limite du taux d'accroissement lorsque h tend vers zéro.
Une tangente est une droite qui touche la courbe en un point sans la traverser localement.
Le taux d'accroissement est le quotient de la variation de f par la variation de x.
Une fonction dérivable est une fonction qui admet une dérivée en chaque point de son domaine.

## Formules
(f + g)' = f' + g'
(f · g)' = f'g + fg'
(x^n)' = n x^(n-1)

Par exemple, la dérivée de x² est 2x.
Attention : ne pas confondre la dérivée en un point et la fonction dérivée.
`;

/** Importe un fichier texte dans un dossier (demande d'URL, envoi, confirmation). */
export async function uploadText(u: TestUser, opts: { courseId: string; folderId?: string; fileName?: string; text?: string }) {
  const text = Buffer.from(opts.text ?? COURSE_TEXT, 'utf-8');
  const fileName = opts.fileName ?? 'cours.md';
  const mimeType = fileName.endsWith('.txt') ? 'text/plain' : 'text/markdown';
  const res = await api.post(u, '/documents/upload-url', { fileName, mimeType, fileSize: text.length, courseId: opts.courseId, folderId: opts.folderId });
  if (res.status !== 201) throw new Error(`upload-url failed ${res.status} ${JSON.stringify(res.body)}`);
  const put = await request(app).put(res.body.data.upload.url).set('Content-Type', mimeType).send(text);
  if (put.status !== 204) throw new Error(`upload failed ${put.status} ${JSON.stringify(put.body)}`);
  const confirm = await api.post(u, `/documents/${res.body.data.document.id}/confirm-upload`);
  return confirm.body.data as { id: string; processingStatus: string };
}
