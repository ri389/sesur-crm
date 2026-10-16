import { ConfigService } from '@nestjs/config';

export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');
export const SESSION_COOKIE_NAME = 'sesur_sid';

export interface AuthSettings {
  /** Échecs consécutifs avant verrouillage du compte. */
  maxFailedAttempts: number;
  lockDurationMs: number;
  /** Expiration de la session après inactivité. */
  sessionIdleMs: number;
  /** Durée de vie maximale d'une session, même active. */
  sessionAbsoluteMs: number;
  /** Cookie limité à HTTPS (les navigateurs l'acceptent aussi sur http://localhost). */
  cookieSecure: boolean;
}

const MINUTE = 60_000;

function positiveInt(config: ConfigService, key: string, fallback: number) {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} doit être un entier strictement positif`);
  }
  return value;
}

export function loadAuthSettings(config: ConfigService): AuthSettings {
  return {
    maxFailedAttempts: positiveInt(config, 'AUTH_MAX_FAILED_ATTEMPTS', 5),
    lockDurationMs: positiveInt(config, 'AUTH_LOCK_MINUTES', 15) * MINUTE,
    sessionIdleMs: positiveInt(config, 'SESSION_IDLE_MINUTES', 30) * MINUTE,
    sessionAbsoluteMs:
      positiveInt(config, 'SESSION_ABSOLUTE_HOURS', 12) * 60 * MINUTE,
    cookieSecure: config.get<string>('SESSION_COOKIE_SECURE') !== 'false',
  };
}
