import { expect, it } from 'vitest';
import { parseBlocklistTerm, blocklistSearchPattern } from './blocklist';

it('normalizes multilingual terms and validates server-side limits', () => {
  expect(parseBlocklistTerm('  Cafe\u0301  ')).toBe('Café');
  expect(parseBlocklistTerm('你好')).toBe('你好');
  expect(parseBlocklistTerm('مرحبا')).toBe('مرحبا');
  expect(parseBlocklistTerm('😀'.repeat(120))).not.toBeNull();
  for (const value of [
    null,
    '',
    '  ',
    'x'.repeat(121),
    '😀'.repeat(121),
    'a\0b',
    new File(['x'], 'x'),
  ]) {
    expect(parseBlocklistTerm(value)).toBeNull();
  }
});

it('searches wildcard and regex characters literally', () => {
  for (const value of [
    'abc',
    '100%_',
    '你好',
    'a*b',
    '[test]',
    '(?i)',
    '^x$',
    'a.b',
    'a+b',
    '{2}',
    'a|b',
    String.raw`a\b`,
  ]) {
    const pattern = blocklistSearchPattern(value);
    expect(new RegExp(pattern, 'u').test(value)).toBe(true);
  }
  expect(blocklistSearchPattern('a*b')).toBe(String.raw`a\*b`);
  expect(blocklistSearchPattern('100%_')).toBe('100%_');
  expect(new RegExp(blocklistSearchPattern('a.b'), 'u').test('axb')).toBe(
    false,
  );
});
