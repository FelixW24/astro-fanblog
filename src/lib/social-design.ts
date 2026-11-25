export const formats = {
  square: { label: 'Quadrat · 1080 × 1080', width: 1080, height: 1080 },
  portrait: { label: 'Hochformat · 1080 × 1350', width: 1080, height: 1350 },
  story: { label: 'Story · 1080 × 1920', width: 1080, height: 1920 },
} as const;
export const templates = {
  news: {
    label: 'News',
    title: 'Was zählt. Was bleibt.',
    subtitle: 'Die wichtigsten Nachrichten im Blick.',
  },
  match: {
    label: 'Spieltag',
    title: 'FC Example\nvs. Gegner',
    subtitle: 'Datum · Anstoß · Stadion',
  },
  quote: {
    label: 'Zitat',
    title: 'Die Aussage, die hängen bleibt.',
    subtitle: 'Name · Funktion · Quelle',
  },
} as const;
export const logos = {
  horizontal: '/logo/logo-horizontal.svg',
  compact: '/logo/logo-sidebar.svg',
  symbol: '/logo/logo-icon.svg',
} as const;
export interface SocialDesign {
  version: 1;
  template: keyof typeof templates;
  format: keyof typeof formats;
  logo: keyof typeof logos;
  title: string;
  subtitle: string;
  label: string;
  footer: string;
  fontSize: number;
  textY: number;
  imageX: number;
  imageY: number;
  zoom: number;
  image: string;
}
export function createDesign(
  template: keyof typeof templates = 'news',
): SocialDesign {
  return {
    version: 1,
    template,
    format: 'square',
    logo: 'horizontal',
    title: templates[template].title,
    subtitle: templates[template].subtitle,
    label: templates[template].label.toUpperCase(),
    footer: 'LESEN AUF EXAMPLE.COM',
    fontSize: 84,
    textY: 38,
    imageX: 50,
    imageY: 50,
    zoom: 1,
    image: '',
  };
}
const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function parseDesign(input: unknown): SocialDesign {
  if (!input || typeof input !== 'object')
    throw new Error('Ungültiger Entwurf.');
  const d = input as Record<string, unknown>;
  if (
    d.version !== 1 ||
    !Object.hasOwn(templates, String(d.template)) ||
    !Object.hasOwn(formats, String(d.format)) ||
    !Object.hasOwn(logos, String(d.logo)) ||
    !inRange(d.fontSize, 40, 110) ||
    !inRange(d.textY, 30, 58) ||
    !inRange(d.imageX, 0, 100) ||
    !inRange(d.imageY, 0, 100) ||
    !inRange(d.zoom, 1, 3)
  )
    throw new Error('Der Entwurf enthält ungültige Einstellungen.');
  for (const [key, max] of [
    ['title', 180],
    ['subtitle', 240],
    ['label', 40],
    ['footer', 60],
  ] as const) {
    if (typeof d[key] !== 'string' || d[key].length > max)
      throw new Error('Ungültige Textlänge im Entwurf.');
  }
  if (
    typeof d.image !== 'string' ||
    d.image.length > 8_000_000 ||
    (d.image !== '' &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        d.image,
      ))
  )
    throw new Error('Der Entwurf enthält kein unterstütztes Bild.');
  // Copy only known properties; imported JSON never becomes HTML or an external URL.
  return {
    version: 1,
    template: d.template,
    format: d.format,
    logo: d.logo,
    title: d.title,
    subtitle: d.subtitle,
    label: d.label,
    footer: d.footer,
    fontSize: d.fontSize,
    textY: d.textY,
    imageX: d.imageX,
    imageY: d.imageY,
    zoom: d.zoom,
    image: d.image,
  } as SocialDesign;
}
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= maxWidth) {
        line += ` ${word}`;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && measure(line + character) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}
