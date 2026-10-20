import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DuplicateCheckInput {
  email?: string;
  phone?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  excludeId?: string;
}

export type DuplicateEntityType = 'LEAD' | 'CONTACT' | 'ORGANIZATION';

export interface DuplicateCandidate {
  id: string;
  type: DuplicateEntityType;
  title: string;
  score: number;
  reason: string;
}

export function normalizeEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const cleaned = email.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length > 0 ? digits : undefined;
}

export function normalizeString(text?: string): string | undefined {
  if (!text) return undefined;
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeCompanyName(company?: string): string | undefined {
  const norm = normalizeString(company);
  if (!norm) return undefined;
  // Retirer les formes juridiques courantes
  return norm
    .replace(/\b(sarl|sas|sasu|sa|ets|etablissement|cie|inc|ltd)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance de Levenshtein simple pour calculer la similarité textuelle (0 à 1). */
export function similarityScore(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

@Injectable()
export class DuplicateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async checkDuplicates(
    input: DuplicateCheckInput,
  ): Promise<DuplicateCandidate[]> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const company = normalizeCompanyName(input.companyName);
    const firstName = normalizeString(input.firstName);
    const lastName = normalizeString(input.lastName);

    const candidates: DuplicateCandidate[] = [];

    // 1. Vérification sur l'e-mail (score = 100)
    if (email) {
      const matchingLeads = await this.prisma.lead.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        },
        select: { id: true, firstName: true, lastName: true, companyName: true },
      });
      for (const lead of matchingLeads) {
        candidates.push({
          id: lead.id,
          type: 'LEAD',
          title: `${lead.firstName} ${lead.lastName}${lead.companyName ? ` (${lead.companyName})` : ''}`,
          score: 100,
          reason: `Adresse e-mail identique (${email})`,
        });
      }

      const matchingContacts = await this.prisma.contact.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          organization: { select: { name: true } },
        },
      });
      for (const contact of matchingContacts) {
        candidates.push({
          id: contact.id,
          type: 'CONTACT',
          title: `${contact.firstName} ${contact.lastName}${contact.organization ? ` (${contact.organization.name})` : ''}`,
          score: 100,
          reason: `Adresse e-mail identique (${email})`,
        });
      }
    }

    // 2. Vérification sur le téléphone (score = 90)
    if (phone) {
      const matchingLeads = await this.prisma.lead.findMany({
        where: {
          phone: { contains: phone.slice(-8) },
          deletedAt: null,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      for (const lead of matchingLeads) {
        if (!candidates.some((c) => c.id === lead.id)) {
          candidates.push({
            id: lead.id,
            type: 'LEAD',
            title: `${lead.firstName} ${lead.lastName}`,
            score: 90,
            reason: `Numéro de téléphone correspondant (${lead.phone})`,
          });
        }
      }

      const matchingContacts = await this.prisma.contact.findMany({
        where: {
          phone: { contains: phone.slice(-8) },
          deletedAt: null,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      for (const contact of matchingContacts) {
        if (!candidates.some((c) => c.id === contact.id)) {
          candidates.push({
            id: contact.id,
            type: 'CONTACT',
            title: `${contact.firstName} ${contact.lastName}`,
            score: 90,
            reason: `Numéro de téléphone correspondant (${contact.phone})`,
          });
        }
      }
    }

    // 3. Vérification sur l'organisation / entreprise (score = 75 - 85)
    if (company && company.length >= 3) {
      const orgs = await this.prisma.organization.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, isClient: true },
      });
      for (const org of orgs) {
        const normOrg = normalizeCompanyName(org.name);
        if (normOrg) {
          const sim = similarityScore(company, normOrg);
          if (sim >= 0.75) {
            candidates.push({
              id: org.id,
              type: 'ORGANIZATION',
              title: `${org.name} (${org.isClient ? 'Client' : 'Organisation'})`,
              score: Math.round(sim * 85),
              reason: `Nom d'organisation très similaire (${org.name})`,
            });
          }
        }
      }
    }

    // Trier par score décroissant
    return candidates.sort((a, b) => b.score - a.score);
  }

  async merge(
    type: DuplicateEntityType,
    keepId: string,
    dropId: string,
    actorUserId: string,
  ): Promise<{ keepId: string; dropId: string }> {
    if (keepId === dropId) {
      throw new BadRequestException('Choisissez deux fiches distinctes à fusionner.');
    }

    if (type === 'LEAD') {
      const [keep, drop] = await Promise.all([
        this.prisma.lead.findFirst({ where: { id: keepId, deletedAt: null } }),
        this.prisma.lead.findFirst({ where: { id: dropId, deletedAt: null } }),
      ]);
      if (!keep || !drop) throw new NotFoundException('Prospect introuvable');
      await this.prisma.$transaction([
        this.prisma.interaction.updateMany({
          where: { leadId: dropId },
          data: { leadId: keepId },
        }),
        this.prisma.lead.update({
          where: { id: keepId },
          data: {
            email: keep.email ?? drop.email,
            phone: keep.phone ?? drop.phone,
            companyName: keep.companyName ?? drop.companyName,
          },
        }),
        this.prisma.lead.update({
          where: { id: dropId },
          data: { deletedAt: new Date() },
        }),
      ]);
    } else if (type === 'CONTACT') {
      const [keep, drop] = await Promise.all([
        this.prisma.contact.findFirst({ where: { id: keepId, deletedAt: null } }),
        this.prisma.contact.findFirst({ where: { id: dropId, deletedAt: null } }),
      ]);
      if (!keep || !drop) throw new NotFoundException('Contact introuvable');
      await this.prisma.$transaction([
        this.prisma.interaction.updateMany({
          where: { contactId: dropId },
          data: { contactId: keepId },
        }),
        this.prisma.lead.updateMany({
          where: { contactId: dropId },
          data: { contactId: keepId },
        }),
        this.prisma.contact.update({
          where: { id: keepId },
          data: {
            email: keep.email ?? drop.email,
            phone: keep.phone ?? drop.phone,
            organizationId: keep.organizationId ?? drop.organizationId,
          },
        }),
        this.prisma.contact.update({
          where: { id: dropId },
          data: { deletedAt: new Date() },
        }),
      ]);
    } else {
      const [keep, drop] = await Promise.all([
        this.prisma.organization.findFirst({
          where: { id: keepId, deletedAt: null },
        }),
        this.prisma.organization.findFirst({
          where: { id: dropId, deletedAt: null },
        }),
      ]);
      if (!keep || !drop) throw new NotFoundException('Organisation introuvable');
      await this.prisma.$transaction([
        this.prisma.contact.updateMany({
          where: { organizationId: dropId },
          data: { organizationId: keepId },
        }),
        this.prisma.lead.updateMany({
          where: { organizationId: dropId },
          data: { organizationId: keepId },
        }),
        this.prisma.interaction.updateMany({
          where: { organizationId: dropId },
          data: { organizationId: keepId },
        }),
        this.prisma.organization.update({
          where: { id: keepId },
          data: {
            email: keep.email ?? drop.email,
            phone: keep.phone ?? drop.phone,
            isClient: keep.isClient || drop.isClient,
          },
        }),
        this.prisma.organization.update({
          where: { id: dropId },
          data: { deletedAt: new Date() },
        }),
      ]);
    }

    await this.audit.record({
      action: 'duplicate.merged',
      entityType: type.toLowerCase(),
      entityId: keepId,
      actorUserId,
      metadata: { dropId, type },
    });
    return { keepId, dropId };
  }
}
