import { MelipayamakSmsProvider } from './melipayamak-sms.provider';

describe('MelipayamakSmsProvider', () => {
  const options = {
    username: 'u',
    password: 'p',
    otpPatternId: '42',
    templatePatternIds: { order_paid: '100' },
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

    await expect(provider.sendOtp('09120000000', '55555')).rejects.toThrow(/rejected/);
  });

  it('sends a transactional template through its configured bodyId', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ RetStatus: 1 }),
    } as Response);

    await provider.sendTemplate('09120000000', 'order_paid', ['AB-1']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('bodyId')).toBe('100');
    expect(body.get('text')).toBe('AB-1');
  });

  it('does not call the API for a template with no configured bodyId', async () => {
    fetchMock = jest.spyOn(global, 'fetch');
    await provider.sendTemplate('09120000000', 'abandoned_cart', []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the console apikey JSON endpoint when an apiKey is configured', async () => {
    const keyed = new MelipayamakSmsProvider({
      apiKey: 'API-XYZ',
      otpPatternId: '42',
      templatePatternIds: { order_status: '200' },
    });
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ recId: 123456789012345, status: 'ارسال موفق بود' }),
    } as Response);

    await keyed.sendTemplate('09120000000', 'order_status', ['AB-1', 'ارسال‌شده']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://console.melipayamak.com/api/send/shared/API-XYZ');
    expect(JSON.parse(init.body as string)).toEqual({
      bodyId: 200,
      to: '09120000000',
      args: ['AB-1', 'ارسال‌شده'],
    });
  });

  it('throws when the apikey endpoint returns recId 0', async () => {
    const keyed = new MelipayamakSmsProvider({
      apiKey: 'API-XYZ',
      otpPatternId: '42',
      templatePatternIds: { order_paid: '100' },
    });
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ recId: 0, status: 'الگو تایید نشده' }),
    } as Response);
    await expect(keyed.sendTemplate('09120000000', 'order_paid', ['AB-1'])).rejects.toThrow(
      /rejected/,
    );
  });
});
