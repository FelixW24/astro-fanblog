import { describe, expect, it } from 'vitest';
import { profileGateExempt, profileGateTarget } from './profile-gate';

describe('Setup-Gate für Leserkonten', () => {
  it.each([
    '/profil/einrichten',
    '/profil/einrichten/',
    '/abmelden',
    '/datenschutz',
    '/agb',
    '/impressum',
    '/passwort-neu',
    '/passwort-vergessen',
    '/api/profil/profilbild',
    '/auth/passwort-zuruecksetzen',
    '/admin/login',
    '/_astro/astro.script.js',
    '/robots.txt',
    '/sitemap.xml',
    '/rss.xml',
    '/favicon.ico',
  ])('lässt den technischen oder freien Pfad %s zu', (path) => {
    expect(profileGateExempt(path)).toBe(true);
  });

  it.each([
    '/',
    '/beitraege/derby',
    '/beitraege/derby#kommentare',
    '/kader',
    '/profil',
    '/anmelden',
    '/registrieren',
    '/kommentare',
    '/category/unknown',
  ])('sperrt den Seitenpfad %s', (path) => {
    expect(profileGateExempt(path)).toBe(false);
  });

  it('führt aus der Startseite ohne Weiter-Ziel in die Einrichtung', () => {
    expect(profileGateTarget('/')).toBe('/profil/einrichten');
  });

  it('behält Artikel als Rückkehrziel nach der Einrichtung', () => {
    expect(profileGateTarget('/beitraegenicht')).toBe('/profil/einrichten');
    expect(profileGateTarget('/beitraege/derby#kommentare')).toBe(
      `/profil/einrichten?weiter=${encodeURIComponent(
        '/beitraege/derby#kommentare',
      )}`,
    );
  });
});
