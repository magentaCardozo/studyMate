import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Prépare la base de test : création si elle n'existe pas, puis application des
 * migrations (non destructif). Chaque test crée ses propres comptes aux adresses
 * uniques : aucune remise à zéro n'est nécessaire.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://studymate:studymate@localhost:5433/studymate_test?schema=public';
  const dbName = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) throw new Error(`Refus : la base de test doit se terminer par « _test » (reçu « ${dbName} »).`);
  const admin = new PrismaClient({ datasourceUrl: url.replace(`/${dbName}`, '/postgres') });
  const exists = await admin.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
  if (!exists.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
