import { z } from 'zod';

/**
 * Access-token payload. Small and stable — clients (incl. the storefront edge
 * middleware) decode exactly these claims plus `exp`. Permissions are NOT in the
 * token; they are resolved per-request from the DB so a revoked permission takes
 * effect immediately.
 */
export const tokenPayloadSchema = z.object({
  sub: z.string(), // user id
  mobile: z.string(),
  role: z.string(), // role slug
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

/** Attached to `request.user` by `JwtStrategy.validate`. */
export interface AuthenticatedUser {
  id: string;
  mobile: string;
  roleId: string;
  roleSlug: string;
  isSuperadmin: boolean;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
}
