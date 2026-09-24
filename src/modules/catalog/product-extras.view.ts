import type { Media, Product, ProductDocument } from '@prisma/client';
import type { QuestionPublicRow } from './repositories/product-question.repository';

/** A downloadable product document, stitched from its `ProductDocument` row + `Media`. */
export interface ProductDocumentView {
  id: string;
  type: ProductDocument['type'];
  title: string;
  url: string;
  sizeKb: number;
  locale: string;
  updatedAt: string;
}

/** One icon card in the product highlight strip. */
export interface ProductHighlightView {
  icon: string;
  value: string;
  label: string;
}

/** A labelled point on the 3D model — `position` is the viewer's `[x, y, z]`. */
export interface ProductModel3dHotspotView {
  id: string;
  label: string;
  description: string | null;
  position: [number, number, number];
}

/** An answered (or still open) customer question as the storefront shows it. */
export interface ProductQuestionView {
  id: string;
  question: string;
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
}

/**
 * Documents need their `Media` row for `url`/`size`; a document whose media row
 * is missing (deleted file) is dropped rather than returned with a broken URL.
 */
export function toDocumentViews(docs: ProductDocument[], media: Media[]): ProductDocumentView[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return docs.flatMap((d) => {
    const m = byId.get(d.mediaId);
    if (!m) return [];
    return [
      {
        id: d.id,
        type: d.type,
        title: d.title,
        url: m.url,
        sizeKb: Math.max(1, Math.round(m.size / 1024)),
        locale: d.locale,
        updatedAt: d.updatedAt.toISOString(),
      },
    ];
  });
}

export function toHighlightViews(product: Pick<Product, 'highlights'>): ProductHighlightView[] {
  return (product.highlights ?? []).map((h) => ({ icon: h.icon, value: h.value, label: h.label }));
}

export function toModel3dHotspotViews(
  product: Pick<Product, 'model3dHotspots'>,
): ProductModel3dHotspotView[] {
  return (product.model3dHotspots ?? []).map((h) => ({
    id: h.key,
    label: h.label,
    description: h.description ?? null,
    position: [h.x, h.y, h.z],
  }));
}

export function toQuestionViews(rows: QuestionPublicRow[]): ProductQuestionView[] {
  return rows.map((q) => ({
    id: q.id,
    question: q.question,
    answer: q.answer,
    askedAt: q.createdAt.toISOString(),
    answeredAt: q.answeredAt?.toISOString() ?? null,
  }));
}
