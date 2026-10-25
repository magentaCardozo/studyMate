import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

type Purpose = 'upload' | 'download';

interface FileClaims {
  d: string; // document
  u: string; // utilisateur
  p: Purpose;
  i?: boolean; // affichage en ligne
}

const TTL: Record<Purpose, number> = { upload: 15 * 60, download: 5 * 60 };

/** URL signée à courte durée de vie, équivalente à une URL pré-signée S3 mais servie par l'API. */
export function signFileToken(claims: FileClaims) {
  const token = jwt.sign(claims, env.FILE_TOKEN_SECRET, { expiresIn: TTL[claims.p], audience: `file:${claims.p}` });
  return { token, expiresAt: new Date(Date.now() + TTL[claims.p] * 1000) };
}

export function verifyFileToken(token: string, purpose: Purpose): FileClaims {
  try {
    return jwt.verify(token, env.FILE_TOKEN_SECRET, { audience: `file:${purpose}` }) as FileClaims;
  } catch {
    throw new AppError(403, 'FILE_TOKEN_INVALID', 'Lien de fichier invalide ou expiré.');
  }
}
