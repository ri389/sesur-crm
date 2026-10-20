import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { LeadService } from '../leads/lead.service';
import { ImportLeadsDto } from './dto/import-leads.dto';

export interface ImportRowResult {
  index: number;
  status: 'created' | 'duplicate' | 'error';
  leadId?: string;
  message?: string;
  candidates?: unknown;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly leads: LeadService,
    private readonly audit: AuditService,
  ) {}

  async importLeads(
    dto: ImportLeadsDto,
    actorUserId: string,
  ): Promise<{ results: ImportRowResult[] }> {
    const results: ImportRowResult[] = [];
    for (const [index, row] of dto.rows.entries()) {
      try {
        const lead = await this.leads.create(row, actorUserId);
        results.push({ index, status: 'created', leadId: lead.id });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === HttpStatus.CONFLICT) {
          const body = error.getResponse() as {
            message?: string;
            candidates?: unknown;
          };
          results.push({
            index,
            status: 'duplicate',
            message:
              typeof body === 'object' ? body.message : 'Doublon potentiel',
            candidates: typeof body === 'object' ? body.candidates : undefined,
          });
        } else {
          results.push({
            index,
            status: 'error',
            message: error instanceof Error ? error.message : 'Erreur',
          });
        }
      }
    }
    await this.audit.record({
      action: 'import.leads',
      entityType: 'lead',
      actorUserId,
      metadata: {
        total: dto.rows.length,
        created: results.filter((r) => r.status === 'created').length,
        duplicates: results.filter((r) => r.status === 'duplicate').length,
      },
    });
    return { results };
  }
}
