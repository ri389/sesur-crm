import { afterFailedAttempt, isLocked } from './lockout';

const policy = { maxFailedAttempts: 5, lockDurationMs: 15 * 60_000 };
const now = new Date('2026-01-01T10:00:00Z');

describe('verrouillage du compte', () => {
  it("n'est pas verrouillé sans date ou avec une date passée", () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isLocked(now, now)).toBe(false);
  });

  it('est verrouillé tant que la date de fin est future', () => {
    expect(isLocked(new Date(now.getTime() + 1), now)).toBe(true);
  });

  it('compte les échecs sous le seuil sans verrouiller', () => {
    expect(afterFailedAttempt(4, policy, now)).toEqual({
      failedLoginCount: 4,
      lockedUntil: null,
    });
  });

  it('verrouille au seuil pour la durée prévue et remet le compteur à zéro', () => {
    expect(afterFailedAttempt(5, policy, now)).toEqual({
      failedLoginCount: 0,
      lockedUntil: new Date('2026-01-01T10:15:00Z'),
    });
  });

  it('verrouille aussi au-delà du seuil (tentatives concurrentes)', () => {
    expect(afterFailedAttempt(7, policy, now).lockedUntil).not.toBeNull();
  });
});
