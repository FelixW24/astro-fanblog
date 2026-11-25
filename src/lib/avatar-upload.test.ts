import { describe, expect, it } from 'vitest';
import {
  avatarStoragePath,
  maxAvatarUploadBytes,
  sniffAvatarMime,
  staleAvatarStoragePaths,
  validateAvatarUpload,
} from './avatar-upload';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('sniffAvatarMime', () => {
  it('erkennt JPEG, PNG und WebP an den Magic Bytes', () => {
    expect(sniffAvatarMime(jpegBytes)).toBe('image/jpeg');
    expect(sniffAvatarMime(pngBytes)).toBe('image/png');
    expect(sniffAvatarMime(webpBytes)).toBe('image/webp');
  });

  it('lehnt andere Inhalte ab', () => {
    expect(sniffAvatarMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
    expect(
      sniffAvatarMime(new TextEncoder().encode('<script>alert(1)</script>')),
    ).toBeNull();
    expect(sniffAvatarMime(new Uint8Array())).toBeNull();
  });

  it('akzeptiert keine abgeschnittenen Header', () => {
    expect(sniffAvatarMime(webpBytes.slice(0, 11))).toBeNull();
  });
});

describe('validateAvatarUpload', () => {
  it('akzeptiert erlaubte Bilder unterhalb des Limits', () => {
    expect(
      validateAvatarUpload(
        { size: 1024, type: 'image/jpeg', name: 'bild.jpg' },
        jpegBytes,
      ),
    ).toBeNull();
  });

  it('lehnt leere Dateien ab', () => {
    expect(
      validateAvatarUpload(
        { size: 0, type: 'image/jpeg', name: 'bild.jpg' },
        new Uint8Array(),
      ),
    ).toBe('Bitte wähle eine Bilddatei aus.');
  });

  it('lehnt Dateien über 2 MB ab', () => {
    expect(
      validateAvatarUpload(
        { size: maxAvatarUploadBytes + 1, type: 'image/png', name: 'bild.png' },
        pngBytes,
      ),
    ).toBe('Das Profilbild darf maximal 2 MB groß sein.');
  });

  it('vertraut nicht der deklarierten Dateiendung', () => {
    expect(
      validateAvatarUpload(
        { size: 512, type: 'image/png', name: 'bild.png' },
        jpegBytes,
      ),
    ).toBeNull();
    expect(
      validateAvatarUpload(
        { size: 512, type: 'image/jpeg', name: 'bild.jpg' },
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      ),
    ).toBe('Bitte lade ein Bild im Format JPEG, PNG oder WebP hoch.');
  });
});

describe('avatarStoragePath', () => {
  it('legt genau einen Dateinamen pro Nutzer und Format fest', () => {
    expect(avatarStoragePath('abc-123', 'image/webp')).toBe(
      'abc-123/avatar.webp',
    );
    expect(avatarStoragePath('abc-123', 'image/jpeg')).toBe(
      'abc-123/avatar.jpeg',
    );
  });
});

describe('staleAvatarStoragePaths', () => {
  it('listet alle Formate außer dem aktuellen Pfad', () => {
    expect(
      staleAvatarStoragePaths('abc-123', 'abc-123/avatar.webp'),
    ).toEqual(['abc-123/avatar.jpeg', 'abc-123/avatar.png']);
  });
});
