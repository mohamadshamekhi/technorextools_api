import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema';
import { AccessService } from '../access/access.service';
import { tokenPayloadSchema, type AuthenticatedUser } from './token.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly access: AccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /** Runs after signature + expiry pass. Resolves the live user + permission set. */
  async validate(payload: unknown): Promise<AuthenticatedUser> {
    const parsed = tokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('توکن نامعتبر است');
    }
    const actor = await this.access.resolveActor(parsed.data.sub);
    if (!actor) {
      throw new UnauthorizedException('حساب کاربری در دسترس نیست');
    }
    return {
      id: actor.id,
      mobile: actor.mobile,
      roleId: actor.roleId,
      roleSlug: actor.roleSlug,
      isSuperadmin: actor.isSuperadmin,
      permissions: [...actor.permissions],
    };
  }
}
