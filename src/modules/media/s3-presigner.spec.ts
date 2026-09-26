import { presignPut, type S3Config } from './s3-presigner';

const config: S3Config = {
  endpoint: 'https://s3.example.com',
  region: 'ir-thr-at1',
  bucket: 'assets',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  publicBaseUrl: 'https://cdn.example.com',
};

describe('presignPut', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00Z')));
  afterAll(() => jest.useRealTimers());

  it('builds a path-style URL with all SigV4 query params', () => {
    const url = new URL(presignPut(config, 'products/2026/09/abc.webp'));
    expect(url.host).toBe('s3.example.com');
    expect(url.pathname).toBe('/assets/products/2026/09/abc.webp');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'AKIDEXAMPLE/20260909/ir-thr-at1/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same inputs and clock', () => {
    expect(presignPut(config, 'a/b.png')).toBe(presignPut(config, 'a/b.png'));
  });

  it('signs x-amz-acl when an ACL is requested', () => {
    const url = new URL(presignPut(config, 'a/b.png', 900, { acl: 'public-read' }));
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host;x-amz-acl');
    expect(url.searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(presignPut(config, 'a/b.png')).searchParams.get('X-Amz-Signature'),
    );
  });
});
