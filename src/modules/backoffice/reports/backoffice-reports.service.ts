import { Injectable } from '@nestjs/common';
import { AdminActionLogRepository } from '../../admin-log/repositories/admin-action-log.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { OrderRepository } from '../../orders/repositories/order.repository';

@Injectable()
export class BackofficeReportsService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly variants: ProductVariantRepository,
    private readonly logs: AdminActionLogRepository,
  ) {}

  sales(from: Date, to: Date) {
    return this.orders.salesSummary(from, to);
  }

  async lowStock(threshold: number, skip: number, take: number) {
    const [rows, total] = await this.variants.lowStock(threshold, skip, take);
    return {
      threshold,
      items: rows.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        stockQty: v.stockQty,
        productTitle: v.product.title,
        productSlug: v.product.slug,
      })),
      total,
      skip,
      take,
    };
  }

  async adminLogs(query: { skip: number; take: number; userId?: string }) {
    const [rows, total] = await this.logs.paginate(
      query.userId ? { userId: query.userId } : {},
      query.skip,
      query.take,
    );
    return {
      items: rows.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        ip: l.ip,
        user: { name: l.user.fullName, mobile: l.user.mobile },
        at: l.createdAt,
      })),
      total,
      skip: query.skip,
      take: query.take,
    };
  }
}
