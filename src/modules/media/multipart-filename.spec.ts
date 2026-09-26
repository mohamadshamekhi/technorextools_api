import { decodeMultipartFilename } from './multipart-filename';

describe('decodeMultipartFilename', () => {
  it('recovers a UTF-8 name that busboy decoded as latin-1', () => {
    const real = 'پیستوله-بادی.jpg';
    const mojibake = Buffer.from(real, 'utf8').toString('latin1');
    expect(mojibake).not.toBe(real);
    expect(decodeMultipartFilename(mojibake)).toBe(real);
  });

  it('leaves an ASCII name alone', () => {
    expect(decodeMultipartFilename('invoice_2026.pdf')).toBe('invoice_2026.pdf');
  });

  it('leaves an already-correct Persian name alone', () => {
    expect(decodeMultipartFilename('فاکتور.pdf')).toBe('فاکتور.pdf');
  });

  it('leaves a genuine latin-1 name alone', () => {
    // «café.png» in latin-1 is not valid UTF-8, so it must not be re-decoded.
    const latin1 = Buffer.from('café.png', 'latin1').toString('latin1');
    expect(decodeMultipartFilename(latin1)).toBe(latin1);
  });

  it('handles an empty name', () => {
    expect(decodeMultipartFilename('')).toBe('');
  });
});
