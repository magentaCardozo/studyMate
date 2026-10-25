import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createUser } from './helpers';

describe('authentification', () => {
  it('inscription, connexion et accès au profil (client natif)', async () => {
    const u = await createUser('Grâce Mbuyi');
    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${u.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.name).toBe('Grâce Mbuyi');
    expect(me.body.data).not.toHaveProperty('passwordHash');
    const login = await request(app).post('/api/v1/auth/login').set('X-Client', 'android').send({ email: u.email, password: 'Motdepasse1' });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it('crée une année académique et deux semestres pour un nouveau compte', async () => {
    const u = await createUser();
    const years = await u.auth(request(app).get('/api/v1/academic-years'));
    expect(years.body.data).toHaveLength(1);
    expect(years.body.data[0].semesters).toHaveLength(2);
  });

  it('refuse un mot de passe faible, un e-mail déjà utilisé et de mauvais identifiants', async () => {
    const weak = await request(app).post('/api/v1/auth/register').send({ name: 'Test', email: 'weak@test.cd', password: 'abc' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    const u = await createUser();
    const dup = await request(app).post('/api/v1/auth/register').send({ name: 'Autre', email: u.email, password: 'Motdepasse1' });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: 'Mauvais123' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('fait tourner le jeton de rafraîchissement et révoque la famille en cas de réutilisation', async () => {
    const u = await createUser();
    const r1 = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'android').send({ refreshToken: u.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).not.toBe(u.refreshToken);
    // Réutilisation de l'ancien jeton : vol présumé → famille révoquée.
    const reuse = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'android').send({ refreshToken: u.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');
    const r2 = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'android').send({ refreshToken: r1.body.data.refreshToken });
    expect(r2.status).toBe(401);
  });

  it('déconnexion : le jeton de rafraîchissement ne fonctionne plus', async () => {
    const u = await createUser();
    await request(app).post('/api/v1/auth/logout').send({ refreshToken: u.refreshToken }).expect(204);
    const r = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'android').send({ refreshToken: u.refreshToken });
    expect(r.status).toBe(401);
  });

  it('web : cookies HttpOnly, aucun jeton dans le corps, protection CSRF', async () => {
    const agent = request.agent(app);
    const email = `web-${Date.now()}@test.cd`;
    const reg = await agent.post('/api/v1/auth/register').send({ name: 'Web', email, password: 'Motdepasse1' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.accessToken).toBeUndefined();
    const cookies = ([] as string[]).concat(reg.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('sm_access=') && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c))).toBe(true);
    expect((await agent.get('/api/v1/users/me')).status).toBe(200);
    // Requête modifiante sans en-tête anti-CSRF : refusée.
    const noCsrf = await agent.post('/api/v1/courses').send({ title: 'Test' });
    expect(noCsrf.status).toBe(403);
    const ok = await agent.post('/api/v1/courses').set('X-Requested-With', 'StudyMate').send({ title: 'Test' });
    expect(ok.status).toBe(201);
    const refreshed = await agent.post('/api/v1/auth/refresh');
    expect(refreshed.status).toBe(200);
  });

  it('refuse un jeton invalide avec une erreur structurée', async () => {
    const r = await request(app).get('/api/v1/courses').set('Authorization', 'Bearer pas-un-jeton');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: { code: 'INVALID_TOKEN', message: expect.any(String) } });
  });

  it('réinitialisation du mot de passe : réponse neutre et jeton inutilisable s’il est faux', async () => {
    const r = await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'inconnu@test.cd' });
    expect(r.status).toBe(202);
    const bad = await request(app).post('/api/v1/auth/password-reset/confirm').send({ token: 'x'.repeat(40), password: 'Nouveau123' });
    expect(bad.status).toBe(400);
  });

  it('suppression du compte avec confirmation du mot de passe', async () => {
    const u = await createUser();
    const wrong = await u.auth(request(app).delete('/api/v1/users/me')).send({ password: 'faux' });
    expect(wrong.status).toBe(401);
    await u.auth(request(app).delete('/api/v1/users/me')).send({ password: 'Motdepasse1' }).expect(204);
    const login = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: 'Motdepasse1' });
    expect(login.status).toBe(401);
  });
});
