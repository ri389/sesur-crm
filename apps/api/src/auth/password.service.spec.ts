import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('produit un hachage Argon2id salé, jamais le mot de passe en clair', async () => {
    const a = await passwords.hash('correct horse battery');
    const b = await passwords.hash('correct horse battery');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
    expect(a).not.toContain('correct horse battery');
    expect(a).not.toEqual(b);
  });

  it('vérifie le bon mot de passe et refuse un mauvais', async () => {
    const hash = await passwords.hash('correct horse battery');
    await expect(passwords.verify(hash, 'correct horse battery')).resolves.toBe(
      true,
    );
    await expect(passwords.verify(hash, 'Correct horse battery')).resolves.toBe(
      false,
    );
  });

  it('refuse un hachage invalide sans lever d’erreur', async () => {
    await expect(passwords.verify('pas-un-hachage', 'x')).resolves.toBe(false);
  });

  it('demande un nouveau hachage si les paramètres ont changé', async () => {
    const current = await passwords.hash('correct horse battery');
    expect(passwords.needsRehash(current)).toBe(false);
    expect(
      passwords.needsRehash(
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).toBe(true);
  });

  it('applique la politique minimale des nouveaux mots de passe', () => {
    expect(passwords.checkPolicy('court')).toEqual(['au moins 12 caractères']);
    expect(passwords.checkPolicy('x'.repeat(129))).toEqual([
      'au plus 128 caractères',
    ]);
    expect(
      passwords.checkPolicy('jean.dupont@sesur.bj', 'Jean.Dupont@sesur.bj'),
    ).toEqual(["différent de l'adresse e-mail"]);
    expect(passwords.checkPolicy('une phrase de passe solide')).toEqual([]);
  });
});
