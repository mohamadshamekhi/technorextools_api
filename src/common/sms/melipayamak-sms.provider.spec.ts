import { MelipayamakSmsProvider } from './melipayamak-sms.provider';

describe('MelipayamakSmsProvider', () => {
  const options = {
    username: 'u',
    password: 'p',
    otpPatternId: '42',
  };
  const provider = new MelipayamakSmsProvider(options);
  let fetchMock: jest.SpyInstance;

  afterEach(() => fetchMock?.mockRestore());

  it('posts the code to the pattern endpoint', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ RetStatus: 1, Value: '123' }),
    } as Response);

    await provider.sendOtp('09120000000', '55555');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('bodyId')).toBe('42');
    expect(body.get('to')).toBe('09120000000');
    expect(body.get('text')).toBe('55555');
  });

  it('throws when RetStatus is not 1', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ RetStatus: 0, StrRetStatus: 'error' }),
    } as Response);

    await expect(provider.sendOtp('09120000000', '55555')).rejects.toThrow(
      /rejected/,
    );
  });
});
