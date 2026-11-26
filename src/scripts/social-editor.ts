import {
  createDesign,
  formats,
  logos,
  parseDesign,
  templates,
  wrapText,
} from '../lib/social-design';

const root = document.querySelector<HTMLElement>('[data-social-editor]');
if (root) void setup(root);

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error('Das Bild konnte nicht gelesen werden.');
  return image;
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
async function setup(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('form')!;
  const canvas = root.querySelector('canvas')!;
  const context = canvas.getContext('2d');
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const exportButton = root.querySelector<HTMLButtonElement>('[data-export]')!;
  const saveButton = root.querySelector<HTMLButtonElement>('[data-save]')!;
  const imageInput = root.querySelector<HTMLInputElement>('[data-image]')!;
  const openInput = root.querySelector<HTMLInputElement>('[data-open]')!;
  if (!context) {
    status.textContent = 'Dein Browser unterstützt den Bildeditor nicht.';
    return;
  }
  const ctx = context;
  let design = createDesign();
  let background: HTMLImageElement | null = null;
  let dirty = false;
  let busy = false;
  let ready = false;
  let brandImages: Record<string, HTMLImageElement> = {};
  const message = (text: string) => {
    status.textContent = text;
  };
  const controls = () => {
    exportButton.disabled = !ready || busy;
    saveButton.disabled = !ready || busy;
    form
      .querySelectorAll<
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | HTMLButtonElement
      >('input,select,textarea,button')
      .forEach((el) => {
        el.disabled = busy;
      });
    openInput.disabled = busy;
  };
  const sync = () => {
    for (const [key, value] of Object.entries(design)) {
      const field = form.elements.namedItem(key);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
        field.value = String(value);
    }
  };
  function textBlock(
    text: string,
    size: number,
    y: number,
    height: number,
    weight: number,
  ) {
    let lines: string[];
    do {
      ctx.font = `${weight} ${size}px "Inter Variable", Arial, sans-serif`;
      lines = wrapText(text, 936, (value) => ctx.measureText(value).width);
      if (size <= 14 && lines.length * size * 1.16 > height) {
        lines = wrapText(
          text.replace(/\s+/g, ' '),
          936,
          (value) => ctx.measureText(value).width,
        );
      }
      if (lines.length * size * 1.16 <= height || size <= 14) break;
      size -= 1;
    } while (size > 0);
    lines.forEach((line, index) =>
      ctx.fillText(line, 72, y + index * size * 1.16),
    );
    return lines.length * size * 1.16;
  }
  function render() {
    if (!ready) return;
    const { width, height } = formats[design.format];
    canvas.width = width;
    canvas.height = height;
    const dark = design.template === 'quote' || Boolean(background);
    ctx.fillStyle = dark ? '#171a1d' : '#f7f7f5';
    ctx.fillRect(0, 0, width, height);
    if (background) {
      const scale =
        Math.max(
          width / background.naturalWidth,
          height / background.naturalHeight,
        ) * design.zoom;
      const w = background.naturalWidth * scale,
        h = background.naturalHeight * scale;
      ctx.drawImage(
        background,
        ((width - w) * design.imageX) / 100,
        ((height - h) * design.imageY) / 100,
        w,
        h,
      );
      ctx.fillStyle = 'rgba(16, 18, 30, 0.72)';
      ctx.fillRect(0, 0, width, height);
    }
    // Existing outlined brand SVGs keep the logo independent of installed fonts.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(48, 44, 420, 112);
    const logo = brandImages[design.logo];
    const scale = Math.min(370 / logo.naturalWidth, 88 / logo.naturalHeight);
    ctx.drawImage(
      logo,
      64,
      56,
      logo.naturalWidth * scale,
      logo.naturalHeight * scale,
    );
    ctx.textBaseline = 'top';
    ctx.fillStyle = dark ? '#f4f4f2' : '#151719';
    ctx.font = '600 21px "Inter Variable", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('EXAMPLE.COM', 1008, 88);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#006284';
    ctx.fillRect(72, 190, 936, 5);
    textBlock(design.label, 26, 230, 76, 700);
    const titleY = (height * design.textY) / 100;
    ctx.fillStyle = dark ? '#f4f4f2' : '#151719';
    const title =
      design.template === 'quote' ? `„${design.title}“` : design.title;
    const available = height - titleY - 250;
    const used = textBlock(
      title,
      design.fontSize,
      titleY,
      available * 0.68,
      800,
    );
    textBlock(
      design.subtitle,
      30,
      titleY + used + 32,
      Math.max(60, available - used),
      500,
    );
    ctx.fillStyle = '#006284';
    ctx.fillRect(72, height - 156, 84, 8);
    ctx.fillStyle = dark ? '#f4f4f2' : '#151719';
    textBlock(design.footer, 24, height - 112, 80, 700);
    canvas.setAttribute(
      'aria-label',
      `Vorschau: ${design.label}. ${design.title}. ${design.subtitle}. ${design.footer}`,
    );
  }
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', (event) => {
    const field = event.target;
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ) ||
      !field.name
    )
      return;
    if (field.name === 'template') {
      const template = field.value as keyof typeof templates;
      design = {
        ...design,
        template,
        label: templates[template].label.toUpperCase(),
      };
    } else {
      design = parseDesign({
        ...design,
        [field.name]:
          field.type === 'range' ? Number(field.value) : field.value,
      });
    }
    dirty = true;
    sync();
    render();
    message('Änderungen noch nicht als Entwurf gespeichert.');
  });
  async function perform(task: () => Promise<void>) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await task();
    } catch (error) {
      message(
        error instanceof Error
          ? error.message
          : 'Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      busy = false;
      controls();
    }
  }
  imageInput.addEventListener(
    'change',
    () =>
      void perform(async () => {
        const file = imageInput.files?.[0];
        if (!file) return;
        imageInput.value = '';
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 5_000_000
        )
          throw new Error(
            'Bitte PNG, JPG oder WebP mit maximal 5 MB auswählen.',
          );
        message('Bild wird geladen …');
        const bitmap = await createImageBitmap(file);
        try {
          // Normalize uploads and bound draft size / memory for subsequent edits.
          const scale = Math.min(
            1,
            2400 / Math.max(bitmap.width, bitmap.height),
          );
          const buffer = document.createElement('canvas');
          buffer.width = Math.max(1, Math.round(bitmap.width * scale));
          buffer.height = Math.max(1, Math.round(bitmap.height * scale));
          const bctx = buffer.getContext('2d');
          if (!bctx) throw new Error('Bildverarbeitung nicht verfügbar.');
          bctx.fillStyle = '#171a1d';
          bctx.fillRect(0, 0, buffer.width, buffer.height);
          bctx.drawImage(bitmap, 0, 0, buffer.width, buffer.height);
          const data = buffer.toDataURL('image/jpeg', 0.9);
          const loaded = await loadImage(data);
          design = { ...design, image: data, imageX: 50, imageY: 50, zoom: 1 };
          background = loaded;
          dirty = true;
          sync();
          render();
          message('Bild eingefügt. Entwurf speichern, um es zu behalten.');
        } finally {
          bitmap.close();
        }
      }),
  );
  root.querySelector('[data-remove-image]')!.addEventListener('click', () => {
    design.image = '';
    background = null;
    dirty = true;
    render();
    message('Hintergrundbild entfernt.');
  });
  exportButton.addEventListener(
    'click',
    () =>
      void perform(async () => {
        render();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        if (!blob)
          throw new Error(
            'PNG konnte nicht erstellt werden. Bitte erneut versuchen.',
          );
        download(blob, `astro-fanblog-${design.template}-${design.format}.png`);
        message(
          `PNG erstellt · ${formats[design.format].width} × ${formats[design.format].height} Pixel.`,
        );
      }),
  );
  saveButton.addEventListener('click', () => {
    download(
      new Blob([JSON.stringify(design)], { type: 'application/json' }),
      'astro-fanblog-social-entwurf.json',
    );
    dirty = false;
    message(
      'Entwurf als Datei heruntergeladen. Über „Entwurf öffnen“ weiterbearbeiten.',
    );
  });
  openInput.addEventListener(
    'change',
    () =>
      void perform(async () => {
        const file = openInput.files?.[0];
        if (!file) return;
        openInput.value = '';
        if (
          dirty &&
          !window.confirm(
            'Ungespeicherte Änderungen durch den Entwurf ersetzen?',
          )
        )
          return;
        if (file.size > 9_000_000)
          throw new Error('Die Entwurfsdatei ist zu groß (maximal 9 MB).');
        const next = parseDesign(JSON.parse(await file.text()));
        const loaded = next.image ? await loadImage(next.image) : null;
        design = next;
        background = loaded;
        dirty = false;
        sync();
        render();
        message('Entwurf geöffnet.');
      }),
  );
  window.addEventListener('beforeunload', (event) => {
    if (dirty) event.preventDefault();
  });
  try {
    await document.fonts.ready;
    await Promise.all(
      [500, 600, 700, 800].map((weight) =>
        document.fonts.load(`${weight} 32px "Inter Variable"`),
      ),
    );
    brandImages = Object.fromEntries(
      await Promise.all(
        Object.entries(logos).map(async ([key, url]) => [
          key,
          await loadImage(url),
        ]),
      ),
    );
    ready = true;
    controls();
    render();
  } catch {
    message(
      'Markenassets konnten nicht geladen werden. Bitte lade die Seite neu.',
    );
  }
}
