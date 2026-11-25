import { describe, expect, it } from 'vitest';
import {
  defaultProfileSettingsSection,
  findProfileSettingsSection,
  profileSettingsGroups,
  profileSettingsSectionIds,
} from './profile-settings';

describe('profileSettingsGroups', () => {
  it('enthält die vereinbarten Gruppen in stabiler Reihenfolge', () => {
    expect(profileSettingsGroups.map((group) => group.id)).toEqual([
      'profil',
      'sicherheit',
      'darstellung',
      'benachrichtigungen',
      'konto',
    ]);
  });

  it('verwendet eindeutige IDs für Gruppen, Einträge und Sektionen', () => {
    const groupIds = profileSettingsGroups.map((group) => group.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);

    const itemIds = profileSettingsSectionIds();
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it('beschriftet jede Gruppe und jeden Eintrag', () => {
    for (const group of profileSettingsGroups) {
      expect(group.label.trim()).not.toBe('');
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.label.trim()).not.toBe('');
      }
    }
  });

  it('bietet 2FA nicht mehr als Menüpunkt an', () => {
    expect(profileSettingsSectionIds()).not.toContain('zwei-faktor');
    expect(findProfileSettingsSection('zwei-faktor')).toBeNull();
  });

  it('ordnet die destruktiven Aktionen an das Ende des Konto-Bereichs', () => {
    const konto = profileSettingsGroups.find((group) => group.id === 'konto');
    expect(konto?.items.map((item) => item.id)).toEqual([
      'konto-loeschen',
      'abmelden',
    ]);
  });

  it('führt die Benachrichtigungen in einem einzelnen Eintrag', () => {
    const notifications = profileSettingsGroups.find(
      (group) => group.id === 'benachrichtigungen',
    );
    expect(notifications?.items).toEqual([
      { id: 'benachrichtigungen', label: 'Benachrichtigungen' },
    ]);
  });
});

describe('findProfileSettingsSection', () => {
  it('findet einen Eintrag mit seiner Gruppe', () => {
    const section = findProfileSettingsSection('konto-loeschen');
    expect(section?.group.id).toBe('konto');
    expect(section?.item.label).toBe('Konto löschen');
  });

  it('lehnt unbekannte und leere IDs ab', () => {
    expect(findProfileSettingsSection('nicht-vorhanden')).toBeNull();
    expect(findProfileSettingsSection('')).toBeNull();
    expect(findProfileSettingsSection(null)).toBeNull();
  });
});

describe('defaultProfileSettingsSection', () => {
  it('ist eine vorhandene Sektion', () => {
    expect(
      findProfileSettingsSection(defaultProfileSettingsSection),
    ).not.toBeNull();
    expect(profileSettingsSectionIds()).toContain(
      defaultProfileSettingsSection,
    );
  });
});
