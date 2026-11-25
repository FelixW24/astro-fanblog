import { describe, expect, it } from 'vitest';
import {
  DATA_SAVER_COOKIE,
  DATA_SAVER_STORAGE_KEY,
  dataSaverCookie,
  dataSaverRequested,
  isDataSaverValue,
  readDataSaverEnabled,
  readDataSaverPreference,
  resolveDataSaverActive,
  storeDataSaverEnabled,
  systemDataSaverRequested,
} from './data-saver';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe('Datensparmodus', () => {
  it('erkennt nur die gültigen Speicherwerte', () => {
    expect(isDataSaverValue('on')).toBe(true);
    expect(isDataSaverValue('off')).toBe(true);
    expect(isDataSaverValue('')).toBe(false);
    expect(isDataSaverValue(null)).toBe(false);
    expect(isDataSaverValue('yes')).toBe(false);
  });

  it('liest die Roh-Präferenz und den aktivierten Zustand', () => {
    expect(readDataSaverPreference(fakeStorage())).toBeNull();
    expect(
      readDataSaverPreference(fakeStorage({ [DATA_SAVER_STORAGE_KEY]: 'off' })),
    ).toBe('off');
    expect(
      readDataSaverPreference(fakeStorage({ [DATA_SAVER_STORAGE_KEY]: 'on' })),
    ).toBe('on');
    expect(readDataSaverEnabled(fakeStorage())).toBe(false);
    expect(
      readDataSaverEnabled(fakeStorage({ [DATA_SAVER_STORAGE_KEY]: 'on' })),
    ).toBe(true);
    expect(
      readDataSaverEnabled(fakeStorage({ [DATA_SAVER_STORAGE_KEY]: 'bogus' })),
    ).toBe(false);
  });

  it('speichert die Einstellung dauerhaft', () => {
    const storage = fakeStorage();
    storeDataSaverEnabled(true, storage);
    expect(storage.data.get(DATA_SAVER_STORAGE_KEY)).toBe('on');
    expect(readDataSaverEnabled(storage)).toBe(true);
    storeDataSaverEnabled(false, storage);
    expect(readDataSaverEnabled(storage)).toBe(false);
  });

  it('fällt bei blockiertem Speicher auf „aus“ zurück', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readDataSaverPreference(broken)).toBeNull();
    expect(readDataSaverEnabled(broken)).toBe(false);
    expect(() => storeDataSaverEnabled(true, broken)).not.toThrow();
    expect(readDataSaverPreference(null)).toBeNull();
    expect(() => storeDataSaverEnabled(true, null)).not.toThrow();
  });

  it('erkennt die Systemeinstellung des Browsers', () => {
    expect(systemDataSaverRequested({ saveData: true })).toBe(true);
    expect(systemDataSaverRequested({ saveData: false })).toBe(false);
    expect(systemDataSaverRequested({})).toBe(false);
    expect(systemDataSaverRequested(null)).toBe(false);
  });

  it('lässt die Systemeinstellung automatisch greifen, bis etwas gespeichert ist', () => {
    // System an, nichts gespeichert: automatisch aktiv.
    expect(resolveDataSaverActive(null, true)).toBe(true);
    // Explizite Wahl schlägt die Systemeinstellung.
    expect(resolveDataSaverActive('on', false)).toBe(true);
    expect(resolveDataSaverActive('off', true)).toBe(false);
    // System aus, nichts gespeichert: aus.
    expect(resolveDataSaverActive(null, false)).toBe(false);
  });

  it('erkennt serverseitig Cookie und Save-Data-Header', () => {
    expect(dataSaverRequested('on', null)).toBe(true);
    expect(dataSaverRequested(undefined, 'on')).toBe(true);
    expect(dataSaverRequested(undefined, 'On')).toBe(true);
    expect(dataSaverRequested('off', null)).toBe(false);
    expect(dataSaverRequested(undefined, null)).toBe(false);
    expect(dataSaverRequested('off', 'on')).toBe(true);
  });

  it('baut den Cookie-String zum Setzen und Löschen', () => {
    expect(dataSaverCookie(true)).toBe(
      `${DATA_SAVER_COOKIE}=on; path=/; max-age=31536000; SameSite=Lax`,
    );
    expect(dataSaverCookie(false)).toBe(
      `${DATA_SAVER_COOKIE}=; path=/; max-age=0`,
    );
  });
});
