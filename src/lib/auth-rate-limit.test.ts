import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { authRateLimit, createAuthLimiter } from './auth-rate-limit';

describe('Auth-Rate-Limit', () => {
  it('trennt Benutzer, begrenzt Mailversand und gibt Fenster wieder frei', () => {
    const limiter = createAuthLimiter(':memory:');
    try {
      for (let i = 0; i < 20; i++)
        expect(limiter.consume('one', 'auth', 1000)).toBe(0);
      expect(limiter.consume('one', 'auth', 1000)).toBe(60);
      expect(limiter.consume('two', 'auth', 1000)).toBe(0);
      expect(limiter.consume('one', 'auth', 61_000)).toBe(0);
      for (let i = 0; i < 5; i++)
        expect(limiter.consume('one', 'email', 1000)).toBe(0);
      expect(limiter.consume('one', 'email', 1000)).toBe(600);
    } finally {
      limiter.close();
    }
  });
  it('begrenzt Login-Versuche zusätzlich pro E-Mail-Adresse', () => {
    const limiter = createAuthLimiter(':memory:');
    try {
      for (let i = 0; i < 6; i++)
        expect(limiter.consume('email:fan@example.org', 'auth-email', 1000)).toBe(
          0,
        );
      expect(
        limiter.consume('email:fan@example.org', 'auth-email', 1000),
      ).toBe(60);
      expect(
        limiter.consume('email:andere@example.org', 'auth-email', 1000),
      ).toBe(0);
      expect(
        limiter.consume('email:fan@example.org', 'auth-email', 61_000),
      ).toBe(0);
    } finally {
      limiter.close();
    }
  });
  it('kombiniert IP- und E-Mail-Budget für Anmeldungen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'blog-auth-fn-'));
    process.env.AUTH_RATE_LIMIT_DB = join(directory, 'limits.sqlite');
    try {
      // Unter CI-Last vergeht reale Zeit zwischen den Aufrufen, wodurch der
      // berechnete Cooldown unter 60 s fallen kann. Gefrorene Zeit macht den
      // Test deterministisch.
      vi.useFakeTimers();
      for (let i = 0; i < 6; i++)
        expect(
          authRateLimit(`198.51.100.${i}`, '/anmelden', 'fan@example.org'),
        ).toBe(0);
      expect(authRateLimit('198.51.100.9', '/anmelden', 'fan@example.org')).toBe(
        60,
      );
      expect(
        authRateLimit('198.51.100.9', '/anmelden', 'andere@example.org'),
      ).toBe(0);
      for (let i = 0; i < 20; i++)
        expect(authRateLimit('203.0.113.1', '/anmelden')).toBe(0);
      expect(authRateLimit('203.0.113.1', '/anmelden')).toBe(60);
    } finally {
      vi.useRealTimers();
      delete process.env.AUTH_RATE_LIMIT_DB;
      rmSync(directory, { recursive: true });
    }
  });
  it('hebt Login-Budgets für Testumgebungen und Env-Overrides', () => {
    process.env.PLAYWRIGHT_TEST = '1';
    try {
      const testLimiter = createAuthLimiter(':memory:');
      try {
        for (let i = 0; i < 7; i++)
          expect(testLimiter.consume('one', 'auth', 1000)).toBe(0);
        expect(testLimiter.consume('fan@example.org', 'auth-email', 1000)).toBe(
          0,
        );
      } finally {
        testLimiter.close();
      }
    } finally {
      delete process.env.PLAYWRIGHT_TEST;
    }
    process.env.PLAYWRIGHT_TEST = '1';
    process.env.AUTH_RATE_LIMIT_LOGIN_IP_BUDGET = '2';
    process.env.AUTH_RATE_LIMIT_LOGIN_EMAIL_BUDGET = '1';
    try {
      const limited = createAuthLimiter(':memory:');
      try {
        expect(limited.consume('one', 'auth', 1000)).toBe(0);
        expect(limited.consume('one', 'auth', 1000)).toBe(0);
        expect(limited.consume('one', 'auth', 1000)).toBe(60);
        expect(
          limited.consume('fan@example.org', 'auth-email', 1000),
        ).toBe(0);
        expect(
          limited.consume('fan@example.org', 'auth-email', 1000),
        ).toBe(60);
      } finally {
        limited.close();
      }
    } finally {
      delete process.env.PLAYWRIGHT_TEST;
      delete process.env.AUTH_RATE_LIMIT_LOGIN_IP_BUDGET;
      delete process.env.AUTH_RATE_LIMIT_LOGIN_EMAIL_BUDGET;
    }
    process.env.AUTH_RATE_LIMIT_LOGIN_IP_BUDGET = 'unsinnig';
    try {
      const fallback = createAuthLimiter(':memory:');
      try {
        expect(fallback.consume('one', 'auth', 1000)).toBe(0);
      } finally {
        fallback.close();
      }
    } finally {
      delete process.env.AUTH_RATE_LIMIT_LOGIN_IP_BUDGET;
    }
  });
  it('teilt Limits zwischen Workern und erhält sie nach Neustarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'blog-auth-test-'));
    const path = join(directory, 'limits.sqlite');
    const first = createAuthLimiter(path);
    const second = createAuthLimiter(path);
    try {
      for (let i = 0; i < 5; i++) first.consume('one', 'email', 1000);
      expect(second.consume('one', 'email', 1000)).toBe(600);
    } finally {
      first.close();
      second.close();
    }
    const restarted = createAuthLimiter(path);
    try {
      expect(restarted.consume('one', 'email', 1000)).toBe(600);
    } finally {
      restarted.close();
      rmSync(directory, { recursive: true });
    }
  });
});
