/** Formatting helpers for accounting exports and report buckets (Iran: Asia/Tehran, Jalali). */

const TZ = 'Asia/Tehran';

const jalaliParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const pad2 = (n: string): string => n.padStart(2, '0');

/** `{ y, m, d }` of the Jalali calendar day `date` falls on in Tehran. */
export function jalaliYmd(date: Date): { y: string; m: string; d: string } {
  const parts = jalaliParts.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === t)?.value ?? '';
  return { y: get('year'), m: pad2(get('month')), d: pad2(get('day')) };
}

/** `1404/08/23` */
export function jalaliDate(date: Date): string {
  const { y, m, d } = jalaliYmd(date);
  return `${y}/${m}/${d}`;
}

/** `1404/08` */
export function jalaliMonth(date: Date): string {
  const { y, m } = jalaliYmd(date);
  return `${y}/${m}`;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof value === 'string' ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV text with a UTF-8 BOM so Excel opens Persian text correctly. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
