import { ConflictException, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ originalUrl: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('passes an HttpException through with its status', () => {
    const { host, status, json } = mockHost();
    filter.catch(new ConflictException('nope'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 409, message: 'nope', path: '/x' });
  });

  it('maps a Prisma P2002 to 409', () => {
    const { host, status } = mockHost();
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(409);
  });

  it('maps a Prisma P2025 to 404', () => {
    const { host, status } = mockHost();
    const err = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('maps a Prisma connection failure (P2010) to 503', () => {
    const { host, status } = mockHost();
    const err = new Prisma.PrismaClientKnownRequestError('Raw query failed', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: 'unknown', message: 'Kind: Server selection timeout: No available servers' },
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('falls back to 500 without leaking detail', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('secret internals'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).toBe('خطای داخلی سرور');
  });

  it('treats a malformed-JSON SyntaxError as 400', () => {
    const { host, status } = mockHost();
    const err = Object.assign(new SyntaxError('Unexpected token'), { status: 400 });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(400);
  });
});
