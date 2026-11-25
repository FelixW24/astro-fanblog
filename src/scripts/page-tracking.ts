import { isTrackedPath, visitorKey } from '../lib/tracking';

// Erfasst jeden Aufruf öffentlicher Seiten als Pageview (Website-Besucher).
export function initPageTracking(endpoint = '/api/tracking/page-view'): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const path = window.location.pathname;
  if (!isTrackedPath(path)) return;
  if (window.location.search.includes('suche=')) return;
  const key = visitorKey(window.localStorage);
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, visitor_key: key }),
    keepalive: true,
  }).catch(() => {
    // Tracking darf die Nutzung nie blockieren.
  });
}
