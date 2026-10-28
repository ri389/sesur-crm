import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly client: ReturnType<typeof createClient>;
  private connecting?: Promise<void>;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL')?.trim();
    const socket = {
      connectTimeout: 1_500,
      reconnectStrategy: (retries: number) => (retries >= 2 ? false : 150 * (retries + 1)),
    };
    this.client = createClient(url ? { url, socket } : { socket });
    this.client.on('error', () => undefined);
  }

  async get(key: string): Promise<string | null> {
    await this.ensureReady();
    try {
      return await this.client.get(key);
    } catch {
      throw this.unavailable();
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.ensureReady();
    try {
      await this.client.set(key, value, { EX: ttlSeconds });
    } catch {
      throw this.unavailable();
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    try {
      await this.client.del(key);
    } catch {
      throw this.unavailable();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      try {
        await this.client.quit();
      } catch {
        this.client.destroy();
      }
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.client.isReady) {
      if (this.client.isOpen) throw this.unavailable();
      this.connecting ??= this.client
        .connect()
        .then(() => undefined)
        .catch((error: unknown) => {
          this.connecting = undefined;
          throw error;
        });
      try {
        await this.connecting;
      } catch {
        throw this.unavailable();
      }
    }
    if (!this.client.isReady) throw this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Le cache temporaire des inscriptions est indisponible. Réessayez dans un instant.',
    );
  }
}
