export const DATA_SAVER_STORAGE_KEY = 'fanblog:data-saver';

/** Cookie, über das der Server den Modus erkennt (z. B. für kleinere Cover). */
export const DATA_SAVER_COOKIE = 'datensparmodus';

export type DataSaverValue = 'on' | 'off';

export function isDataSaverValue(
  value: string | null | undefined,
): value is DataSaverValue {
  return value === 'on' || value === 'off';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Roh gespeicherte Präferenz: 'on' | 'off' | null (nie gesetzt). */
export function readDataSaverPreference(
  storage: StorageLike | null = defaultStorage(),
): DataSaverValue | null {
  try {
    const stored = storage?.getItem(DATA_SAVER_STORAGE_KEY);
    return isDataSaverValue(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function readDataSaverEnabled(
  storage: StorageLike | null = defaultStorage(),
): boolean {
  return readDataSaverPreference(storage) === 'on';
}

export function storeDataSaverEnabled(
  enabled: boolean,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(DATA_SAVER_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Ohne Speicherzugriff gilt die Auswahl nur für die laufende Sitzung.
  }
}

type ConnectionLike = {
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
} | null;

function defaultConnection(): ConnectionLike {
  if (typeof navigator === 'undefined') return null;
  return (
    (navigator as Navigator & { connection?: ConnectionLike }).connection ??
    null
  );
}

/** Systemeinstellung des Browsers (Network Information API: saveData). */
export function systemDataSaverRequested(
  connection: { saveData?: boolean } | null = defaultConnection(),
): boolean {
  return connection?.saveData === true;
}

/** Connection-Objekt für Live-Updates der Systemeinstellung. */
export function dataSaverConnection(): ConnectionLike {
  return defaultConnection();
}

/**
 * Effektiver Zustand: eine explizit gespeicherte Wahl gewinnt; ohne
 * Speicherung greift automatisch die Systemeinstellung des Browsers.
 */
export function resolveDataSaverActive(
  stored: DataSaverValue | null,
  systemSaveData: boolean,
): boolean {
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return systemSaveData;
}

/** Serverseitig: Cookie der eigenen Einstellung oder Save-Data-Request-Header. */
export function dataSaverRequested(
  cookieValue: string | undefined,
  saveDataHeader: string | null,
): boolean {
  return cookieValue === 'on' || saveDataHeader?.trim().toLowerCase() === 'on';
}

/** Cookie-String zum Setzen/Löschen der serverseitig erkennbaren Einstellung. */
export function dataSaverCookie(active: boolean): string {
  return active
    ? `${DATA_SAVER_COOKIE}=on; path=/; max-age=31536000; SameSite=Lax`
    : `${DATA_SAVER_COOKIE}=; path=/; max-age=0`;
}
