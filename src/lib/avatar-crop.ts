// Zuschnitt-Mathematik für das Profilbild: Der Rahmen ist quadratisch, das
// Bild deckt ihn bei Zoom 1 vollständig ab (cover). Alle Funktionen sind
// rein und damit in Unit-Tests ohne DOM prüfbar.

export const avatarCropZoomMin = 1;
export const avatarCropZoomMax = 4;
export const avatarCropZoomStep = 0.1;

export interface CropSize {
  width: number;
  height: number;
}

export interface CropOffset {
  x: number;
  y: number;
}

export interface CropRect extends CropSize, CropOffset {}

// Anzeigegröße des Bildes im Rahmen: Zoom 1 entspricht cover, danach wächst
// der Ausschnitt proportional. Das kürzere Bildformat füllt den Rahmen exakt.
export function cropDisplaySize(
  image: CropSize,
  viewport: number,
  zoom: number,
): CropSize {
  const scale = (zoom * viewport) / Math.min(image.width, image.height);
  return { width: image.width * scale, height: image.height * scale };
}

// Der Verschluss darf nie zeigen, dass das Bild den Rahmen nicht füllt: Beide
// Achsen werden so geklemmt, dass der Rahmen komplett im Bild liegt.
export function clampCropOffset(
  offset: CropOffset,
  display: CropSize,
  viewport: number,
): CropOffset {
  const limitX = Math.max(0, (display.width - viewport) / 2);
  const limitY = Math.max(0, (display.height - viewport) / 2);
  return {
    x: Math.min(limitX, Math.max(-limitX, offset.x)),
    y: Math.min(limitY, Math.max(-limitY, offset.y)),
  };
}

// Der sichtbare Rahmen in Bildkoordinaten; drawImage übernimmt dieses Rechteck
// als Quelle. Bei Zoom 1 und zentriertem Versatz entsteht der Mittelzuschnitt.
export function cropSourceRect(
  image: CropSize,
  viewport: number,
  zoom: number,
  offset: CropOffset,
): CropRect {
  const display = cropDisplaySize(image, viewport, zoom);
  const clamped = clampCropOffset(offset, display, viewport);
  const scale = display.width / image.width;
  const originX = (viewport - display.width) / 2 + clamped.x;
  const originY = (viewport - display.height) / 2 + clamped.y;
  return {
    x: -originX / scale,
    y: -originY / scale,
    width: viewport / scale,
    height: viewport / scale,
  };
}
