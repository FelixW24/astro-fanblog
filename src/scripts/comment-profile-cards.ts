import {
  commentCountLabel,
  memberSinceLabel,
  parseReaderCardResponse,
  readerCardUrl,
  type ReaderCardData,
} from '../lib/reader-card';

// Profilkarten in der Kommentar-Sektion: Hover (Desktop) und Klick (Touch)
// öffnen über dem Profilbild eine kleine Karte mit Username. Die
// Daten kommen von /api/leser/profilkarte und werden pro Profil gecacht; das
// Avatar-Bild wird aus dem jeweiligen Kommentar übernommen.

const hideDelayMs = 180;

export function wireCommentProfileCards(root: HTMLElement): void {
  const template = root.querySelector<HTMLTemplateElement>(
    '[data-reader-card-template]',
  );
  const cache = new Map<string, ReaderCardData | null>();
  let showRequest = 0;
  let open: {
    button: HTMLButtonElement;
    card: HTMLElement;
    hide: () => void;
  } | null = null;

  const closeOpen = () => {
    open?.hide();
    open = null;
  };

  const fetchCard = async (userId: string): Promise<ReaderCardData | null> => {
    if (cache.has(userId)) return cache.get(userId) ?? null;
    const url = readerCardUrl(userId);
    if (!url) return null;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      const payload: unknown = await response.json().catch(() => null);
      const card = parseReaderCardResponse(payload);
      cache.set(userId, card);
      return card;
    } catch {
      return null;
    }
  };

  const buttons = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-comment-avatar]'),
  ];
  if (!buttons.length) return;

  const onOutsideClick = (event: Event) => {
    if (
      open &&
      event.target instanceof Node &&
      !open.button.contains(event.target) &&
      !open.card.contains(event.target)
    )
      closeOpen();
  };
  const onEscape = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') closeOpen();
  };
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onEscape);

  for (const button of buttons) {
    const userId = button.dataset.commentUserId ?? '';
    let cardEl: HTMLElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelHide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
    };

    const hide = () => {
      cancelHide();
      if (open && open.button === button) open = null;
      cardEl?.remove();
      cardEl = null;
      button.setAttribute('aria-expanded', 'false');
    };

    const show = async () => {
      const current = ++showRequest;
      closeOpen();
      const data = await fetchCard(userId);
      if (current !== showRequest) return;
      if (!data || !template?.content.firstElementChild) return;
      const card = template.content.firstElementChild.cloneNode(
        true,
      ) as HTMLElement;
      // Das Avatar-Bild (SVG oder Upload) wird aus dem Kommentar geklont,
      // statt es im Client neu zu rendern. Beim Verlassen der Karte bleibt
      // sie kurz offen, damit die Maus sie erreichen kann.
      card.addEventListener('mouseenter', cancelHide);
      card.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(hide, hideDelayMs);
      });
      const figure = card.querySelector('[data-reader-card-figure]');
      const avatar = button.querySelector('.reader-avatar')?.cloneNode(true);
      if (figure && avatar instanceof Node) figure.replaceChildren(avatar);
      const name = card.querySelector('[data-reader-card-name]');
      if (name) name.textContent = data.username;
      const member = card.querySelector('[data-reader-card-member]');
      const memberLabel = card.querySelector('[data-reader-card-member-label]');
      const memberText = memberSinceLabel(data.memberSince);
      if (member && memberLabel) {
        if (memberText) {
          memberLabel.textContent = memberText;
          member.removeAttribute('hidden');
        } else member.setAttribute('hidden', '');
      }
      const count = card.querySelector('[data-reader-card-count]');
      const countLabel = card.querySelector('[data-reader-card-count-label]');
      if (count && countLabel) {
        countLabel.textContent = commentCountLabel(data.commentCount);
        count.removeAttribute('hidden');
      }
      card.removeAttribute('hidden');
      // Außerhalb des <header> eingehängt, damit keine Kopf-Regeln
      // (grid-column, Avatar-Größe) auf die Karte übergreifen; verankert
      // wird sie über .reader-card an der Avatar-Spalte des Kommentars.
      (button.closest('header') ?? button).after(card);
      cardEl = card;
      button.setAttribute('aria-expanded', 'true');
      open = { button, card, hide };
    };

    const toggle = () => {
      if (cardEl) hide();
      else void show();
    };

    button.addEventListener('mouseenter', () => {
      cancelHide();
      if (!cardEl) void show();
    });
    button.addEventListener('mouseleave', () => {
      cancelHide();
      hideTimer = setTimeout(hide, hideDelayMs);
    });
    button.addEventListener('focus', () => {
      cancelHide();
      if (!cardEl) void show();
    });
    button.addEventListener('blur', hide);
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && cardEl) {
        hide();
        button.focus();
      }
    });
  }
}
