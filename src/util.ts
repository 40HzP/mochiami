const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** URL に使える英数字のランダム文字列（偏りなし） */
export function randomId(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      const i = b & 63;
      if (i < ALPHABET.length) out += ALPHABET[i];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * ユーザー入力の文字列を整える。制御文字を除き、前後の空白を削り、長さを制限する。
 * multiline でなければ改行も空白にする。
 */
export function cleanText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC');
  s = multiline ? s.replace(/\r\n?/g, '\n') : s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(
    /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g,
    '',
  );
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return [...s].slice(0, max).join('').trim();
}
