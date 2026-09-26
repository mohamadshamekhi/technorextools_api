import type { Media, RepairEventActor, RepairRequest, RepairStatus } from '@prisma/client';

/** A `REPAIR_REQUEST`-owned media row as the repair views expose it. */
export interface RepairAttachmentView {
  id: string;
  url: string;
  contentType: string;
  originalName: string | null;
}

export function toAttachmentViews(rows: Media[]): RepairAttachmentView[] {
  return rows.map((m) => ({
    id: m.id,
    url: m.url,
    contentType: m.contentType,
    originalName: m.originalName,
  }));
}

/** Persian label per `RepairStatus` — the panel renders `statusLabel`, not its own map. */
const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  received: 'دریافت‌شده',
  reviewing: 'در حال بررسی',
  awaiting_customer: 'در انتظار تأیید مشتری',
  awaiting_parts: 'در انتظار قطعه',
  in_progress: 'در حال تعمیر',
  done: 'آماده تحویل',
  delivered: 'تحویل شد',
  canceled: 'لغو شد',
};

export function repairStatusLabel(status: RepairStatus): string {
  return REPAIR_STATUS_LABELS[status];
}

/** One entry of the repair timeline as both panels expose it. */
export interface RepairStatusEventView {
  status: RepairStatus;
  statusLabel: string;
  at: Date;
  note: string | null;
  /** Who moved it — rows written before the field existed read as `admin`. */
  by: RepairEventActor;
}

/**
 * The stored timeline, oldest first. Requests created before the timeline
 * existed have an empty array — those get a synthetic opening entry from
 * `createdAt` so the client never has to special-case them.
 */
export function toStatusHistoryView(
  r: Pick<RepairRequest, 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>,
): RepairStatusEventView[] {
  const rows = [...r.statusHistory].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (rows.length === 0) {
    const opened: RepairStatusEventView[] = [
      {
        status: 'received',
        statusLabel: repairStatusLabel('received'),
        at: r.createdAt,
        note: null,
        by: 'system',
      },
    ];
    if (r.status !== 'received') {
      opened.push({
        status: r.status,
        statusLabel: repairStatusLabel(r.status),
        at: r.updatedAt,
        note: null,
        by: 'admin',
      });
    }
    return opened;
  }
  return rows.map((e) => ({
    status: e.status,
    statusLabel: repairStatusLabel(e.status),
    at: e.at,
    note: e.note,
    by: e.by ?? 'admin',
  }));
}
