import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** Paramètres Argon2id (RFC 9106, seconde recommandation : 64 Mio, t=3, p=4). */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Coût équivalent à une vérification réelle, pour ne pas révéler par le temps de réponse si le compte existe. */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64url'));
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Règles minimales pour un nouveau mot de passe ; renvoie les problèmes trouvés. */
  checkPolicy(password: string, email?: string): string[] {
    const problems: string[] = [];
    if (password.length < PASSWORD_MIN_LENGTH) {
      problems.push(`au moins ${PASSWORD_MIN_LENGTH} caractères`);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      problems.push(`au plus ${PASSWORD_MAX_LENGTH} caractères`);
    }
    if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
      problems.push("différent de l'adresse e-mail");
    }
    return problems;
  }
}
