import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let result = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Clé TOTP invalide');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

@Injectable()
export class TotpService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return encodeBase32(randomBytes(20));
  }

  provisioningUri(email: string, secret: string): string {
    const label = encodeURIComponent(`SESUR CRM:${email}`);
    const query = new URLSearchParams({
      secret,
      issuer: 'SESUR CRM',
      algorithm: 'SHA1',
      digits: '6',
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decryptSecret(encrypted: string): string {
    const [encodedIv, encodedTag, encodedCiphertext] = encrypted.split('.');
    if (!encodedIv || !encodedTag || !encodedCiphertext) {
      throw new Error('Clé TOTP chiffrée invalide');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  matchingCounter(secret: string, code: string, now = new Date()): bigint | null {
    if (!/^\d{6}$/u.test(code)) return null;
    const current = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
    const provided = Buffer.from(code, 'ascii');
    const key = decodeBase32(secret);
    for (const offset of [-1, 0, 1]) {
      const counter = current + offset;
      if (counter < 0) continue;
      const message = Buffer.alloc(8);
      message.writeBigUInt64BE(BigInt(counter));
      const digest = createHmac('sha1', key).update(message).digest();
      const index = digest[digest.length - 1]! & 0x0f;
      const binary =
        ((digest[index]! & 0x7f) << 24) |
        ((digest[index + 1]! & 0xff) << 16) |
        ((digest[index + 2]! & 0xff) << 8) |
        (digest[index + 3]! & 0xff);
      const expected = Buffer.from(String(binary % 1_000_000).padStart(6, '0'));
      if (timingSafeEqual(provided, expected)) return BigInt(counter);
    }
    return null;
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>('TOTP_ENCRYPTION_KEY')?.trim();
    if (!configured) {
      throw new ServiceUnavailableException(
        'Le service TOTP n’est pas configuré. Définissez TOTP_ENCRYPTION_KEY.',
      );
    }
    if (/^[a-f\d]{64}$/iu.test(configured)) return Buffer.from(configured, 'hex');
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'TOTP_ENCRYPTION_KEY doit contenir une clé de 32 octets (base64 ou 64 caractères hexadécimaux).',
      );
    }
    return key;
  }
}
