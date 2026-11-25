import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import RegistrationConfirmation from './RegistrationConfirmation.astro';

describe('RegistrationConfirmation', () => {
  it.each(['/profil', '/beitraege/spielbericht#kommentare'])(
    'erhält das Anmeldeziel %s, zeigt die Adresse und bestätigt keine Kontoverfügbarkeit',
    async (next) => {
      const container = await AstroContainer.create();
      const html = await container.renderToString(RegistrationConfirmation, {
        props: {
          next,
          email: 'fan@example.org',
          cooldown: 47,
        },
      });
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(html).toContain(`/anmelden?weiter=${encodeURIComponent(next)}`);
      expect(text).toContain(
        'Wenn deine Adresse für die Registrierung verfügbar ist',
      );
      expect(text).toContain('haben wir eine E-Mail an');
      expect(text).not.toContain('Bestätige darin deine Adresse.');
      expect(text).toContain('fan@example.org');
      expect(html).toContain('data-resend-email="fan@example.org"');
      expect(html).toContain(`data-resend-next="${next}"`);
      expect(html).toContain('data-resend-cooldown="47"');
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html).not.toContain('data-notification');
      expect(html).toContain('id="reader-auth-title"');
      expect(text).toContain('Prüfe auch deinen Spam-Ordner');
      expect(text).toContain('oder fordere die E-Mail erneut an.');
      // Cooldown läuft: Der Button zeigt den Countdown und ist gesperrt.
      expect(html).toContain(
        '<button type="button" data-resend-button disabled>',
      );
      expect(html).toContain(
        '<span data-resend-label>Neue E-Mail in 0:47</span>',
      );
      expect(text).not.toContain(
        'Du kannst einmal pro Minute eine neue E-Mail anfordern.',
      );
      expect(text).not.toContain('E-Mail erneut senden');
    },
  );

  it('zeichnet den Button nach Cooldown-Ablauf als „E-Mail erneut senden"', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RegistrationConfirmation, {
      props: { next: '/profil', email: 'fan@example.org', cooldown: 0 },
    });
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(html).toContain('<button type="button" data-resend-button>');
    expect(html).toContain(
      '<span data-resend-label>E-Mail erneut senden</span>',
    );
    expect(text).toContain('Du kannst jetzt eine neue E-Mail anfordern.');
    expect(text).not.toContain('Neue E-Mail in');
    expect(text).not.toContain(
      'Du kannst einmal pro Minute eine neue E-Mail anfordern.',
    );
  });

  it('zeigt im Resend-Button ein Kreislauf-Icon', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RegistrationConfirmation, {
      props: { next: '/profil', email: 'fan@example.org', cooldown: 0 },
    });
    const button = html.slice(
      html.indexOf('<button type="button" data-resend-button'),
      html.indexOf('</button>', html.indexOf('data-resend-button')),
    );
    expect(button).toContain('<svg');
    // iconoir-Icon „refresh“ (Paket iconoir, icons/regular/refresh.svg).
    expect(button).toContain(
      'M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12',
    );
  });
});
