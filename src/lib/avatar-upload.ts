// Serverseitige Validierung von Profilbild-Uploads: Größe, Format und echte
// Dateiart (Magic Bytes statt Dateiendung). Die Nutzer-Obergrenze liegt
// bewusst bei 2 MB; der Client verkleinert vorher auf 256×256, das Limit
// fängt Manipulationen und abgeschaltete Komprimierung ab.

export const maxAvatarUploadBytes = 2 * 1024 * 1024;

const avatarMimeExtensions = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AvatarMime = keyof typeof avatarMimeExtensions;

export function sniffAvatarMime(bytes: Uint8Array): AvatarMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

export function validateAvatarUpload(
  file: { size: number; type: string; name: string },
  bytes: Uint8Array,
): string | null {
  if (file.size <= 0) return 'Bitte wähle eine Bilddatei aus.';
  if (file.size > maxAvatarUploadBytes)
    return 'Das Profilbild darf maximal 2 MB groß sein.';
  if (!sniffAvatarMime(bytes))
    return 'Bitte lade ein Bild im Format JPEG, PNG oder WebP hoch.';
  return null;
}

export function avatarStoragePath(userId: string, mime: AvatarMime): string {
  return `${userId}/avatar.${avatarMimeExtensions[mime]}`;
}

// Nach einem Upload bleiben Dateien anderer Endungen übrig (z. B. der alte
// PNG-Export neben dem neuen WebP). Diese Pfade räumt die Route mit auf.
export function staleAvatarStoragePaths(
  userId: string,
  currentPath: string,
): string[] {
  return (['webp', 'jpeg', 'png'] as const)
    .map((extension) => `${userId}/avatar.${extension}`)
    .filter((path) => path !== currentPath);
}

// Profilbilder werden ueber die eigene App ausgeliefert
// (src/pages/profilbild/[...path].ts), damit der Storage-Endpunkt nicht
// oeffentlich erreichbar sein muss und die URL in jeder Umgebung
// funktioniert — auch wenn PUBLIC_SUPABASE_URL auf 127.0.0.1 zeigt.
export function readerAvatarPublicUrl(path: string): string {
  return `/profilbild/${path}`;
}
