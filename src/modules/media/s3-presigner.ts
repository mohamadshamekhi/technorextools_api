import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  endpoint: string; // e.g. https://s3.ir-thr-at1.arvanstorage.ir
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
/** RFC-3986 encode, keeping the path separators (S3 object keys may contain `/`). */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/**
 * Build a SigV4 query-signed URL for a single `PUT` upload (path-style),
 * dependency-free. The client uploads the file body directly to this URL with
 * the same `Content-Type`.
 *
 * When `opts.acl` is set, `x-amz-acl` is a signed header — the client MUST send
 * it verbatim on the PUT (e.g. `x-amz-acl: public-read`) or the upload is
 * rejected with a signature mismatch.
 */
export function presignPut(
  config: S3Config,
  key: string,
  expiresSeconds = 900,
  opts: { acl?: string } = {},
): string {
  return presign('PUT', config, key, expiresSeconds, opts);
}

/** SigV4 query-signed URL for a single `DELETE` (path-style), dependency-free. */
export function presignDelete(config: S3Config, key: string, expiresSeconds = 300): string {
  return presign('DELETE', config, key, expiresSeconds);
}

function presign(
  method: 'PUT' | 'DELETE',
  config: S3Config,
  key: string,
  expiresSeconds: number,
  opts: { acl?: string } = {},
): string {
  const url = new URL(config.endpoint);
  const host = url.host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`;

  // Signed headers, kept sorted: `host` always, `x-amz-acl` when an ACL is set.
  const signedHeaders = opts.acl ? 'host;x-amz-acl' : 'host';

  const query: Record<string, string> = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] as string)}`)
    .join('&');

  const canonicalHeaders = opts.acl
    ? `host:${host}\nx-amz-acl:${opts.acl}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), SERVICE),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  // Only `host` is signed, so the client may send any `Content-Type` with the PUT.
  return `${url.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
