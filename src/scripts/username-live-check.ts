import {
  parseUsernameCheckResponse,
  usernameCheckUrl,
  usernameLiveCheckDebounceMs,
  usernameTakenMessage,
} from '../lib/username-check';

// Debounced Live-Prüfung eines Username-Felds über /api/username-verfuegbar:
// Ist der Name vergeben oder reserviert, erscheint eine Meldung, der Submit-
// Button wird deaktiviert und `blocked` meldet den Zustand zurück – der
// Wizard blockiert damit den Schrittwechsel. Schlägt die Prüfung technisch
// fehl, blockiert die UI nicht – der serverseitige Trigger greift weiterhin.

export function wireUsernameLiveCheck(
  input: HTMLInputElement,
  feedback: HTMLElement,
  submit: HTMLButtonElement | null = null,
  onBlocked?: () => void,
): { sync: () => void; readonly blocked: boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let request = 0;
  let blocked = false;
  // Der Submit-Button kann aus anderen Gründen deaktiviert sein (z. B.
  // unbestätigte E-Mail). Zurückgesetzt wird nur, was die Sperre selbst
  // gesetzt hat – fremde Zustände bleiben unangetastet.
  let submitBlockedByCheck = false;

  const apply = () => {
    feedback.hidden = !blocked;
    feedback.textContent = blocked ? usernameTakenMessage : '';
    if (blocked) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (submit) {
      if (blocked) {
        submit.disabled = true;
        submitBlockedByCheck = true;
      } else if (submitBlockedByCheck) {
        submit.disabled = false;
        submitBlockedByCheck = false;
      }
    }
  };

  const clearBlocking = () => {
    blocked = false;
    apply();
  };

  const check = async () => {
    const url = usernameCheckUrl(input.value);
    // Ungültige Formate prüft die native Validierung; es gibt nichts zu
    // blockieren, solange der Wert dem erlaubten Muster widerspricht.
    if (!url) {
      clearBlocking();
      return;
    }
    const current = ++request;
    controller?.abort();
    controller = new AbortController();
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (current !== request) return;
      const available = parseUsernameCheckResponse(payload);
      // Erst wenn der neue Status feststeht, den Sperr-Callback rufen: Der
      // Wizard kann so einen Nutzer zurückholen, der während der Prüfung
      // schon weitergeklickt hat.
      blocked = available === false;
      if (blocked) onBlocked?.();
      apply();
    } catch {
      if (current === request) clearBlocking();
    }
  };

  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void check(), usernameLiveCheckDebounceMs);
  });

  return {
    // Nach externen Submit-/Speicherabläufen erneut anwenden, damit ein
    // blockierter Name nicht durch anderweitiges Aktivieren durchrutscht.
    sync: apply,
    get blocked() {
      return blocked;
    },
  };
}
