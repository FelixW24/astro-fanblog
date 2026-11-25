// Verdrahtet die Anzeigen-Buttons der Passwortfelder. Muss für nachgeladene
// Fragmente (z. B. das Profil-Modal) erneut pro Wurzel aufgerufen werden.
export function wirePasswordToggles(root: ParentNode = document) {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-password-toggle]',
  )) {
    if (button.dataset.passwordReady) continue;
    button.dataset.passwordReady = 'true';
    button.addEventListener('click', () => {
      const input = button
        .closest('.password-control')
        ?.querySelector<HTMLInputElement>('[data-password-input]');
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      const label = input.labels?.[0]?.textContent?.trim() ?? 'Passwort';
      button.setAttribute(
        'aria-label',
        `${label} ${visible ? 'ausblenden' : 'anzeigen'}`,
      );
    });
  }
}
