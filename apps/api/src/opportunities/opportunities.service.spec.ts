import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OpportunityStage, PermissionScope } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { effectiveScope } from '../auth/rbac';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunitiesService } from './opportunities.service';

jest.mock('../auth/rbac', () => ({
  effectiveScope: jest.fn(),
}));

describe('OpportunitiesService', () => {
  const user = {
    id: 'user-1',
    email: 'test@sesur.bj',
    firstName: 'Test',
    lastName: 'Commercial',
    teamId: 'team-1',
    roles: ['SALES_MANAGER'],
    permissions: [],
  } as unknown as AuthenticatedUser;

  const context = {
    ipAddress: '127.0.0.1',
    userAgent: 'Jest',
  } as RequestContext;

  const prismaMock = {
    opportunity: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditMock = {
    record: jest.fn(),
  };

  let service: OpportunitiesService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new OpportunitiesService(
      prismaMock as unknown as PrismaService,
      auditMock as unknown as AuditService,
    );
  });

  it('crée une opportunité et enregistre un audit', async () => {
    jest.mocked(effectiveScope).mockReturnValue(PermissionScope.ALL);

    prismaMock.user.findUnique.mockResolvedValue({
      id: user.id,
      teamId: user.teamId,
    });

    const created = {
      id: 'opportunity-1',
      name: 'Projet SESUR',
      ownerUserId: user.id,
    };

    prismaMock.opportunity.create.mockResolvedValue(created);

    auditMock.record.mockResolvedValue(undefined);

    const result = await service.create(
      {
        name: 'Projet SESUR',
        amount: '1500000.00',
        probability: 30,
      },
      user,
      context,
    );

    expect(result).toEqual(created);
    expect(prismaMock.opportunity.create).toHaveBeenCalledTimes(1);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'opportunity.created',
        entityId: created.id,
        actorUserId: user.id,
      }),
    );
  });

  it('refuse la création sans permission', async () => {
    jest.mocked(effectiveScope).mockReturnValue(null);

    await expect(
      service.create(
        { name: 'Projet interdit' },
        user,
        context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prismaMock.opportunity.create).not.toHaveBeenCalled();
  });

  it('exige une raison lorsqu’une opportunité est perdue', async () => {
    jest.mocked(effectiveScope).mockReturnValue(PermissionScope.ALL);

    prismaMock.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-1',
      stage: OpportunityStage.NEGOTIATION,
    });

    await expect(
      service.updateStage(
        'opportunity-1',
        {
          stage: OpportunityStage.LOST,
          lostReason: '   ',
        },
        user,
        context,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.opportunity.update).not.toHaveBeenCalled();
  });

  it('effectue une suppression logique et enregistre un audit', async () => {
    jest.mocked(effectiveScope).mockReturnValue(PermissionScope.ALL);

    prismaMock.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity-1',
      name: 'Projet SESUR',
      stage: OpportunityStage.QUALIFICATION,
    });

    prismaMock.opportunity.update.mockResolvedValue({
      id: 'opportunity-1',
      name: 'Projet SESUR',
      deletedAt: new Date(),
    });

    auditMock.record.mockResolvedValue(undefined);

    const result = await service.remove(
      'opportunity-1',
      user,
      context,
    );

    expect(result).toEqual({
      id: 'opportunity-1',
      deleted: true,
    });

    expect(prismaMock.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'opportunity-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      }),
    );

    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'opportunity.deleted',
        entityId: 'opportunity-1',
      }),
    );
  });
  
it('récupère les opportunités accessibles à l’utilisateur', async () => {
  jest.mocked(effectiveScope).mockReturnValue(PermissionScope.ALL);

  const opportunities = [
    {
      id: 'opportunity-1',
      name: 'Projet SESUR',
      stage: OpportunityStage.QUALIFICATION,
    },
  ];

  prismaMock.$transaction.mockResolvedValue([
    opportunities,
    1,
  ] as never);

  const result = await service.findAll(
  { page: 1, limit: 20 },
  user,
);

  expect(result).toEqual(
  expect.objectContaining({
    data: opportunities,
    pagination: expect.objectContaining({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
  }),
);

  expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
});

it('applique la portée OWN lors de la consultation', async () => {
  jest.mocked(effectiveScope).mockReturnValue(PermissionScope.OWN);

  prismaMock.opportunity.findFirst.mockResolvedValue({
    id: 'opportunity-1',
    name: 'Projet SESUR',
    ownerUserId: user.id,
  } as never);

  await service.findOne('opportunity-1', user);

  expect(prismaMock.opportunity.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: 'opportunity-1',
        deletedAt: null,
        ownerUserId: user.id,
      }),
    }),
  );
});

it('refuse la consultation si aucune permission de lecture', async () => {
  jest.mocked(effectiveScope).mockReturnValue(null);

  await expect(
    service.findOne('opportunity-1', user),
  ).rejects.toBeInstanceOf(ForbiddenException);

  expect(prismaMock.opportunity.findFirst).not.toHaveBeenCalled();
});

it('renvoie NotFoundException pour une opportunité inaccessible', async () => {
  jest.mocked(effectiveScope).mockReturnValue(PermissionScope.OWN);
  prismaMock.opportunity.findFirst.mockResolvedValue(null);

  await expect(
    service.findOne('opportunity-1', user),
  ).rejects.toBeInstanceOf(NotFoundException);
});


});
