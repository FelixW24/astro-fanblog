// Profilbild-Upload (Profil-Modal und Onboarding): „Profilbild hochladen“
// öffnet das Zuschneide-Modal. Das Bild wird darin ausgewählt, per Ziehen,
// Zoom-Regler und Tastatur zugeschnitten; erst „Übernehmen“ rendert den
// Ausschnitt über den Canvas auf 256×256 und lädt ihn an die API-Route hoch.
// „Profilbild entfernen“ löscht die Datei im Storage. Ohne JavaScript bleibt
// der Datei-Dialog funktionslos, die Route lehnt unkomprimierte Dateien über
// 2 MB ab.

import {
  avatarCropZoomMax,
  avatarCropZoomMin,
  avatarCropZoomStep,
  clampCropOffset,
  cropDisplaySize,
  cropSourceRect,
} from '../lib/avatar-crop';
import { showReaderToast } from './reader-toast';

const maxClientAvatarBytes = 2 * 1024 * 1024;
const avatarTargetSize = 256;
const keyboardPanStep = 8;
const keyboardPanLargeStep = 32;
const allowedAvatarTypes = ['image/jpeg', 'image/png', 'image/webp'];

// Verständliche Meldungen für jede Ablehnung; sie erscheinen als Toast.
const wrongFormatMessage =
  'Das ist kein unterstütztes Bildformat. Bitte wähle eine JPEG-, PNG- oder WebP-Datei.';
const tooLargeMessage =
  'Das Bild ist zu groß. Bitte wähle eine Datei mit maximal 2 MB.';
const unreadableMessage =
  'Das Bild konnte nicht geöffnet werden. Bitte versuche eine andere Datei.';
const processingMessage =
  'Das Bild konnte nicht verarbeitet werden. Bitte versuche eine andere Datei.';
const uploadMessage =
  'Das Profilbild konnte nicht gespeichert werden. Bitte versuche es später erneut.';

interface CropState {
  zoom: number;
  x: number;
  y: number;
}

export interface WireAvatarUploadOptions {
  // Wird nach einem erfolgreichen Upload mit dem Storage-Pfad und nach
  // dem Entfernen mit null aufgerufen (etwa für ein Hidden-Feld im
  // Onboarding, das den Pfad erst mit dem Profil speichert).
  onUploaded?: (path: string | null) => void;
}

