import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { UserRepository } from '../access/repositories/user.repository';

/** Only `updateProfile` is exercised here — it needs just the user repository. */
function make(over: Partial<Record<string, jest.Mock>> = {}) {
  const users = {
    findByIdWithRole:
      over.findByIdWithRole ??
      jest.fn().mockResolvedValue({ id: 'u1', isActive: true, email: 'old@x.com', role: { id: 'r', slug: 'customer', title: 'c' } }),
    findByEmail: over.findByEmail ?? jest.fn().mockResolvedValue(null),
    update: over.update ?? jest.fn((id, data) => Promise.resolve({ id, isActive: true, ...data, role: { id: 'r', slug: 'customer', title: 'c' } })),
  } as unknown as UserRepository;
  const service = new AuthService(
    users,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, users };
}

describe('AuthService.updateProfile', () => {
  it('rejects an email already taken by another user', async () => {
    const { service } = make({ findByEmail: jest.fn().mockResolvedValue({ id: 'u2' }) });
    await expect(service.updateProfile('u1', { email: 'taken@x.com' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows keeping the same email (no clash lookup mismatch)', async () => {
    const { service, users } = make({ findByEmail: jest.fn().mockResolvedValue({ id: 'u1' }) });
    await service.updateProfile('u1', { email: 'old@x.com' });
    expect(users.update).toHaveBeenCalled();
  });

  it('lets a new user set an unused email', async () => {
    const { service, users } = make();
    await service.updateProfile('u1', { email: 'fresh@x.com' });
    expect(users.update).toHaveBeenCalledWith('u1', { email: 'fresh@x.com' });
  });

  it('401s for an inactive account', async () => {
    const { service } = make({ findByIdWithRole: jest.fn().mockResolvedValue(null) });
    await expect(service.updateProfile('u1', { fullName: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
