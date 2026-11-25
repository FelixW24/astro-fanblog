import { describe, expect, it } from 'vitest';
import {
  matchesAdminCredentials,
  matchesAdminEmail,
  readAdminAccountConfig,
} from './admin-account';

describe('Redaktionskonto-Konfiguration', () => {
  const config = {
    email: 'kontakt@example.com',
    password: 'Ein-sicheres-Passwort',
  };

  it('liest und normalisiert vollständige Zugangsdaten', () => {
    expect(
      readAdminAccountConfig({
        ADMIN_EMAIL: ' Kontakt@example.com ',
        ADMIN_PASSWORD: config.password,
      }),
    ).toEqual(config);
  });

  it('deaktiviert den Zugang bei unvollständiger Konfiguration', () => {
    expect(readAdminAccountConfig({})).toBeNull();
    expect(readAdminAccountConfig({ ADMIN_EMAIL: config.email })).toBeNull();
    expect(
      readAdminAccountConfig({ ADMIN_PASSWORD: config.password }),
    ).toBeNull();
  });

  it('akzeptiert ausschließlich die vollständig passenden Zugangsdaten', () => {
    expect(matchesAdminEmail(' Kontakt@example.com ', config)).toBe(true);
    expect(matchesAdminEmail('andere@example.com', config)).toBe(false);
    expect(
      matchesAdminCredentials(
        ' Kontakt@example.com ',
        config.password,
        config,
      ),
    ).toBe(true);
    expect(
      matchesAdminCredentials(
        'andere@example.com',
        config.password,
        config,
      ),
    ).toBe(false);
    expect(
      matchesAdminCredentials(config.email, 'Falsches-Passwort', config),
    ).toBe(false);
    expect(matchesAdminCredentials(config.email, config.password, null)).toBe(
      false,
    );
  });
});
