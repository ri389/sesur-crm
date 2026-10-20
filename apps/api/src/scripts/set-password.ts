/**
 * Crée un utilisateur ou (re)définit son mot de passe, saisi sans écho.
 * Usage : pnpm --filter api user:set-password --email a@b.c [--first-name A --last-name B]
 */
import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { PasswordService } from '../auth/password.service';
import { seedRbac } from './seed-rbac';

/** Saisie sans écho ; une seule interface pour ne pas perdre de lignes en entrée redirigée. */
function hiddenPrompter() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });
  const muted = rl as unknown as { _writeToOutput: (text: string) => void };
  muted._writeToOutput = () => undefined;
  const lines = rl[Symbol.asyncIterator]();
  return {
    ask: async (question: string): Promise<string> => {
      process.stdout.write(question);
      const { value, done } = await lines.next();
      process.stdout.write('\n');
      if (done) throw new Error('Saisie interrompue');
      return value;
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      email: { type: 'string' },
      'first-name': { type: 'string' },
      'last-name': { type: 'string' },
      role: { type: 'string' },
    },
  });

  if (values.help) {
    console.log(`
Usage : pnpm --filter api user:set-password --email <email> [--first-name <prenom> --last-name <nom>] [--role <code_role>]

Options :
  -h, --help        Affiche cette aide
  --email           Adresse e-mail de l'utilisateur (obligatoire)
  --first-name      Prénom (obligatoire pour un nouvel utilisateur)
  --last-name       Nom (obligatoire pour un nouvel utilisateur)
  --role            Code du rôle à assigner (ex: ADMIN, SALES_REP)
`);
    return;
  }

  const email = values.email?.trim().toLowerCase();
  if (!email) throw new Error('--email est obligatoire');

  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing && (!values['first-name'] || !values['last-name'])) {
      throw new Error(
        'Nouvel utilisateur : --first-name et --last-name sont obligatoires',
      );
    }

    const prompter = hiddenPrompter();
    const password = await prompter.ask('Mot de passe : ');
    const confirmation = await prompter.ask('Confirmation : ');
    prompter.close();
    const problems = passwords.checkPolicy(password, email);
    if (problems.length > 0) {
      throw new Error(`Mot de passe refusé : ${problems.join(', ')}`);
    }
    if (confirmation !== password) {
      throw new Error('Les deux saisies diffèrent');
    }
    const passwordHash = await passwords.hash(password);

    if (existing) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
        }),
        prisma.session.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.auditLog.create({
          data: {
            action: 'auth.password.set',
            entityType: 'user',
            entityId: existing.id,
            metadata: { via: 'cli' },
          },
        }),
      ]);
      console.log(
        `Mot de passe mis à jour pour ${email} (sessions révoquées).`,
      );
    } else {
      const user = await prisma.user.create({
        data: {
          email,
          firstName: values['first-name']!,
          lastName: values['last-name']!,
          passwordHash,
        },
      });
      await prisma.auditLog.create({
        data: {
          action: 'user.created',
          entityType: 'user',
          entityId: user.id,
          metadata: { via: 'cli' },
        },
      });
      console.log(`Utilisateur ${email} créé.`);
    }

    if (values.role) {
      await seedRbac(prisma);
      const roleCode = values.role.trim().toUpperCase();
      const targetUserId = existing
        ? existing.id
        : (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) {
        throw new Error(
          `Rôle inconnu : ${roleCode}. Lancez pnpm --filter api db:seed`,
        );
      }
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: targetUserId,
            roleId: role.id,
          },
        },
        create: {
          userId: targetUserId,
          roleId: role.id,
        },
        update: {},
      });
      console.log(`Rôle ${roleCode} assigné à ${email}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
