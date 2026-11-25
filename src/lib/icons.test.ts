import { describe, expect, it } from 'vitest';
import { iconInner, iconNames, renderIcon } from './icons';

describe('icons (iconoir)', () => {
  it('rendert jedes Icon als inline-SVG aus dem iconoir-Paket', () => {
    expect(iconNames.length).toBeGreaterThan(40);
    for (const name of iconNames) {
      const svg = renderIcon(name);
      expect(svg).toMatch(/^<svg /);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain('width="18"');
      expect(svg).toContain('height="18"');
      expect(svg).toMatch(/<\/svg>\s*$/);
    }
  });

  it('übernimmt Größe und Klasse', () => {
    const svg = renderIcon('menu', 22, 'mobile-icon');
    expect(svg).toContain('width="22"');
    expect(svg).toContain('height="22"');
    expect(svg).toContain('class="mobile-icon"');
  });

  it('lässt das Klassen-Attribut weg, wenn keine Klasse übergeben wird', () => {
    expect(renderIcon('bell')).not.toContain('class=');
  });

  it('nutzt die iconoir-Pfade (Stichprobe refresh)', () => {
    expect(renderIcon('refresh')).toContain('M21.8883 13.5');
  });

  it('iconInner liefert nur den inneren Markup ohne svg-Wrapper', () => {
    const inner = iconInner('user');
    expect(inner).not.toContain('<svg');
    expect(inner).toContain('<path');
  });
});
