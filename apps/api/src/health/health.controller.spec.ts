import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
