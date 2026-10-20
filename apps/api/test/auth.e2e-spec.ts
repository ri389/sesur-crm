import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  AUTH_SETTINGS,
  AuthSettings,
  SESSION_COOKIE_NAME,
} from '../src/auth/auth.settings';
import { PasswordService } from '../src/auth/password.service';
import { hashToken } from '../src/auth/session.service';

const PASSWORD = 'une phrase de passe solide';
const TEST_DOMAIN = 'e2e.sesur.test';

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) throw new Error('cookie de session absent');
  return cookie;
}

function messageOf(res: request.Response): string {
  return (res.body as { message: string }).message;
}

function tokenOf(cookie: string): string {
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let settings: AuthSettings;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const createdUserIds: string[] = [];

  async function createUser(overrides: { isActive?: boolean } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `auth-${randomUUID()}@${TEST_DOMAIN}`,
        firstName: 'Test',
        lastName: 'Auth',
        passwordHash: await passwords.hash(PASSWORD),
        ...overrides,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    settings = app.get<AuthSettings>(AUTH_SETTINGS);
  });

  afterAll(async () => {
    // Le journal d'audit (ajout seul) référence ces comptes : désactivation plutôt que suppression.
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.updateMany({
      where: { id: { in: createdUserIds } },
      data: { isActive: false, deletedAt: new Date(), passwordHash: null },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('connecte avec un cookie HttpOnly, Secure, SameSite=Strict et ne stocke que le hachage du jeton', async () => {
    const user = await createUser();
    const res = await login(user.email.toUpperCase(), PASSWORD).expect(200);

    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: user.email,
        firstName: 'Test',
        lastName: 'Auth',
        teamId: null,
        roles: [],
        permissions: [],
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|password/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\/api/);
    expect(cookie).toMatch(/; Expires=/);

    const token = tokenOf(cookie);
    const stored = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(stored.userId).toBe(user.id);
    expect(stored.tokenHash).not.toBe(token);

    const me = await http()
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect((me.body as { user: { id: string } }).user.id).toBe(user.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: user.id, action: 'auth.login.succeeded' },
    });
    expect(audit).not.toBeNull();
  });

  it('renvoie la même erreur pour un mauvais mot de passe et un compte inconnu', async () => {
    const user = await createUser();
    const wrong = await login(user.email, 'mauvais mot de passe').expect(401);
    const unknown = await login(
      `inconnu-${randomUUID()}@${TEST_DOMAIN}`,
      PASSWORD,
    ).expect(401);
    expect(messageOf(wrong)).toBe('Identifiants invalides');
    expect(messageOf(unknown)).toBe(messageOf(wrong));
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('verrouille le compte après le nombre maximal d’échecs, même avec le bon mot de passe', async () => {
    const user = await createUser();
    for (let i = 0; i < settings.maxFailedAttempts; i++) {
      await login(user.email, `mauvais ${i}`).expect(401);
    }

    const locked = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(locked.failedLoginCount).toBe(0);

    const res = await login(user.email, PASSWORD).expect(401);
    expect(messageOf(res)).toBe('Identifiants invalides');
    expect(res.headers['set-cookie']).toBeUndefined();

    const events = await prisma.auditLog.findMany({
      where: { entityId: user.id },
      select: { action: true, metadata: true },
    });
    expect(
      events.filter((e) => e.action === 'auth.account.locked'),
    ).toHaveLength(1);
    expect(events).toContainEqual({
      action: 'auth.login.failed',
      metadata: { reason: 'locked' },
    });
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });

  it('accepte de nouveau la connexion après la fin du verrouillage et remet le compteur à zéro', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000), failedLoginCount: 2 },
    });

    await login(user.email, PASSWORD).expect(200);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
  });

  it('refuse un compte désactivé', async () => {
    const user = await createUser({ isActive: false });
    const res = await login(user.email, PASSWORD).expect(401);
    expect(messageOf(res)).toBe('Identifiants invalides');
  });

  it('valide le corps de la requête', async () => {
    await login('pas-un-email', PASSWORD).expect(400);
    await http()
      .post('/api/auth/login')
      .send({ email: `x@${TEST_DOMAIN}`, password: PASSWORD, admin: true })
      .expect(400);
  });

  it('protège les routes par défaut : sans cookie ou avec un jeton inconnu, 401', async () => {
    await http().get('/api/auth/me').expect(401);
    await http()
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=jeton-invente`)
      .expect(401);
    await http().get('/api/health').expect(200);
  });

  it('la déconnexion révoque la session et efface le cookie', async () => {
    const user = await createUser();
    const cookie = sessionCookie(await login(user.email, PASSWORD).expect(200));

    const res = await http()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    const stored = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(tokenOf(cookie)) },
    });
    expect(stored.revokedAt).not.toBeNull();
  });

  it('expire une session inactive ou ayant dépassé sa durée maximale', async () => {
    const user = await createUser();
    const idle = sessionCookie(await login(user.email, PASSWORD).expect(200));
    const old = sessionCookie(await login(user.email, PASSWORD).expect(200));

    await prisma.session.update({
      where: { tokenHash: hashToken(tokenOf(idle)) },
      data: {
        lastSeenAt: new Date(Date.now() - settings.sessionIdleMs - 1000),
      },
    });
    await prisma.session.update({
      where: { tokenHash: hashToken(tokenOf(old)) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await http().get('/api/auth/me').set('Cookie', idle).expect(401);
    await http().get('/api/auth/me').set('Cookie', old).expect(401);
  });

  it('invalide les sessions existantes d’un compte désactivé', async () => {
    const user = await createUser();
    const cookie = sessionCookie(await login(user.email, PASSWORD).expect(200));
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});
