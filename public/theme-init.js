// Theme- und Datensparmodus vor dem ersten Paint anwenden (FOUC vermeiden).
// Als klassische externe Datei im <head> eingebunden, blockiert das Parsen
// kurz und stellt sicher, dass data-theme/data-data-saver vor dem Render gesetzt sind.
(() => {
  const storageKey = 'fanblog:theme';
  let storedTheme = null;

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      storedTheme = stored;
  } catch {
    // Fall back to dark mode when storage is blocked.
  }

  const resolveTheme = () => {
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
    if (storedTheme === 'system')
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
    return 'dark';
  };

  const applyTheme = () => {
    const theme = resolveTheme();
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = theme === 'dark' ? '#0e1012' : '#f7f7f5';
    });
  };

  applyTheme();

  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      let stored = null;
      try {
        stored = localStorage.getItem(storageKey);
      } catch {
        // Keep the current theme when storage is blocked.
      }
      if (stored === 'system') applyTheme();
    });

  // Datensparmodus vor dem ersten Paint anwenden: eigene gespeicherte Wahl
  // gewinnt, sonst greift die Systemeinstellung (navigator.connection.saveData).
  const dataSaverKey = 'fanblog:data-saver';
  const dataSaverCookie = 'datensparmodus';
  // Platzhalter fuer dekorative Bilder (z. B. Avatare): inline-SVG, kein Request.
  const decorativePlaceholder =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" stroke-width="1.5" viewBox="0 0 24 24" fill="none"><path d="M5 20V19C5 15.134 8.13401 12 12 12V12C15.866 12 19 15.134 19 19V20" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );

  const stripDecorativeImage = (img) => {
    if (img.hasAttribute('data-decorative-stripped')) return;
    img.setAttribute('data-decorative-stripped', '');
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    img.removeAttribute('fetchpriority');
    img.src = decorativePlaceholder;
  };

  const sweepDecorativeImages = (root) => {
    if (document.documentElement.dataset.dataSaver !== 'on') return;
    if (root instanceof Element && root.matches('img[data-decorative]'))
      stripDecorativeImage(root);
    if (root instanceof Element || root instanceof Document)
      root
        .querySelectorAll('img[data-decorative]')
        .forEach(stripDecorativeImage);
  };

  const applyDataSaver = () => {
    let stored = null;
    try {
      stored = localStorage.getItem(dataSaverKey);
    } catch {
      // Ohne Speicherzugriff entscheidet nur die Systemeinstellung.
    }
    const systemSaveData = !!(
      navigator.connection && navigator.connection.saveData
    );
    // Serverseitig erkannter Modus (Cookie/Save-Data-Header) als Fallback,
    // wenn lokal nichts gespeichert ist.
    const serverHint = document.documentElement.dataset.dataSaver === 'on';
    const active =
      stored === 'on' ||
      (stored !== 'off' &&
        (systemSaveData || (stored === null && serverHint)));
    if (active) {
      document.documentElement.dataset.dataSaver = 'on';
      try {
        document.cookie = `${dataSaverCookie}=on; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // Ohne Cookie wertet der Server nur den Save-Data-Header aus.
      }
    } else {
      delete document.documentElement.dataset.dataSaver;
      try {
        document.cookie = `${dataSaverCookie}=; path=/; max-age=0`;
      } catch {
        // Cookie-Loeschen nicht moeglich: Zustand bleibt clientseitig.
      }
    }
    sweepDecorativeImages(document);
  };

  // Schon beim Parsen dekorative Bilder ersetzen, bevor der Fetch startet.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations)
      for (const node of mutation.addedNodes)
        if (node instanceof Element) sweepDecorativeImages(node);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  applyDataSaver();
  // Aenderungen der Systemeinstellung und eigene Toggle-Events im Modal.
  navigator.connection?.addEventListener?.('change', applyDataSaver);
  document.addEventListener('data-saver-changed', applyDataSaver);
})();
