export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = 'BAD_REQUEST') =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentification requise.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'Action non autorisée.') => new AppError(403, 'FORBIDDEN', message);
// Une ressource appartenant à un autre utilisateur répond 404 : on ne révèle pas son existence.
export const notFound = (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable.`);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details);
export const tooMany = (message: string) => new AppError(429, 'RATE_LIMITED', message);
