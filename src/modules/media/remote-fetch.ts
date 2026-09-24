import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { UploadedFile } from './media.service';

/** How many redirects a remote fetch will follow before giving up. */
const MAX_REDIRECTS = 3;

/** Wall-clock budget for a single remote fetch. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * SSRF guard — anything that resolves inside the infrastructure is refused.
 * Covers loopback, link-local (incl. the cloud metadata endpoint 169.254.169.254),
 * RFC1918, CGNAT, and the IPv6 equivalents.
 */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const ip6 = ip.toLowerCase();
    if (ip6 === '::' || ip6 === '::1') return true;
    if (ip6.startsWith('fe80') || ip6.startsWith('fc') || ip6.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded v4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip6);
    if (mapped?.[1]) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('آدرس فایل باید http یا https باشد');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new BadRequestException('آدرس فایل مجاز نیست');
  }
}

function nameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const clean = last.replace(/[^\w.-]/g, '').slice(0, 120);
  return clean || 'remote-file';
}

/**
 * Download a public URL into memory so it can be handed to `MediaService.upload`
 * as if it had been posted by a client. Redirects are followed by hand so every
 * hop is re-checked against the SSRF guard.
 */
export async function fetchRemoteFile(rawUrl: string, maxBytes: number): Promise<UploadedFile> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('آدرس فایل نامعتبر است');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicHost(url);
      res = await fetch(url, { redirect: 'manual', signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) break;
        url = new URL(location, url);
        continue;
      }
      break;
    }
    if (!res || !res.ok) {
      throw new BadRequestException('دریافت فایل از آدرس داده‌شده ناموفق بود');
    }

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > maxBytes) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
      throw new BadRequestException('فایل دریافتی خالی است');
    }
    if (buffer.length > maxBytes) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است');
    }

    const mimetype = (res.headers.get('content-type') ?? 'application/octet-stream')
      .split(';')[0]!
      .trim();
    return { buffer, mimetype, size: buffer.length, originalname: nameFromUrl(url) };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('دریافت فایل از آدرس داده‌شده ناموفق بود');
  } finally {
    clearTimeout(timer);
  }
}
