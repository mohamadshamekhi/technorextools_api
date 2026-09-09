import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../access/repositories/user.repository';
import { LoyaltyService } from '../../loyalty/loyalty.service';

@Injectable()
export class BackofficeLoyaltyService {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly users: UserRepository,
  ) {}

  private async assertUser(userId: string): Promise<void> {
    if (!(await this.users.findById(userId))) throw new NotFoundException('کاربر یافت نشد');
  }

  async summary(userId: string, skip: number, take: number) {
    await this.assertUser(userId);
    const [balance, [rows, total]] = await Promise.all([
      this.loyalty.balance(userId),
      this.loyalty.history(userId, skip, take),
    ]);
    return { balance, transactions: { items: rows, total, skip, take } };
  }

  async adjust(userId: string, points: number, note: string) {
    await this.assertUser(userId);
    await this.loyalty.adjust(userId, points, note);
    return { balance: await this.loyalty.balance(userId) };
  }
}
