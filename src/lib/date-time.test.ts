import { describe, expect, it } from 'vitest';
import { berlinDateTimeToIso, formatBerlinDateTimeLocal } from './date-time';

describe('berlinDateTimeToIso', () => {
  it.each([
    ['2026-03-29T01:30', '2026-03-29T00:30:00.000Z'],
    ['2026-03-29T03:30', '2026-03-29T01:30:00.000Z'],
    ['2026-10-25T01:30', '2026-10-24T23:30:00.000Z'],
    ['2026-10-25T02:30', '2026-10-25T01:30:00.000Z'],
    ['2026-10-25T03:30', '2026-10-25T02:30:00.000Z'],
    ['2026-07-01T14:00', '2026-07-01T12:00:00.000Z'],
  ])('wandelt %s korrekt um', (input, expected) => {
    expect(berlinDateTimeToIso(input)).toBe(expected);
  });
  it.each([
    '2026-03-29T02:30',
    '2026-02-30T12:00',
    '2026-13-01T12:00',
    'kein-datum',
  ])('weist %s zurück', (value) => {
    expect(berlinDateTimeToIso(value)).toBeNull();
  });
});

describe('formatBerlinDateTimeLocal', () => {
  it('formatiert einen Sommerzeitpunkt in Europe/Berlin', () => {
    expect(formatBerlinDateTimeLocal('2026-07-01T12:34:00.000Z')).toBe(
      '2026-07-01T14:34',
    );
  });

  it('formatiert einen Winterzeitpunkt in Europe/Berlin', () => {
    expect(formatBerlinDateTimeLocal('2026-01-01T12:34:00.000Z')).toBe(
      '2026-01-01T13:34',
    );
  });

  it('gibt für einen ungültigen Zeitpunkt einen Leerwert zurück', () => {
    expect(formatBerlinDateTimeLocal('kein-datum')).toBe('');
  });
});
