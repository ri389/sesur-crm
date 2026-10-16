export interface LockoutState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * État après un échec, `failedLoginCount` incluant déjà cet échec.
 * Au seuil, le compte est verrouillé et le compteur repart de zéro
 * pour la période suivante.
 */
export function afterFailedAttempt(
  failedLoginCount: number,
  policy: { maxFailedAttempts: number; lockDurationMs: number },
  now: Date,
): LockoutState {
  if (failedLoginCount >= policy.maxFailedAttempts) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + policy.lockDurationMs),
    };
  }
  return { failedLoginCount, lockedUntil: null };
}
