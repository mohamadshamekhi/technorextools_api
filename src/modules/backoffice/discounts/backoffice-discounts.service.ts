import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DiscountRepository,
  type DiscountWithTargets,
} from '../../discounts/repositories/discount.repository';
import { DiscountUsageRepository } from '../../discounts/repositories/discount-usage.repository';
import { NotificationRepository } from '../../notifications/repositories/notification.repository';
import type {
  CreateDiscountInput,
  ListDiscountsQuery,
  UpdateDiscountInput,
} from './backoffice-discounts.schemas';

type DiscountCore = Omit<CreateDiscountInput, 'targets'>;

function toView(d: DiscountWithTargets) {
  return {
    id: d.id,
    code: d.code,
    kind: d.kind,
    amountType: d.amountType,
    value: d.value,
    maxUsageTotal: d.maxUsageTotal,
    maxUsagePerUser: d.maxUsagePerUser,
    minOrderAmount: d.minOrderAmount,
    usedCount: d.usedCount,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    isActive: d.isActive,
    targets: d.targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })),
  };
}

@Injectable()
export class BackofficeDiscountsService {
  constructor(
    private readonly discounts: DiscountRepository,
    private readonly usages: DiscountUsageRepository,
    private readonly notifications: NotificationRepository,
  ) {}

  async list(query: ListDiscountsQuery) {
    const where: Prisma.DiscountWhereInput =
      query.isActive === undefined ? {} : { isActive: query.isActive };
    const [rows, total] = await this.discounts.paginate(where, query.skip, query.take);
    return { items: rows.map(toView), total, skip: query.skip, take: query.take };
  }

  async getById(id: string) {
    const d = await this.discounts.findById(id);
    if (!d) throw new NotFoundException('کد تخفیف یافت نشد');
    return toView(d);
  }

  async listUsages(id: string) {
    await this.getById(id);
    return this.usages.listByDiscount(id);
  }

  async create(input: CreateDiscountInput) {
    const existing = await this.discounts.findByCode(input.code);
    if (existing) throw new BadRequestException('این کد تخفیف قبلاً تعریف شده است');
    const { targets, ...core } = input;
    const created = await this.discounts.create(
      {
        code: core.code,
        kind: core.kind,
        amountType: core.amountType,
        value: core.value,
        maxUsageTotal: core.maxUsageTotal,
        maxUsagePerUser: core.maxUsagePerUser,
        minOrderAmount: core.minOrderAmount,
        startsAt: core.startsAt,
        endsAt: core.endsAt,
        isActive: core.isActive,
      },
      targets,
    );
    await this.notifyTargetedUsers(created, []);
    return toView(created);
  }

  async update(id: string, input: UpdateDiscountInput) {
    const before = await this.getById(id);
    const { targets, ...core } = input;
    const updated = await this.discounts.update(id, this.toData(core), targets);
    await this.notifyTargetedUsers(updated, userTargetIds(before.targets));
    return toView(updated);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.discounts.delete(id);
  }

  /** In-app `discount` notification to users newly targeted by an active code. */
  private async notifyTargetedUsers(
    d: DiscountWithTargets,
    alreadyNotified: string[],
  ): Promise<void> {
    if (!d.isActive) return;
    const skip = new Set(alreadyNotified);
    const userIds = userTargetIds(d.targets).filter((id) => !skip.has(id));
    const value =
      d.amountType === 'percent' ? `${d.value}٪` : `${d.value.toLocaleString('fa-IR')} تومان`;
    await this.notifications.createForUsers(userIds, {
      type: 'discount',
      title: 'کد تخفیف ویژه شما',
      body: `کد ${d.code} با ${value} تخفیف برای شما فعال شد.`,
    });
  }

  private toData(core: Partial<DiscountCore>): Prisma.DiscountUpdateInput {
    return {
      ...(core.code !== undefined ? { code: core.code } : {}),
      ...(core.kind !== undefined ? { kind: core.kind } : {}),
      ...(core.amountType !== undefined ? { amountType: core.amountType } : {}),
      ...(core.value !== undefined ? { value: core.value } : {}),
      ...(core.maxUsageTotal !== undefined ? { maxUsageTotal: core.maxUsageTotal } : {}),
      ...(core.maxUsagePerUser !== undefined ? { maxUsagePerUser: core.maxUsagePerUser } : {}),
      ...(core.minOrderAmount !== undefined ? { minOrderAmount: core.minOrderAmount } : {}),
      ...(core.startsAt !== undefined ? { startsAt: core.startsAt } : {}),
      ...(core.endsAt !== undefined ? { endsAt: core.endsAt } : {}),
      ...(core.isActive !== undefined ? { isActive: core.isActive } : {}),
    };
  }
}

function userTargetIds(targets: Array<{ targetType: string; targetId: string }>): string[] {
  return targets.filter((t) => t.targetType === 'user').map((t) => t.targetId);
}
