import {
  dataSaverConnection,
  readDataSaverPreference,
  resolveDataSaverActive,
  systemDataSaverRequested,
} from '../lib/data-saver';

// Tauscht Cover-Bilder gegen die Kompakt-Variante, wenn der Datensparmodus
// aktiv ist (gespeicherte Wahl oder Systemeinstellung). Prerenderte Seiten
// können das serverseitig nicht mehr über Cookie/Save-Data-Header entscheiden.
function applyDataSaverImages() {
  const stored = readDataSaverPreference();
  // Serverseitig erkannter Modus (Cookie/Save-Data-Header, von ThemeInit in
  // data-data-saver uebernommen) als Fallback ohne gespeicherte Wahl.
  const serverHint = document.documentElement.dataset.dataSaver === 'on';
  const active = resolveDataSaverActive(
    stored,
    systemDataSaverRequested() || (stored === null && serverHint),
  );
  document.querySelectorAll('img[data-compact-src]').forEach((img) => {
    const el = img as HTMLImageElement;
    if (active) {
      if (!el.dataset.fullSrc) el.dataset.fullSrc = el.src;
      if (el.dataset.fullSrcset === undefined)
        el.dataset.fullSrcset = el.getAttribute('srcset') ?? '';
      el.src = el.dataset.compactSrc ?? el.src;
      if (el.dataset.compactSrcset)
        el.setAttribute('srcset', el.dataset.compactSrcset);
    } else {
      if (el.dataset.fullSrc) el.src = el.dataset.fullSrc;
      if (el.dataset.fullSrcset !== undefined) {
        if (el.dataset.fullSrcset) el.setAttribute('srcset', el.dataset.fullSrcset);
        else el.removeAttribute('srcset');
      }
    }
  });
}

export function initDataSaverImages() {
  applyDataSaverImages();
  window.addEventListener('data-saver-changed', applyDataSaverImages);
  window.addEventListener('storage', applyDataSaverImages);
  dataSaverConnection()?.addEventListener?.('change', applyDataSaverImages);
}
