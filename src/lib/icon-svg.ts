// Gemeinsame Formatierung für rohe iconoir-SVG-Strings – bewusst ohne
// Icon-Imports, damit Client-Skripte nur die benötigten SVGs bündeln.

/**
 * Formatiert einen rohen iconoir-SVG-String als inline-SVG: Die vom Paket
 * vorgegebenen Attribute (stroke-width, viewBox) bleiben unverändert; nur
 * Größe, Klasse und die dekorativen Accessibility-Attribute werden ergänzt.
 */
export function formatIcon(
  rawSvg: string,
  size = 18,
  className?: string,
): string {
  const classAttr = className ? ` class="${className}"` : '';
  return rawSvg
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`)
    .replace('<svg', `<svg aria-hidden="true" focusable="false"${classAttr}`);
}

/** Nur der innere Markup (Pfade) eines SVG-Strings, ohne svg-Wrapper. */
export function innerMarkup(rawSvg: string): string {
  return rawSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
