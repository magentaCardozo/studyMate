import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'studymate-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.refreshToken'],
    censor: '[masqué]',
  },
});
