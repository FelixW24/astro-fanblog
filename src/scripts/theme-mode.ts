export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'fanblog:theme';

export function isThemePreference(
  value: string | null,
): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePreference(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    // Ohne Zugriff auf den lokalen Speicher greift der Dunkelmodus als Standard.
    return null;
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Die Auswahl gilt dann nur für die laufende Sitzung.
  }
}

export function resolveTheme(
  preference: ThemePreference | null,
  prefersLight: () => boolean = () =>
    window.matchMedia('(prefers-color-scheme: light)').matches,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  if (preference === 'system') return prefersLight() ? 'light' : 'dark';
  // Ohne gespeicherte Auswahl startet Astro Fanblog im Dunkelmodus.
  return 'dark';
}

export function applyTheme(
  preference: ThemePreference | null,
): 'light' | 'dark' {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = theme === 'dark' ? '#0e1012' : '#f7f7f5';
    });
  return theme;
}

export function announceThemeChange(preference: ThemePreference): void {
  window.dispatchEvent(
    new CustomEvent('theme-changed', { detail: { preference } }),
  );
}
