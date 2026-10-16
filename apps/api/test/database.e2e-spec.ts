import { Prisma, PrismaClient } from '@prisma/client';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class Rollback extends Error {}

/** Exécute le scénario dans une transaction systématiquement annulée. */
async function inRolledBackTransaction(
  prisma: PrismaClient,
  scenario: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  await expect(
    prisma.$transaction(async (tx) => {
      await scenario(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

/** Vérifie qu'une instruction échoue sans invalider la transaction en cours. */
async function expectRejected(
  tx: Prisma.TransactionClient,
  statement: () => Promise<unknown>,
  message: RegExp,
): Promise<void> {
  await tx.$executeRaw`SAVEPOINT attempt`;
  await expect(statement()).rejects.toThrow(message);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT attempt`;
}

describe('Schéma de base (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('génère des identifiants UUID v7', async () => {
    await inRolledBackTransaction(prisma, async (tx) => {
      const user = await tx.user.create({
        data: {
          email: 'a.test@sesur.example',
          firstName: 'A',
          lastName: 'Test',
        },
      });
      expect(user.id).toMatch(UUID_V7);
    });
  });

  it('refuse un e-mail non normalisé en minuscules', async () => {
    await inRolledBackTransaction(prisma, async (tx) => {
      await expectRejected(
        tx,
        () =>
          tx.user.create({
            data: {
              email: 'Mixed@Sesur.example',
              firstName: 'B',
              lastName: 'Test',
            },
          }),
        /app_user_email_lowercase/,
      );
    });
  });

  it("refuse la modification et la suppression du journal d'audit", async () => {
    await inRolledBackTransaction(prisma, async (tx) => {
      const entry = await tx.auditLog.create({
        data: { action: 'user.login', entityType: 'user' },
      });

      await expectRejected(
        tx,
        () =>
          tx.auditLog.update({
            where: { id: entry.id },
            data: { action: 'falsified' },
          }),
        /ajout seul/,
      );
      await expectRejected(
        tx,
        () => tx.auditLog.delete({ where: { id: entry.id } }),
        /ajout seul/,
      );
      await expectRejected(
        tx,
        () => tx.$executeRaw`TRUNCATE audit_log`,
        /ajout seul/,
      );
    });
  });
});
