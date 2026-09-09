import { HttpException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { OtpService } from './otp.service';
import type { OtpChallengeRepository } from './repositories/otp-challenge.repository';
import type { SmsService } from '../../common/sms/sms.service';

const config = {
  get: (k: string) =>
    (
      ({
        OTP_TTL_SECONDS: 120,
        OTP_RESEND_SECONDS: 60,
        OTP_MAX_PER_HOUR: 5,
        OTP_MAX_ATTEMPTS: 5,
        OTP_DEV_ECHO: false,
      }) as Record<string, unknown>
    )[k],
};

function make(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const challenges = {
    countSince: overrides.countSince ?? jest.fn().mockResolvedValue(0),
    findActive: overrides.findActive ?? jest.fn().mockResolvedValue(null),
    findLatestUnconsumed: overrides.findLatestUnconsumed ?? jest.fn().mockResolvedValue(null),
    invalidateActive: overrides.invalidateActive ?? jest.fn().mockResolvedValue(undefined),
    create: overrides.create ?? jest.fn().mockResolvedValue({}),
    incrementAttempts: overrides.incrementAttempts ?? jest.fn().mockResolvedValue({}),
    consume: overrides.consume ?? jest.fn().mockResolvedValue({}),
  } as unknown as OtpChallengeRepository;
  const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) } as unknown as SmsService;
  return {
    service: new OtpService(challenges, sms, config as never),
    challenges,
    sms,
  };
}

describe('OtpService', () => {
  it('rejects when the hourly cap is reached', async () => {
    const { service } = make({ countSince: jest.fn().mockResolvedValue(5) });
    await expect(service.request('+989120000000')).rejects.toBeInstanceOf(HttpException);
  });

  it('blocks a resend inside the cooldown window', async () => {
    const { service } = make({
      countSince: jest.fn().mockResolvedValue(1),
      findActive: jest.fn().mockResolvedValue({
        lastSentAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });
    await expect(service.request('+989120000000')).rejects.toBeInstanceOf(HttpException);
  });

  it('sends a code on a clean request', async () => {
    const { service, sms } = make();
    const res = await service.request('+989120000000');
    expect(res.expiresIn).toBe(120);
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('fails verify when no challenge exists', async () => {
    const { service } = make();
    await expect(service.verify('+989120000000', '12345')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a wrong code and increments attempts', async () => {
    const incrementAttempts = jest.fn().mockResolvedValue({});
    const { service } = make({
      findLatestUnconsumed: jest.fn().mockResolvedValue({
        id: 'c1',
        codeHash: await argon2.hash('11111'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
        referralCode: null,
      }),
      incrementAttempts,
    });
    await expect(service.verify('+989120000000', '99999')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(incrementAttempts).toHaveBeenCalledWith('c1');
  });

  it('consumes the challenge on the right code', async () => {
    const consume = jest.fn().mockResolvedValue({});
    const { service } = make({
      findLatestUnconsumed: jest.fn().mockResolvedValue({
        id: 'c1',
        codeHash: await argon2.hash('24680'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
        referralCode: 'ABCD1234',
      }),
      consume,
    });
    await expect(service.verify('+989120000000', '24680')).resolves.toEqual({
      referralCode: 'ABCD1234',
    });
    expect(consume).toHaveBeenCalledWith('c1');
  });
});
