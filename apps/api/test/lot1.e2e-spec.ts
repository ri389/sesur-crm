import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.settings';
import { PasswordService } from '../src/auth/password.service';
import { seedRbac } from '../src/scripts/seed-rbac';

const PASSWORD = 'une phrase de passe solide';
const TEST_DOMAIN = 'lot1.sesur.test';

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) throw new Error('cookie de session absent');
  return cookie;
}

describe('Lot 1 CRM (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const createdUserIds: string[] = [];
  let adminCookie: string;
  let salesCookie: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await seedRbac(prisma);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const salesRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'SALES_REP' },
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin-${randomUUID()}@${TEST_DOMAIN}`,
        firstName: 'Ada',
        lastName: 'Admin',
        passwordHash: await passwords.hash(PASSWORD),
        roles: { create: { roleId: adminRole.id } },
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: `sales-${randomUUID()}@${TEST_DOMAIN}`,
        firstName: 'Sam',
        lastName: 'Sales',
        passwordHash: await passwords.hash(PASSWORD),
        roles: { create: { roleId: salesRole.id } },
      },
    });
    createdUserIds.push(admin.id, sales.id);

    adminCookie = sessionCookie(
      await http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200),
    );
    salesCookie = sessionCookie(
      await http()
        .post('/api/auth/login')
        .send({ email: sales.email, password: PASSWORD })
        .expect(200),
    );
  });

  afterAll(async () => {
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

  it('refuse un commercial sans permission d’administration', async () => {
    await http().get('/api/users').set('Cookie', salesCookie).expect(403);
    await http().get('/api/audit').set('Cookie', salesCookie).expect(403);
  });

  it('crée un prospect, signale un doublon, puis convertit en client', async () => {
    const email = `lead-${randomUUID()}@${TEST_DOMAIN}`;
    const created = await http()
      .post('/api/leads')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Koffi',
        lastName: 'Mensah',
        companyName: 'BTP Atlantique',
        email,
        phone: '+22990000001',
        source: 'SALON',
      })
      .expect(201);
    const leadId = (created.body as { id: string }).id;

    const duplicate = await http()
      .post('/api/leads')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Koffi',
        lastName: 'Mensah',
        email,
        phone: '+22990000001',
      })
      .expect(409);
    expect((duplicate.body as { candidates: unknown[] }).candidates.length).toBeGreaterThan(
      0,
    );

    const forced = await http()
      .post('/api/leads')
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Koffi',
        lastName: 'Mensah',
        email,
        bypassDuplicateWarning: true,
      })
      .expect(201);

    await http()
      .post('/api/duplicates/merge')
      .set('Cookie', adminCookie)
      .send({
        type: 'LEAD',
        keepId: leadId,
        dropId: (forced.body as { id: string }).id,
      })
      .expect(200);

    const converted = await http()
      .post(`/api/leads/${leadId}/convert`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect((converted.body as { organization: { isClient: boolean } }).organization.isClient)
      .toBe(true);

    const search = await http()
      .get('/api/search')
      .query({ q: 'Atlantique' })
      .set('Cookie', adminCookie)
      .expect(200);
    expect((search.body as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });

  it('gère le catalogue et l’import de prospects', async () => {
    const sku = `SKU-${randomUUID().slice(0, 8)}`;
    await http()
      .post('/api/products')
      .set('Cookie', adminCookie)
      .send({ sku, name: 'Alarme site', unitPrice: 250000 })
      .expect(201);

    const imported = await http()
      .post('/api/imports/leads')
      .set('Cookie', adminCookie)
      .send({
        rows: [
          { firstName: 'Awa', lastName: 'Diallo', companyName: 'Import Test SESUR' },
        ],
      })
      .expect(200);
    expect((imported.body as { results: { status: string }[] }).results[0].status).toBe(
      'created',
    );
  });
});