async function compressAvatar(
  bitmap: ImageBitmap,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = avatarTargetSize;
    canvas.height = avatarTargetSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas nicht verfügbar');
    context.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      avatarTargetSize,
      avatarTargetSize,
    );
    const webp = await canvasToBlob(canvas, 'image/webp', 0.85);
    if (webp && webp.size <= maxClientAvatarBytes) return webp;
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    if (jpeg && jpeg.size <= maxClientAvatarBytes) return jpeg;
    throw new Error('Komprimierung fehlgeschlagen');
  } catch (error) {
    if (error instanceof Error && error.message !== 'Komprimierung fehlgeschlagen')
      throw error;
    throw new Error(processingMessage, { cause: error });
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function createAvatarImage(url: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'reader-avatar reader-avatar--image';
  image.dataset.avatarImage = '';
  image.alt = '';
  image.width = avatarTargetSize;
  image.height = avatarTargetSize;
  image.src = url;
  return image;
}

export function wireAvatarUpload(
  scope: HTMLElement,
  { onUploaded }: WireAvatarUploadOptions = {},
): void {
  const form = scope.querySelector<HTMLElement>('[data-avatar-upload]');
  const input = form?.querySelector<HTMLInputElement>('[data-avatar-input]');
  const label = form?.querySelector<HTMLLabelElement>('[data-avatar-label]');
  const dialog = form?.querySelector<HTMLDialogElement>(
    '[data-avatar-crop-dialog]',
  );
  const figure = scope.querySelector<HTMLElement>('[data-avatar-figure]');
  // Ohne sichtbaren Button startet der Klick auf das Profilbild selbst den
  // Upload (Profil-Dialog); sonst trägt das Label die Schaltfläche.
  const trigger = label ?? figure;
  if (!form || !input || !trigger || !dialog) return;
  const removeButton = form.querySelector<HTMLButtonElement>(
    '[data-avatar-remove]',
  );
  const empty = dialog.querySelector<HTMLElement>('[data-avatar-crop-empty]');
  const selectButton = dialog.querySelector<HTMLButtonElement>(
    '[data-avatar-crop-select]',
  );
  const frame = dialog.querySelector<HTMLElement>('[data-avatar-crop-frame]');
  const preview = dialog.querySelector<HTMLImageElement>(
    '[data-avatar-crop-image]',
  );
  const zoomRow = dialog.querySelector<HTMLElement>(
    '[data-avatar-crop-controls]',
  );
  const zoomRange = dialog.querySelector<HTMLInputElement>(
    '[data-avatar-crop-zoom]',
  );
  const zoomIn = dialog.querySelector<HTMLButtonElement>(
    '[data-avatar-crop-in]',
  );
  const zoomOut = dialog.querySelector<HTMLButtonElement>(
    '[data-avatar-crop-out]',
  );
  const confirmButton = dialog.querySelector<HTMLButtonElement>(
    '[data-avatar-crop-confirm]',
  );
  if (
    !empty ||
    !selectButton ||
    !frame ||
    !preview ||
    !zoomRow ||
    !zoomRange ||
    !confirmButton
  )
    return;

  let bitmap: ImageBitmap | null = null;
  let previewUrl = '';
  let crop: CropState = { zoom: avatarCropZoomMin, x: 0, y: 0 };
  let pointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  const setBusy = (busy: boolean) => {
    input.disabled = busy;
    if (removeButton) removeButton.disabled = busy;
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
  };

  const post = (data: FormData) =>
    fetch('/api/profil/profilbild', { method: 'POST', body: data }).then(
      async (response) => {
        const body = (await response.json().catch(() => null)) as {
          avatarUrl?: string | null;
          path?: string | null;
          error?: string;
        } | null;
        if (!response.ok || !body || body.error)
          throw new Error(body?.error ?? 'Der Upload ist fehlgeschlagen.');
        return body;
      },
    );

  const viewport = () => frame.clientWidth;

  const applyCrop = () => {
    const display = cropDisplaySize(
      { width: bitmap?.width ?? 1, height: bitmap?.height ?? 1 },
      viewport(),
      crop.zoom,
    );
    crop = {
      ...crop,
      ...clampCropOffset(crop, display, viewport()),
    };
    preview.style.width = `${display.width}px`;
    preview.style.height = `${display.height}px`;
    preview.style.transform = `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`;
    zoomRange.value = String(crop.zoom);
  };

  const setZoom = (zoom: number) => {
    const next = Math.min(
      avatarCropZoomMax,
      Math.max(avatarCropZoomMin, Math.round(zoom * 100) / 100),
    );
    const ratio = crop.zoom > 0 ? next / crop.zoom : 1;
    crop = { zoom: next, x: crop.x * ratio, y: crop.y * ratio };
    applyCrop();
  };

  const releaseCrop = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }
    if (bitmap) {
      bitmap.close();
      bitmap = null;
    }
  };

  // Startzustand: Bildauswahl sichtbar, Zuschnitt noch nicht möglich.
  const resetCrop = () => {
    releaseCrop();
    crop = { zoom: avatarCropZoomMin, x: 0, y: 0 };
    zoomRange.value = String(avatarCropZoomMin);
    empty.removeAttribute('hidden');
    frame.setAttribute('hidden', '');
    zoomRow.setAttribute('hidden', '');
    confirmButton.disabled = true;
  };

  const closeCrop = () => {
    if (dialog.open) dialog.close();
    resetCrop();
    setBusy(false);
  };

  const openCrop = () => {
    resetCrop();
    if (form.getAttribute('aria-busy') === 'true') return;
    dialog.showModal();
    selectButton.focus();
  };

  const showCrop = () => {
    empty.setAttribute('hidden', '');
    frame.removeAttribute('hidden');
    zoomRow.removeAttribute('hidden');
    confirmButton.disabled = false;
    applyCrop();
    frame.focus();
  };

  const loadFile = async (file: File) => {
    bitmap = await createImageBitmap(file);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    await preview.decode().catch(() => undefined);
    crop = { zoom: avatarCropZoomMin, x: 0, y: 0 };
    showCrop();
  };

  const confirmCrop = () => {
    if (!bitmap) return;
    const rect = cropSourceRect(
      { width: bitmap.width, height: bitmap.height },
      viewport(),
      crop.zoom,
      { x: crop.x, y: crop.y },
    );
    setBusy(true);
    confirmButton.disabled = true;
    compressAvatar(bitmap, rect)
      .then((blob) => {
        const upload = new FormData();
        upload.set('action', 'upload');
        upload.set('file', new File([blob], 'avatar', { type: blob.type }));
        return post(upload);
      })
      .then(({ avatarUrl, path }) => {
        dialog.close();
        releaseCrop();
        if (avatarUrl && figure) {
          const current = figure.querySelector<HTMLImageElement>(
            '[data-avatar-image]',
          );
          // Cache-Buster: der Pfad bleibt gleich, der Inhalt ändert sich.
          const url = `${avatarUrl}?version=${Date.now()}`;
          if (current) current.src = url;
          else figure.appendChild(createAvatarImage(url));
          removeButton?.removeAttribute('hidden');
        }
        onUploaded?.(path ?? null);
      })
      .catch((error: unknown) => {
        closeCrop();
        showReaderToast(
          error instanceof Error && error.message !== processingMessage
            ? error.message
            : uploadMessage,
        );
      })
      .finally(() => {
        setBusy(false);
        trigger.focus();
      });
  };

  // „Profilbild entfernen“ löscht die eigene Datei im Storage und meldet
  // null an den Aufrufer (z. B. das Onboarding-Hidden-Feld).
  const removeAvatar = () => {
    setBusy(true);
    const data = new FormData();
    data.set('action', 'remove');
    post(data)
      .then(() => {
        figure?.querySelector('[data-avatar-image]')?.remove();
        removeButton?.setAttribute('hidden', '');
        onUploaded?.(null);
      })
      .catch((error: unknown) => {
        showReaderToast(
          error instanceof Error && error.message
            ? error.message
            : uploadMessage,
        );
      })
      .finally(() => {
        setBusy(false);
        trigger.focus();
      });
  };
  removeButton?.addEventListener('click', removeAvatar);

  // Die Schaltfläche öffnet das Modal statt des Datei-Dialogs; dieser wird
  // erst über „Bild auswählen“ im Modal gefragt. Ist das Profilbild selbst
  // der Auslöser (kein Label), übernimmt es zusätzlich die Tastaturbedienung.
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    openCrop();
  });
  if (trigger !== label) {
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCrop();
      }
    });
  }

  selectButton.addEventListener('click', () => {
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!allowedAvatarTypes.includes(file.type)) {
      showReaderToast(wrongFormatMessage);
      return;
    }
    if (file.size > maxClientAvatarBytes) {
      showReaderToast(tooLargeMessage);
      return;
    }
    loadFile(file).catch(() => {
      releaseCrop();
      empty.removeAttribute('hidden');
      frame.setAttribute('hidden', '');
      zoomRow.setAttribute('hidden', '');
      confirmButton.disabled = true;
      showReaderToast(unreadableMessage);
      selectButton.focus();
    });
  });

  frame.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    crop = {
      ...crop,
      x: crop.x + event.clientX - lastClientX,
      y: crop.y + event.clientY - lastClientY,
    };
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    applyCrop();
  });
  const endPointer = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    frame.releasePointerCapture(event.pointerId);
  };
  frame.addEventListener('pointerup', endPointer);
  frame.addEventListener('pointercancel', endPointer);

  frame.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? keyboardPanLargeStep : keyboardPanStep;
    switch (event.key) {
      case 'ArrowLeft':
        crop = { ...crop, x: crop.x - step };
        break;
      case 'ArrowRight':
        crop = { ...crop, x: crop.x + step };
        break;
      case 'ArrowUp':
        crop = { ...crop, y: crop.y - step };
        break;
      case 'ArrowDown':
        crop = { ...crop, y: crop.y + step };
        break;
      case '+':
      case '=':
        setZoom(crop.zoom + avatarCropZoomStep);
        break;
      case '-':
        setZoom(crop.zoom - avatarCropZoomStep);
        break;
      default:
        return;
    }
    event.preventDefault();
    applyCrop();
  });

  zoomRange.addEventListener('input', () => {
    setZoom(Number(zoomRange.value));
  });
  zoomIn?.addEventListener('click', () =>
    setZoom(crop.zoom + avatarCropZoomStep),
  );
  zoomOut?.addEventListener('click', () =>
    setZoom(crop.zoom - avatarCropZoomStep),
  );

  confirmButton.addEventListener('click', confirmCrop);
  for (const cancel of dialog.querySelectorAll<HTMLButtonElement>(
    '[data-avatar-crop-cancel]',
  )) {
    cancel.addEventListener('click', closeCrop);
  }
  dialog.addEventListener('close', () => {
    // Escape oder Schließen: Nichts wurde hochgeladen.
    resetCrop();
    setBusy(false);
  });
}
