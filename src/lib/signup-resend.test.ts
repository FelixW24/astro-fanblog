import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  signupResendCooldown,
  signupResendRateLimit,
} from './auth-rate-limit';
import {
  formatResendCountdown,
  parseResendRequest,
  resendUnavailable,
  signupResendCooldownSeconds,
} from './signup-resend';

describe('parseResendRequest', () => {
  it('liest E-Mail und sicheres Ziel', () => {
    const form = new FormData();
    form.set('email', ' fan@example.org ');
    form.set('weiter', '/beitraege/spielbericht#kommentare');
    expect(parseResendRequest(form)).toEqual({
      email: 'fan@example.org',
      next: '/beitraege/spielbericht#kommentare',
      error: null,
    });
  });

  it('lehnt ungleiche Adressen und unbekannte Ziele ab', () => {
    const invalid = new FormData();
    invalid.set('email', 'kein-mail');
    invalid.set('weiter', 'https://evil.example');
    expect(parseResendRequest(invalid)).toEqual({
      email: 'kein-mail',
      next: '/profil',
      error: 'Bitte gib eine gültige E-Mail-Adresse an.',
    });

    const tooLong = new FormData();
    tooLong.set('email', `a@b.${'c'.repeat(260)}`);
    const parsed = parseResendRequest(tooLong);
    expect(parsed.error).toBe('Bitte gib eine gültige E-Mail-Adresse an.');
  });
});

describe('formatResendCountdown', () => {
  it.each([
    [60, '1:00'],
    [47, '0:47'],
    [9, '0:09'],
    [125, '2:05'],
    [1, '0:01'],
    [0, '0:00'],
    [-3, '0:00'],
  ])('formatiert %i Sekunden als %s', (seconds, expected) => {
    expect(formatResendCountdown(seconds)).toBe(expected);
  });
});

describe('resendUnavailable', () => {
  it.each([
    [500, true],
    [503, true],
    [429, true],
    [undefined, true],
    [400, false],
    [404, false],
    [401, false],
  ])('bewertet Status %s als %s', (status, expected) => {
    expect(resendUnavailable(status)).toBe(expected);
  });
});

it('hält den Cooldown bei einer Minute', () => {
  expect(signupResendCooldownSeconds).toBe(60);
});

it('begrenzt den Resend-Versand auf eine Mail pro Minute und Adresse', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blog-resend-'));
  process.env.AUTH_RATE_LIMIT_DB = join(directory, 'limits.sqlite');
  try {
    expect(signupResendCooldown('fan@example.org')).toBe(0);
    expect(signupResendRateLimit('Fan@Example.ORG')).toBe(0);
    // Gleiche Adresse in anderer Schreibweise: Cooldown läuft.
    const remaining = signupResendCooldown('fan@example.org');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
    expect(signupResendRateLimit('fan@example.org')).toBe(60);
    expect(signupResendCooldown('andere@example.org')).toBe(0);
  } finally {
    delete process.env.AUTH_RATE_LIMIT_DB;
    rmSync(directory, { recursive: true });
  }
});
