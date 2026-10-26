import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { IntegrationDeliveryStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const LEASE_TIMEOUT_MS = 300_000;
const BATCH_SIZE = 5;

@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.dispatchBatch(), 5_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private get webhookConfig(): { url: URL; secret: string } | null {
    const rawUrl = process.env.INTEGRATION_WEBHOOK_URL?.trim();
    const secret = process.env.INTEGRATION_WEBHOOK_SECRET;
    if (!rawUrl || !secret) return null;
    try {
      const url = new URL(rawUrl);
      const localHttp =
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localHttp) return null;
      return { url, secret };
    } catch {
      return null;
    }
  }

  getStatus() {
    const config = this.webhookConfig;
    return {
      webhook: {
        configured: config !== null,
        endpoint: config?.url.origin ?? null,
        signature: 'HMAC-SHA256',
        retryMaxAttempts: this.maxAttempts,
      },
    };
  }

  private get maxAttempts(): number {
    const configured = Number(process.env.INTEGRATION_RETRY_MAX_ATTEMPTS);
    return Number.isInteger(configured) && configured >= 1 && configured <= 20
      ? configured
      : 8;
  }

  async enqueue(
    eventType: string,
    entityType: string,
    entityId: string,
    payload: Prisma.InputJsonObject,
    idempotencyKey: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!this.webhookConfig) return;
    const client = transaction ?? this.prisma;
    await client.integrationDelivery.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        eventType,
        entityType,
        entityId,
        payload,
      },
      update: {},
    });
  }

  async listDeliveries() {
    const rows = await this.prisma.integrationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        lastError: true,
        responseStatus: true,
        deliveredAt: true,
        createdAt: true,
        attempts: {
          orderBy: { occurredAt: 'desc' },
          take: 5,
          select: {
            attempt: true,
            succeeded: true,
            statusCode: true,
            error: true,
            occurredAt: true,
          },
        },
      },
    });
    return rows;
  }

  async replay(id: string, user: AuthenticatedUser, context: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.integrationDelivery.updateMany({
        where: { id, status: IntegrationDeliveryStatus.DEAD },
        data: {
          status: IntegrationDeliveryStatus.QUEUED,
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lastError: null,
          responseStatus: null,
        },
      });
      if (!result.count) {
        throw new ConflictException(
          'Seules les livraisons en échec définitif peuvent être rejouées.',
        );
      }
      await this.audit.record(
        {
          action: 'integration.delivery_replayed',
          entityType: 'integration_delivery',
          entityId: id,
          actorUserId: user.id,
          ...context,
        },
        tx,
      );
      return { id, status: IntegrationDeliveryStatus.QUEUED };
    });
  }

  private async dispatchBatch(): Promise<void> {
    if (this.running || !this.webhookConfig) return;
    this.running = true;
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - LEASE_TIMEOUT_MS);
      const candidates = await this.prisma.integrationDelivery.findMany({
        where: {
          OR: [
            {
              status: IntegrationDeliveryStatus.QUEUED,
              nextAttemptAt: { lte: now },
            },
            {
              status: IntegrationDeliveryStatus.PROCESSING,
              updatedAt: { lt: staleBefore },
            },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: BATCH_SIZE,
      });

      for (const delivery of candidates) {
        const claimed = await this.prisma.integrationDelivery.updateMany({
          where: {
            id: delivery.id,
            OR: [
              {
                status: IntegrationDeliveryStatus.QUEUED,
                nextAttemptAt: { lte: now },
              },
              {
                status: IntegrationDeliveryStatus.PROCESSING,
                updatedAt: { lt: staleBefore },
              },
            ],
          },
          data: { status: IntegrationDeliveryStatus.PROCESSING },
        });
        if (!claimed.count) continue;
        await this.deliver(delivery);
      }
    } catch (error) {
      this.logger.error(
        'Échec du worker de livraison des intégrations.',
        error,
      );
    } finally {
      this.running = false;
    }
  }

  private async deliver(delivery: {
    id: string;
    eventType: string;
    entityType: string;
    entityId: string | null;
    payload: Prisma.JsonValue;
    attemptCount: number;
  }): Promise<void> {
    const config = this.webhookConfig;
    if (!config) return;
    const attempt = delivery.attemptCount + 1;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      id: delivery.id,
      type: delivery.eventType,
      occurredAt: new Date().toISOString(),
      entity: { type: delivery.entityType, id: delivery.entityId },
      data: delivery.payload,
    });
    const signature = createHmac('sha256', config.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    let statusCode: number | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'content-type': 'application/json',
          'x-sesur-event': delivery.eventType,
          'x-sesur-delivery': delivery.id,
          'x-sesur-timestamp': timestamp,
          'x-sesur-signature': `sha256=${signature}`,
          'idempotency-key': delivery.id,
        },
        body,
      });
      statusCode = response.status;
      if (!response.ok) failure = `HTTP ${response.status}`;
    } catch (error) {
      failure =
        error instanceof Error ? error.message.slice(0, 900) : 'Erreur réseau';
    }

    const succeeded = failure === null;
    const dead = !succeeded && attempt >= this.maxAttempts;
    const retryDelayMs = Math.min(
      3_600_000,
      30_000 * 2 ** Math.min(attempt - 1, 7),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationAttempt.create({
        data: {
          deliveryId: delivery.id,
          attempt,
          succeeded,
          statusCode,
          error: failure,
        },
      });
      await tx.integrationDelivery.update({
        where: { id: delivery.id },
        data: {
          attemptCount: attempt,
          status: succeeded
            ? IntegrationDeliveryStatus.DELIVERED
            : dead
              ? IntegrationDeliveryStatus.DEAD
              : IntegrationDeliveryStatus.QUEUED,
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
          lastError: failure,
          responseStatus: statusCode,
          deliveredAt: succeeded ? new Date() : null,
        },
      });
      await this.audit.record(
        {
          action: succeeded
            ? 'integration.delivery_succeeded'
            : dead
              ? 'integration.delivery_dead'
              : 'integration.delivery_retry_scheduled',
          entityType: 'integration_delivery',
          entityId: delivery.id,
          metadata: {
            eventType: delivery.eventType,
            attempt,
            statusCode,
          },
        },
        tx,
      );
    });
  }
}
