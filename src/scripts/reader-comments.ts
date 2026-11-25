import { wireCommentProfileCards } from './comment-profile-cards';
import { showReaderToast } from './reader-toast';

// Fehlermeldungen der Vote-API, passend zu den serverseitigen Redirects in
// pages/kommentare.ts (dort als kommentarfehler-Parameter gerendert).
const voteErrorMessages: Record<string, string> = {
  login: 'Für Bewertungen benötigst du ein registriertes Leserkonto.',
  email: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  profile: 'Richte dein Profil ein, um Kommentare zu bewerten.',
  ghost:
    'Dein Konto ist im Geistermodus aktiv. Du kannst keine Bewertungen abgeben.',
  invalid: 'Die Anfrage ist ungültig. Bitte lade die Seite neu.',
  not_found: 'Der Kommentar wurde nicht gefunden. Bitte lade die Seite neu.',
  save: 'Deine Aktion konnte nicht gespeichert werden. Bitte versuche es erneut.',
};

// "Gefällt mir" ohne Seitenreload: POST als JSON-API, Button wird nach der
// Antwort direkt aktualisiert. Ohne JavaScript greift weiterhin der
// Formular-POST auf /kommentare mit serverseitigem Redirect.
async function submitVote(
  form: HTMLFormElement,
  button: HTMLButtonElement,
): Promise<void> {
  const label = button.querySelector('span');
  button.disabled = true;
  try {
    const body = new FormData(form);
    // new FormData(form) ohne submitter-Argument übernimmt den Button-Wert
    // nicht – er muss explizit gesetzt werden.
    body.set('value', button.value);
    const response = await fetch('/api/kommentare/vote', {
      method: 'POST',
      body,
    });
    const data = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (response.status === 401) {
      window.location.assign(
        `/anmelden?weiter=${encodeURIComponent(
          window.location.pathname +
            window.location.search +
            window.location.hash,
        )}`,
      );
      return;
    }
    if (!response.ok || !data || data.ok !== true) {
      showReaderToast(
        voteErrorMessages[String(data?.error)] ?? voteErrorMessages.save,
      );
      return;
    }
    const value = Number(data.value);
    button.value = value === 1 ? '0' : '1';
    button.setAttribute('aria-pressed', String(value === 1));
    if (label) label.textContent = `Gefällt mir · ${String(data.likes)}`;
  } catch {
    showReaderToast(voteErrorMessages.save);
  } finally {
    button.disabled = false;
  }
}

function wireVoteForms(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLFormElement>('form.reader-votes')
    .forEach((form) => {
      if (form.dataset.voteWired) return;
      form.dataset.voteWired = '1';
      form.addEventListener('submit', (event) => {
        const button =
          form.querySelector<HTMLButtonElement>('.reader-vote-button');
        // Gäste (data-auth-required) und deaktivierte Buttons bleiben beim
        // Standardverhalten: Auth-Notice bzw. serverseitiger Redirect.
        if (
          !button ||
          button.disabled ||
          button.hasAttribute('data-auth-required')
        )
          return;
        event.preventDefault();
        void submitVote(form, button);
      });
    });
}

// Kommentar-Insel einrichten: Profilkarten, Bewertungen ohne Reload und
// Auf-/Zu-Klappen der Antworten pro Kommentar-Thread. Wird sowohl von der
// eigenständigen Komponentenseite (Kommentare.astro) als auch nach dem
// clientseitigen Nachladen des Fragments auf der Beitragsseite
// (beitraege/[slug].astro) aufgerufen, da per innerHTML injizierte
// <script>-Tags nicht ausgeführt werden.
export function wireReaderComments(root: HTMLElement): void {
  wireCommentProfileCards(root);
  wireVoteForms(root);
  root
    .querySelectorAll<HTMLButtonElement>('[data-replies-toggle]')
    .forEach((toggle) => {
      const threadId = toggle.dataset.for;
      if (!threadId) return;
      toggle.addEventListener('click', () => {
        const expand = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expand));
        root
          .querySelectorAll<HTMLElement>(`[data-reply-root="${threadId}"]`)
          .forEach((reply) => (reply.hidden = !expand));
      });
    });
  // Deep-Link (?kommentar=<id>): Thread der Zielantwort direkt aufklappen.
  const targetId = Number(
    new URLSearchParams(window.location.search).get('kommentar'),
  );
  if (Number.isSafeInteger(targetId) && targetId > 0) {
    const threadId = root
      .querySelector<HTMLElement>(`#kommentar-${targetId}`)
      ?.getAttribute('data-reply-root');
    if (threadId) {
      const toggle = root.querySelector<HTMLButtonElement>(
        `[data-replies-toggle][data-for="${threadId}"]`,
      );
      if (toggle && toggle.getAttribute('aria-expanded') !== 'true')
        toggle.click();
    }
  }
}
