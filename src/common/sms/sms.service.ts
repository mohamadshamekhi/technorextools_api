/**
 * Provider-agnostic SMS port. The blueprint leaves the concrete provider
 * (Kavenegar, MelliPayamak, …) undecided, so code depends only on this.
 */
export abstract class SmsService {
  abstract send(mobile: string, message: string): Promise<void>;

  /** OTP is common enough to have its own method; providers may use a template. */
  sendOtp(mobile: string, code: string): Promise<void> {
    return this.send(mobile, `کد ورود شما: ${code}`);
  }
}
