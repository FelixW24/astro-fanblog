export interface ProfileSettingsItem {
  id: string;
  label: string;
}

export interface ProfileSettingsGroup {
  id: string;
  label: string;
  items: ProfileSettingsItem[];
}

// Struktur der Profil-Navigation im Einstellungs-Modal. Die Reihenfolge ist
// bewusst an etablierte Einstellungs-Oberflächen angelehnt: Identität zuerst,
// destruktive Aktionen zuletzt.
export const profileSettingsGroups: readonly ProfileSettingsGroup[] = [
  {
    id: 'profil',
    label: 'Profil',
    items: [
      { id: 'persoenliche-informationen', label: 'Persönliche Informationen' },
      { id: 'meine-kommentare', label: 'Meine Kommentare' },
    ],
  },
  {
    id: 'sicherheit',
    label: 'Sicherheit',
    items: [
      { id: 'passwort', label: 'Passwort' },
    ],
  },
  {
    id: 'darstellung',
    label: 'Darstellung',
    items: [{ id: 'darstellung', label: 'Darstellung' }],
  },
  {
    id: 'benachrichtigungen',
    label: 'Benachrichtigungen',
    items: [{ id: 'benachrichtigungen', label: 'Benachrichtigungen' }],
  },
  {
    id: 'konto',
    label: 'Konto',
    items: [
      { id: 'konto-loeschen', label: 'Konto löschen' },
      { id: 'abmelden', label: 'Abmelden' },
    ],
  },
] as const;

export const defaultProfileSettingsSection = 'persoenliche-informationen';

export interface ProfileSettingsSection {
  group: ProfileSettingsGroup;
  item: ProfileSettingsItem;
}

export function findProfileSettingsSection(
  id: string | null,
): ProfileSettingsSection | null {
  if (!id) return null;
  for (const group of profileSettingsGroups) {
    const item = group.items.find((entry) => entry.id === id);
    if (item) return { group, item };
  }
  return null;
}

export function profileSettingsSectionIds(): string[] {
  return profileSettingsGroups.flatMap((group) =>
    group.items.map((item) => item.id),
  );
}
