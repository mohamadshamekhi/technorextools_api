import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Env } from '../../config/env.schema';
import { RoleRepository } from '../access/repositories/role.repository';
import { UserRepository, type UserWithRole } from '../access/repositories/user.repository';
import { CUSTOMER_ROLE_SLUG } from '../access/permission.catalog';
import { StorefrontCartService } from '../storefront/cart/storefront-cart.service';
import { OtpService, type OtpRequestResult } from './otp.service';
import { ReferralRepository } from '../referral/repositories/referral.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { generateReferralCode } from './referral-code.util';
import { normalizeMobile } from './mobile.util';
import type { OtpRequestInput, OtpVerifyInput } from './auth.schemas';

export interface UserView {
  id: string;
  fullName: string | null;
  mobile: string;
  email: string | null;
  role: string;
  referralCode: string;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  isNewUser: boolean;
  user: UserView;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly referrals: ReferralRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly otp: OtpService,
    private readonly cart: StorefrontCartService,
  ) {}

  requestOtp(input: OtpRequestInput): Promise<OtpRequestResult> {
    return this.otp.request(normalizeMobile(input.mobile), input.referralCode);
  }

  async verifyOtp(input: OtpVerifyInput): Promise<AuthResult> {
    const mobile = normalizeMobile(input.mobile);
    const { referralCode } = await this.otp.verify(mobile, input.code);

    const existing = await this.users.findByMobile(mobile);
    const { user, isNewUser } = existing
      ? { user: existing, isNewUser: false }
      : { user: await this.createCustomer(mobile, referralCode ?? undefined), isNewUser: true };

    if (!user.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    await this.users.touchLastLogin(user.id);

    if (input.cartToken) {
      await this.cart
        .mergeGuestCartIntoUser(user.id, input.cartToken)
        .catch((e: unknown) => this.logger.warn(`cart merge failed: ${String(e)}`));
    }

    return { ...(await this.issueTokens(user)), isNewUser, user: toView(user) };
  }

  async refresh(rawToken: string): Promise<Omit<AuthResult, 'isNewUser'>> {
    const record = await this.refreshTokens.findByHash(sha256(rawToken));
    if (!record || record.expiresAt < new Date() || !record.user.isActive) {
      throw new UnauthorizedException('نشست نامعتبر است');
    }
    // Reuse of an already-rotated token → likely theft: revoke the whole family.
    if (record.revokedAt) {
      await this.refreshTokens.revokeAllForUser(record.userId);
      this.logger.warn(`refresh-token reuse detected for user ${record.userId} — family revoked`);
      throw new UnauthorizedException('نشست نامعتبر است');
    }
    await this.refreshTokens.revoke(record.id);
    const { user } = record;
    return { ...(await this.issueTokens(user)), user: toView(user) };
  }

  async logout(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  async getProfile(userId: string): Promise<UserView> {
    const user = await this.users.findByIdWithRole(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }
    return toView(user);
  }

  /** Self-service profile edit — name and email only (mobile/role are immutable here). */
  async updateProfile(
    userId: string,
    patch: { fullName?: string; email?: string | null },
  ): Promise<UserView> {
    const user = await this.users.findByIdWithRole(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }
    if (patch.email && patch.email !== user.email) {
      const clash = await this.users.findByEmail(patch.email);
      if (clash && clash.id !== userId) {
        throw new ConflictException('این ایمیل قبلاً ثبت شده است');
      }
    }
    const updated = await this.users.update(userId, {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
    });
    return toView(updated);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async createCustomer(mobile: string, referralCode?: string): Promise<UserWithRole> {
    const role = await this.roles.findBySlug(CUSTOMER_ROLE_SLUG);
    if (!role) {
      throw new Error('customer role missing — run `pnpm prisma:seed`');
    }

    let created: UserWithRole | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await this.users.create({
          mobile,
          referralCode: generateReferralCode(),
          role: { connect: { id: role.id } },
        });
      } catch (err) {
        // Retry ONLY on a referralCode uniqueness collision — anything else
        // (and the final attempt) propagates so the request fails honestly.
        const target = (err as { meta?: { target?: unknown } })?.meta?.target;
        const targetText = Array.isArray(target)
          ? target.join(',')
          : typeof target === 'string'
            ? target
            : '';
        const isReferralClash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          targetText.includes('referralCode');
        if (attempt === 4 || !isReferralClash) throw err;
      }
    }

    if (created && referralCode) {
      await this.linkReferral(created.id, referralCode).catch((e: unknown) =>
        this.logger.warn(`referral link failed: ${String(e)}`),
      );
    }
    return created as UserWithRole;
  }

  private async linkReferral(newUserId: string, referralCode: string): Promise<void> {
    const referrer = await this.users.findByReferralCode(referralCode);
    if (!referrer || referrer.id === newUserId) {
      return;
    }
    await this.referrals.create({ referrerUserId: referrer.id, referredUserId: newUserId });
  }

  private async issueTokens(user: UserWithRole): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
  }> {
    const expiresIn = durationToSeconds(this.config.get('JWT_ACCESS_TTL', { infer: true }), 900);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, mobile: user.mobile, role: user.role.slug },
      { expiresIn },
    );

    const rawRefresh = randomBytes(48).toString('base64url');
    const refreshSeconds = durationToSeconds(
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
      30 * 24 * 60 * 60,
    );
    await this.refreshTokens.create({
      tokenHash: sha256(rawRefresh),
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshSeconds * 1000),
    });

    return { accessToken, expiresIn, refreshToken: rawRefresh };
  }
}

function toView(user: UserWithRole): UserView {
  return {
    id: user.id,
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role.slug,
    referralCode: user.referralCode,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Parse `15m` / `2h` / `30d` / `45s` into seconds; fall back on a bad value. */
function durationToSeconds(ttl: string, fallback: number): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  const factor = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return value * factor;
}
