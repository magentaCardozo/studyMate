// Environnement des tests : base dédiée, stockage en mémoire, IA de démonstration.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://studymate:studymate@localhost:5433/studymate_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-0123456789';
process.env.FILE_TOKEN_SECRET = 'test-file-token-secret-0123456789-012345';
process.env.STORAGE_DRIVER = 'memory';
process.env.AI_PROVIDER = 'mock';
process.env.AI_DAILY_REQUEST_LIMIT = '1000';
process.env.CORS_ORIGINS = 'http://localhost:8088';
