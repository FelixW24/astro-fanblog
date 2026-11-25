// Erneuter Versand der Bestätigungsmail von der Bestätigungskarte: Der
// Button zeigt selbst den Countdown, bis der einminütige Cooldown abläuft,
// und heißt dann „E-Mail erneut senden“. Der Server erzwingt dasselbe
// Limit und synchronisiert bei 429 seine verbleibende Zeit zurück.

import {
  formatResendCountdown,
  signupResendCooldownSeconds,
} from '../lib/signup-resend';
import { showReaderToast } from './reader-toast';

const resendEndpoint = '/api/registrierung/erneut-senden';
const waitingPrefix = 'Neue E-Mail in';
const readyLabel = 'E-Mail erneut senden';
const sentHint = 'Neue E-Mail gesendet. Prüfe dein Postfach.';
const readyHint = 'Du kannst jetzt eine neue E-Mail anfordern.';

export function wireRegistrationResend(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>('[data-resend-button]');
  const label = root.querySelector<HTMLElement>('[data-resend-label]');
  const hint = root.querySelector<HTMLElement>(
    '.registration-confirmation__resend-hint',
  );
  if (!button || !label || !hint) return;

  let remaining = Math.max(0, Number(root.dataset.resendCooldown ?? '0'));
  let clock: ReturnType<typeof setInterval> | undefined;

  const setReady = () => {
    button.disabled = false;
    label.textContent = readyLabel;
    hint.textContent = readyHint;
  };
  const setWaiting = (seconds: number, sentNotice: boolean) => {
    button.disabled = true;
    label.textContent = `${waitingPrefix} ${formatResendCountdown(seconds)}`;
    hint.textContent = sentNotice ? sentHint : '';
    remaining = Math.max(1, Math.floor(seconds));
    clearInterval(clock);
    clock = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(clock);
        setReady();
        return;
      }
      label.textContent = `${waitingPrefix} ${formatResendCountdown(remaining)}`;
    }, 1000);
  };

  if (remaining > 0) setWaiting(remaining, false);
  else setReady();

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const form = new FormData();
    form.set('email', root.dataset.resendEmail ?? '');
    form.set('weiter', root.dataset.resendNext ?? '');
    try {
      const response = await fetch(resendEndpoint, {
        method: 'POST',
        body: form,
      });
      if (response.ok) {
        setWaiting(signupResendCooldownSeconds, true);
        return;
      }
      const data = (await response.json()) as {
        error?: string;
        retry?: number;
      };
      if (response.status === 429 && typeof data.retry === 'number') {
        setWaiting(data.retry, false);
        return;
      }
      showReaderToast(
        data.error ??
          'Der Versand ist fehlgeschlagen. Bitte versuche es später erneut.',
      );
      setReady();
    } catch {
      showReaderToast(
        'Der Versand ist fehlgeschlagen. Bitte versuche es später erneut.',
      );
      setReady();
    }
  });
}
