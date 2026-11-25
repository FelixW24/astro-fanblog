import { VIEW_THRESHOLD_MS, visitorKey } from '../lib/tracking';

// Zählt einen View, sobald ein Besucher mindestens 30 Sekunden auf der
// Beitragsseite verbringt. Pro Browser und Beitrag nur einmal (localStorage).
export function initArticleViewTracking(
  articleId: number,
  endpoint = '/api/tracking/article-view',
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const seenKey = `astro-fanblog:viewed:${articleId}`;
  try {
    if (window.localStorage.getItem(seenKey)) return;
  } catch {
    return;
  }
  const key = visitorKey(window.localStorage);
  const start = Date.now();
  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    try {
      window.localStorage.setItem(seenKey, '1');
    } catch {
      // Ohne Speicher wird höchstens mehrfach pro Sitzung gezählt.
    }
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId, visitor_key: key }),
      keepalive: true,
    }).catch(() => {
      // Tracking darf die Nutzung nie blockieren.
    });
  };
  // Timer greift, solange das Tab sichtbar ist.
  const timer = window.setTimeout(() => {
    if (document.visibilityState === 'visible') send();
  }, VIEW_THRESHOLD_MS);
  // Tab-Wechsel/schließen: erst ab Schwelle zählen.
  const onHidden = () => {
    if (Date.now() - start >= VIEW_THRESHOLD_MS) {
      window.clearTimeout(timer);
      send();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHidden();
  });
  window.addEventListener('pagehide', onHidden);
}
