import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig, appEnv } from './app-config';

const configEnvNames = [
  'SITE_ORIGIN',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_AUTH_SECRET_KEY',
  'MAIL_SMTP_HOST',
  'MAIL_SMTP_PORT',
  'MAIL_SMTP_USER',
  'MAIL_SMTP_PASSWORD',
  'MAIL_SMTP_PASSWORD_FILE',
  'MAIL_FROM',
  'BUG_REPORT_SMTP_HOST',
  'BUG_REPORT_SMTP_PORT',
  'BUG_REPORT_SMTP_USER',
  'BUG_REPORT_SMTP_PASS',
  'BUG_REPORT_MAIL_FROM',
];

let passwordDirectory: string | undefined;

function clearConfigEnv() {
  for (const name of configEnvNames) vi.stubEnv(name, '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (passwordDirectory) {
    rmSync(passwordDirectory, { recursive: true, force: true });
    passwordDirectory = undefined;
  }
});

describe('Anwendungskonfiguration', () => {
  it('bevorzugt die Laufzeit-Umgebung gegenüber Astro-Build-Werten', () => {
    const runtimeEnv = { SITE_ORIGIN: 'https://runtime.example' };
    const astroBuildEnv = { SITE_ORIGIN: 'https://build.example' };

    expect(appEnv('SITE_ORIGIN', runtimeEnv, astroBuildEnv)).toBe(
      'https://runtime.example',
    );
    expect(appEnv('SITE_ORIGIN', {}, astroBuildEnv)).toBe(
      'https://build.example',
    );
    expect(appEnv('SITE_ORIGIN', { SITE_ORIGIN: '' }, astroBuildEnv)).toBe(
      'https://build.example',
    );
  });

  it('bevorzugt MAIL_* gegenüber den bisherigen BUG_REPORT_*-Werten', () => {
    clearConfigEnv();
    vi.stubEnv('MAIL_SMTP_HOST', 'smtp.canonical.example');
    vi.stubEnv('MAIL_SMTP_PORT', '587');
    vi.stubEnv('MAIL_SMTP_USER', 'canonical-user');
    vi.stubEnv('MAIL_SMTP_PASSWORD', 'canonical-password');
    vi.stubEnv('MAIL_FROM', 'Astro Fanblog <canonical@example.org>');
    vi.stubEnv('BUG_REPORT_SMTP_HOST', 'smtp.legacy.example');
    vi.stubEnv('BUG_REPORT_SMTP_PORT', '2525');
    vi.stubEnv('BUG_REPORT_SMTP_USER', 'legacy-user');
    vi.stubEnv('BUG_REPORT_SMTP_PASS', 'legacy-password');
    vi.stubEnv('BUG_REPORT_MAIL_FROM', 'legacy@example.org');

    expect(appConfig().mail).toMatchObject({
      smtpHost: 'smtp.canonical.example',
      smtpPort: 587,
      smtpUser: 'canonical-user',
      smtpPassword: 'canonical-password',
      from: 'Astro Fanblog <canonical@example.org>',
    });
  });

  it('verwendet BUG_REPORT_* als Fallback, wenn MAIL_* fehlt', () => {
    clearConfigEnv();
    vi.stubEnv('BUG_REPORT_SMTP_HOST', 'smtp.legacy.example');
    vi.stubEnv('BUG_REPORT_SMTP_PORT', '2525');
    vi.stubEnv('BUG_REPORT_SMTP_USER', 'legacy-user');
    vi.stubEnv('BUG_REPORT_SMTP_PASS', 'legacy-password');
    vi.stubEnv('BUG_REPORT_MAIL_FROM', 'legacy@example.org');

    expect(appConfig().mail).toMatchObject({
      smtpHost: 'smtp.legacy.example',
      smtpPort: 2525,
      smtpUser: 'legacy-user',
      smtpPassword: 'legacy-password',
      from: 'legacy@example.org',
    });
  });

  it('liest das SMTP-Passwort aus einer geschützten Passwortdatei', () => {
    clearConfigEnv();
    passwordDirectory = mkdtempSync(join(tmpdir(), 'astro-fanblog-app-config-'));
    const passwordFile = join(passwordDirectory, 'smtp-password');
    writeFileSync(passwordFile, 'file-password\n', { mode: 0o600 });
    vi.stubEnv('MAIL_SMTP_PASSWORD_FILE', passwordFile);

    expect(appConfig().mail.smtpPassword).toBe('file-password');
  });

  it('setzt sinnvolle Defaults für Website-Origin und SMTP-Port', () => {
    clearConfigEnv();

    expect(appConfig()).toMatchObject({
      siteOrigin: 'https://example.com',
      mail: { smtpPort: 465 },
    });
  });
});
