import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

/** @param {string} secret */
export function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase().replaceAll('=', '')]
    .map((char) => {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new Error('Ungültiger TOTP-Testschlüssel.');
      return index.toString(2).padStart(5, '0');
    })
    .join('');
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8)
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    '0',
  );
}
