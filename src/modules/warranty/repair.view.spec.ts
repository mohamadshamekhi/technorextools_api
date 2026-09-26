import { RepairStatus } from '@prisma/client';
import { repairStatusLabel } from './repair.view';

describe('repairStatusLabel', () => {
  it('has a Persian label for every RepairStatus value', () => {
    for (const status of Object.values(RepairStatus)) {
      expect(repairStatusLabel(status)).toBeTruthy();
    }
  });

  it('maps the new panel statuses', () => {
    expect(repairStatusLabel('awaiting_parts')).toBe('در انتظار قطعه');
    expect(repairStatusLabel('done')).toBe('آماده تحویل');
    expect(repairStatusLabel('canceled')).toBe('لغو شد');
  });
});
