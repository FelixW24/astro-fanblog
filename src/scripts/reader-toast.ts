// Zeigt eine Meldung als Toast im globalen Benachrichtigungs-Stapel
// (NotificationCenter) an. Ohne Stapel (etwa in Fragment-Antworten) bleibt
// die Meldung still — der Aufrufer braucht keine Sonderbehandlung.

export function showReaderToast(message: string): void {
  // Ist ein Modal offen, landet der Toast im Stack des Dialogs – der globale
  // Stack liegt hinter dem Backdrop in der Top-Layer unsichtbar.
  const stack =
    document.querySelector<HTMLElement>(
      'dialog[open] [data-notification-stack]',
    ) ??
    document.querySelector<HTMLElement>(
      '[data-notification-stack]:not(dialog [data-notification-stack])',
    );
  if (!stack) return;
  const toast = document.createElement('p');
  toast.setAttribute('role', 'alert');
  toast.dataset.notification = '';
  toast.textContent = message;
  stack.append(toast);
}
