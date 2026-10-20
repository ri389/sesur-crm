import { Injectable } from '@nestjs/common';
import { effectiveScope } from '../../auth/rbac';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

export interface SearchHit {
  type: 'LEAD' | 'CONTACT' | 'ORGANIZATION' | 'PRODUCT';
  id: string;
  title: string;
  subtitle?: string | null;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, user: AuthenticatedUser): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const can = (resource: string) => Boolean(effectiveScope(user, resource, 'read'));

    const [leads, contacts, organizations, products] = await Promise.all([
      can('lead')
        ? this.prisma.lead.findMany({
            where: {
              deletedAt: null,
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { companyName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            },
            take: 8,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      can('contact')
        ? this.prisma.contact.findMany({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        },
            take: 8,
            include: { organization: { select: { name: true } } },
          })
        : Promise.resolve([]),
      can('organization')
        ? this.prisma.organization.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        },
            take: 8,
          })
        : Promise.resolve([]),
      can('product')
        ? this.prisma.product.findMany({
            where: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    return [
      ...leads.map((lead) => ({
        type: 'LEAD' as const,
        id: lead.id,
        title: `${lead.firstName} ${lead.lastName}`,
        subtitle: lead.companyName,
      })),
      ...contacts.map((contact) => ({
        type: 'CONTACT' as const,
        id: contact.id,
        title: `${contact.firstName} ${contact.lastName}`,
        subtitle: contact.organization?.name,
      })),
      ...organizations.map((org) => ({
        type: 'ORGANIZATION' as const,
        id: org.id,
        title: org.name,
        subtitle: org.isClient ? 'Client' : 'Organisation',
      })),
      ...products.map((product) => ({
        type: 'PRODUCT' as const,
        id: product.id,
        title: product.name,
        subtitle: product.sku,
      })),
    ];
  }
}
