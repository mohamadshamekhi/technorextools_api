import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Run the JWT guard but do not reject when the token is missing or invalid —
 * `request.user` is populated when a valid Bearer token is present, otherwise
 * left undefined. Used by routes that serve both guests and signed-in users
 * (e.g. the cart).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
