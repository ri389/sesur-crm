import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

function controllerWithDatabase(reachable: boolean): HealthController {
  const prisma = {
    isReachable: jest.fn().mockResolvedValue(reachable),
  } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('reports ok when the database is reachable', async () => {
    const result = await controllerWithDatabase(true).check();
    expect(result).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is unreachable', async () => {
    await expect(controllerWithDatabase(false).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
