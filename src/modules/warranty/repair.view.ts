import type { Media } from '@prisma/client';

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
