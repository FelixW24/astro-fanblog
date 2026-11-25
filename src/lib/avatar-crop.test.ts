import { describe, expect, it } from 'vitest';
import {
  avatarCropZoomMax,
  clampCropOffset,
  cropDisplaySize,
  cropSourceRect,
} from './avatar-crop';

// Bildschirm-Koordinaten entstehen aus Teilungen und sind nie binär exakt;
// daher vergleichen wir die Komponenten mit Toleranz statt toEqual.
const expectRect = (
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
) => {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
};

describe('cropDisplaySize', () => {
  it('füllt den Rahmen bei Zoom 1 vollständig (cover)', () => {
    expectRect(
      { ...cropDisplaySize({ width: 400, height: 200 }, 288, 1), x: 0, y: 0 },
      { x: 0, y: 0, width: 576, height: 288 },
    );
  });

  it('vergrößert proportional zum Zoom', () => {
    expectRect(
      { ...cropDisplaySize({ width: 400, height: 200 }, 288, 2), x: 0, y: 0 },
      { x: 0, y: 0, width: 1152, height: 576 },
    );
  });

  it('skaliert kleine Bilder auf den Rahmen hoch', () => {
    expectRect(
      { ...cropDisplaySize({ width: 100, height: 100 }, 288, 1), x: 0, y: 0 },
      { x: 0, y: 0, width: 288, height: 288 },
    );
  });
});

describe('clampCropOffset', () => {
  it('lässt zentrierte Versätze unverändert', () => {
    expect(clampCropOffset({ x: 0, y: 0 }, { width: 576, height: 288 }, 288))
      .toEqual({ x: 0, y: 0 });
  });

  it('klemmt Versätze auf den Randüberstand', () => {
    const clamped = clampCropOffset(
      { x: 999, y: -999 },
      { width: 576, height: 288 },
      288,
    );
    expect(clamped.x).toBeCloseTo(144, 6);
    expect(clamped.y).toBeCloseTo(0, 6);
  });

  it('erlaubt keine Verschiebung, wenn Achse und Rahmen gleich groß sind', () => {
    expect(clampCropOffset({ x: 40, y: 0 }, { width: 288, height: 400 }, 288))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('cropSourceRect', () => {
  it('liefert den quadratischen Mittelzuschnitt bei Zoom 1', () => {
    expectRect(
      cropSourceRect({ width: 400, height: 200 }, 288, 1, { x: 0, y: 0 }),
      { x: 100, y: 0, width: 200, height: 200 },
    );
  });

  it('verschiebt den Ausschnitt mit dem Versatz', () => {
    expectRect(
      cropSourceRect({ width: 400, height: 200 }, 288, 1, { x: 144, y: 0 }),
      { x: 0, y: 0, width: 200, height: 200 },
    );
  });

  it('verkleinert den Ausschnitt beim Zoomen um die Mitte', () => {
    expectRect(
      cropSourceRect({ width: 400, height: 200 }, 288, 2, { x: 0, y: 0 }),
      { x: 150, y: 50, width: 100, height: 100 },
    );
  });

  it('klemmt unzulässige Versätze, bevor der Ausschnitt entsteht', () => {
    expectRect(
      cropSourceRect(
        { width: 400, height: 200 },
        288,
        avatarCropZoomMax,
        { x: 9999, y: 9999 },
      ),
      { x: 0, y: 0, width: 50, height: 50 },
    );
  });

  it('bleibt bei quadratischen Bildern unabhängig vom Zoom zentriert', () => {
    expectRect(
      cropSourceRect({ width: 300, height: 300 }, 288, 3, { x: 0, y: 0 }),
      { x: 100, y: 100, width: 100, height: 100 },
    );
  });
});
