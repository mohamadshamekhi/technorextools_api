import { NotFoundException } from '@nestjs/common';
import type { RepairStatus } from '@prisma/client';
import { BackofficeWarrantiesService } from './backoffice-warranties.service';

const baseRow = {
  id: 'r1',
  userId: 'u1',
  warrantyId: null,
  warranty: null,
  user: { fullName: 'علی', mobile: '09120000000' },
  issueDescription: 'روشن نمی‌شود',
  status: 'received' as RepairStatus,
  statusHistory: [],
  technicianNote: null,
  estimatedCost: null,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

function make(row = baseRow) {
  const repairs = {
    findById: jest.fn().mockResolvedValue(row),
    setStatus: jest.fn((id: string, status: RepairStatus, note?: string | null) =>
      Promise.resolve({
        ...row,
        status,
        statusHistory: [{ status, at: new Date('2026-01-02T10:00:00Z'), note: note ?? null }],
      }),
    ),
    update: jest.fn((id: string, data: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...data }),
    ),
  };
  const media = { findByOwner: jest.fn().mockResolvedValue([]) };
  const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
  const service = new BackofficeWarrantiesService(
    {} as never,
    repairs as never,
    {} as never,
    media as never,
    notifications as never,
  );
  return { service, repairs, notifications };
}

describe('BackofficeWarrantiesService — repairs', () => {
  it('records the transition and notifies the customer with a deep link', async () => {
    const { service, repairs, notifications } = make();
    const view = await service.setRepairStatus('r1', 'in_progress', 'قطعه تعویض شد');

    expect(repairs.setStatus).toHaveBeenCalledWith('r1', 'in_progress', 'قطعه تعویض شد');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'repair_status',
        link: '/dashboard/repairs/r1',
      }),
    );
    expect(view.statusHistory).toEqual([
      expect.objectContaining({ status: 'in_progress', note: 'قطعه تعویض شد' }),
    ]);
  });

  it('is a no-op when the status is re-sent without a note', async () => {
    const { service, repairs, notifications } = make();
    await service.setRepairStatus('r1', 'received');
    expect(repairs.setStatus).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('never fails the transition when the notification write fails', async () => {
    const { service, notifications } = make();
    notifications.create.mockRejectedValue(new Error('down'));
    await expect(service.setRepairStatus('r1', 'done')).resolves.toMatchObject({ status: 'done' });
  });

  it('back-fills a timeline for rows created before it existed', async () => {
    const { service } = make({ ...baseRow, status: 'in_progress' as RepairStatus });
    const view = await service.updateRepair('r1', { estimatedCost: 450_000 });
    expect(view.statusHistory).toEqual([
      expect.objectContaining({ status: 'received', at: baseRow.createdAt }),
      expect.objectContaining({ status: 'in_progress', at: baseRow.updatedAt }),
    ]);
    expect(view.estimatedCost).toBe(450_000);
  });

  it('sets technician findings without touching the status', async () => {
    const { service, repairs, notifications } = make();
    const view = await service.updateRepair('r1', {
      technicianNote: 'برد سوخته',
      estimatedCost: 0,
    });
    expect(repairs.update).toHaveBeenCalledWith('r1', {
      technicianNote: 'برد سوخته',
      estimatedCost: 0,
    });
    expect(repairs.setStatus).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(view.technicianNote).toBe('برد سوخته');
  });

  it('404s for an unknown repair', async () => {
    const { service, repairs } = make();
    repairs.findById.mockResolvedValue(null);
    await expect(service.setRepairStatus('nope', 'done')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateRepair('nope', { estimatedCost: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
