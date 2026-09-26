/**
 * `multipart/form-data` filenames arrive as raw bytes. Busboy (under multer)
 * decodes them as latin-1 unless the part declares a charset, so a UTF-8 name
 * like «پیستوله-بادی.jpg» reaches us as mojibake («Ù¾ÛØ³ØªÙÙÙ-…»).
 *
 * Re-reading those code units as bytes and decoding them as UTF-8 recovers the
 * original name. The round-trip check makes it safe to call unconditionally: a
 * name that was already correct (pure ASCII, or a real UTF-8 string with code
 * points above 0xFF) fails the check and is returned untouched.
 */
export function decodeMultipartFilename(name: string): string {
  if (!name) return name;
  // Anything outside latin-1 can't be a mis-decoded byte string.
  for (let i = 0; i < name.length; i += 1) {
    if (name.charCodeAt(i) > 0xff) return name;
  }
  const bytes = Buffer.from(name, 'latin1');
  const decoded = bytes.toString('utf8');
  // Only accept it when the bytes really were valid UTF-8 (no replacement chars).
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : name;
}
