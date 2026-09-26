import { Global, Module } from '@nestjs/common';
import { ReferralRepository } from './repositories/referral.repository';

/**
 * Referral domain core — the `referrals` repository. The link is created at
 * signup (AuthService); the reward (points on the referred user's first paid
 * order) is granted by the order lifecycle. @Global so both can inject it.
 */
@Global()
@Module({
  providers: [ReferralRepository],
  exports: [ReferralRepository],
})
export class ReferralModule {}
