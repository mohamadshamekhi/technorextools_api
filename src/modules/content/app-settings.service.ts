import { Injectable } from '@nestjs/common';
import { SiteSettingRepository } from './repositories/site-setting.repository';

/** Documented `site_settings` keys with their fallback when the row is absent. */
export const SETTING_DEFAULTS = {
  stock_hold_minutes: 10,
  loyalty_points_per_toman: 0.001,
  loyalty_redeem_max_percent: 50,
  referral_reward_points: 5000,
  abandoned_cart_hours: 24,
  site_title: 'فروشگاه ابزار',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/**
 * Typed reader over `SiteSettingRepository`. Business logic asks for a key and
 * gets the stored value coerced to the default's type, or the default itself.
 */
@Injectable()
export class AppSettingsService {
  constructor(private readonly settings: SiteSettingRepository) {}

  async getNumber(key: SettingKey): Promise<number> {
    const fallback = SETTING_DEFAULTS[key];
    const rows = await this.settings.findByKeys([key]);
    const raw = rows[0]?.value;
    if (raw === undefined) return fallback as number;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : (fallback as number);
  }

  async getString(key: SettingKey): Promise<string> {
    const rows = await this.settings.findByKeys([key]);
    return rows[0]?.value ?? String(SETTING_DEFAULTS[key]);
  }
}
