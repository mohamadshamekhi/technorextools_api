import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
    create: overrides.create ?? jest.fn().mockResolvedValue({ id: 'ch1' }),
    delete: overrides.delete ?? jest.fn().mockResolvedValue(undefined),
    incrementAttempts: overrides.incrementAttempts ?? jest.fn().mockResolvedValue({}),
    consume: overrides.consume ?? jest.fn().mockResolvedValue({}),
  } as unknown as OtpChallengeRepository;
  const sms = {
    sendOtp: overrides.sendOtp ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as SmsService;
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

describe('OtpService.request — SMS failure', () => {
  const failing = () =>
    make({
      sendOtp: jest.fn().mockRejectedValue(new Error('MelliPayamak responded 400: bad bodyId')),
    });

  it('answers 503 with a Persian message instead of leaking a 500', async () => {
    const { service } = failing();
    await expect(service.request('+989120000000')).rejects.toMatchObject({
      status: 503,
      message: 'ارسال پیامک ناموفق بود. لطفاً دوباره تلاش کنید.',
    });
  });

  it('is a ServiceUnavailableException, so the filter keeps the provider detail out', async () => {
    const { service } = failing();
    await expect(service.request('+989120000000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("deletes the challenge so the caller's cooldown and hourly quota aren't burned", async () => {
    const { service, challenges } = failing();
    await expect(service.request('+989120000000')).rejects.toBeTruthy();
    expect(challenges.delete).toHaveBeenCalledWith('ch1');
  });

  it('still fails cleanly when the rollback itself fails', async () => {
    const { service } = make({
      sendOtp: jest.fn().mockRejectedValue(new Error('boom')),
      delete: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.request('+989120000000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('keeps the challenge when the send succeeds', async () => {
    const { service, challenges } = make();
    await service.request('+989120000000');
    expect(challenges.delete).not.toHaveBeenCalled();
  });
});
