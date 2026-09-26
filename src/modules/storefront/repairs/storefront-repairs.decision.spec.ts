import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RepairStatus } from '@prisma/client';
import { StorefrontRepairsService } from './storefront-repairs.service';

type Row = {
  status: RepairStatus;
  estimatedCost: number | null;
  [k: string]: unknown;
};

const row: Row = {
  id: 'r1',
  userId: 'u1',
  warrantyId: null,
  warranty: null,
  user: { fullName: 'علی', mobile: '09120000000' },
  issueDescription: 'روشن نمی‌شود',
  status: 'awaiting_customer',
  statusHistory: [
    {
      status: 'received' as RepairStatus,
      at: new Date('2026-01-01T10:00:00Z'),
      note: null,
      by: 'admin' as const,
    },
  ],
  technicianNote: 'برد سوخته',
  estimatedCost: 1_850_000,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-02T10:00:00Z'),
};

function make(overrides: Partial<Row> = {}) {
  const current = { ...row, ...overrides };
  const repairs = {
    findById: jest.fn().mockResolvedValue(current),
    transitionByOwner: jest.fn<
      Promise<unknown>,
      [string, string, RepairStatus[], RepairStatus, (string | null | undefined)?]
    >((id: string, userId: string, from: RepairStatus[], to: RepairStatus, note?: string | null) =>
      Promise.resolve({
        ...current,
        status: to,
        statusHistory: [
          ...(current.statusHistory as unknown[]),
          {
            status: to,
            at: new Date('2026-01-03T10:00:00Z'),
            note: note ?? null,
            by: 'customer' as const,
          },
        ],
      }),
    ),
  };
  const mediaRows = { findByOwner: jest.fn().mockResolvedValue([]), findByOwners: jest.fn() };
  const service = new StorefrontRepairsService(
    repairs as never,
    {} as never,
    {} as never,
    mediaRows as never,
  );
  return { service, repairs };
}

describe('StorefrontRepairsService.decide', () => {
  it('approve moves the request into repair and records the customer entry', async () => {
    const { service, repairs } = make();
    const view = await service.decide('u1', 'r1', 'approve', 'تأیید می‌کنم');

    expect(repairs.transitionByOwner).toHaveBeenCalledWith(
      'r1',
      'u1',
      ['awaiting_customer'],
      'in_progress',
      'تأیید می‌کنم',
    );
    expect(view.status).toBe('in_progress');
    expect(view.statusHistory.at(-1)).toMatchObject({
      status: 'in_progress',
      by: 'customer',
      note: 'تأیید می‌کنم',
    });
  });

  it('reject cancels the request', async () => {
    const { service, repairs } = make();
    const view = await service.decide('u1', 'r1', 'reject');
    expect(repairs.transitionByOwner).toHaveBeenCalledWith(
      'r1',
      'u1',
      ['awaiting_customer'],
      'canceled',
      undefined,
    );
    expect(view.status).toBe('canceled');
  });

  it("404s (not 403) for someone else's request", async () => {
    const { service, repairs } = make();
    await expect(service.decide('other', 'r1', 'approve')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repairs.transitionByOwner).not.toHaveBeenCalled();
  });

  it('404s for an unknown request', async () => {
    const { service, repairs } = make();
    repairs.findById.mockResolvedValue(null);
    await expect(service.decide('u1', 'nope', 'approve')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when the request is not awaiting the customer', async () => {
    const { service } = make({ status: 'in_progress' as RepairStatus });
    await expect(service.decide('u1', 'r1', 'approve')).rejects.toBeInstanceOf(ConflictException);
  });

  it('409s when no cost has been quoted yet', async () => {
    const { service } = make({ estimatedCost: null });
    await expect(service.decide('u1', 'r1', 'approve')).rejects.toBeInstanceOf(ConflictException);
  });

  it('409s when the compare-and-set loses the race', async () => {
    const { service, repairs } = make();
    repairs.transitionByOwner.mockResolvedValue(null);
    await expect(service.decide('u1', 'r1', 'approve')).rejects.toBeInstanceOf(ConflictException);
  });
});
