import { renderMarkdown } from '../lib/render-markdown';
import { formatBerlinDateTimeLocal } from '../lib/date-time';
import { parseMarkdownImport } from '../lib/markdown-import';
import { safeArticleHref } from '../lib/article-markup';

const form = document.querySelector<HTMLFormElement>('#article-form');
const titleInput = document.querySelector<HTMLInputElement>('#article-title');
const slugInput = document.querySelector<HTMLInputElement>('#article-slug');
const excerptInput =
  document.querySelector<HTMLTextAreaElement>('#article-excerpt');
const contentInput =
  document.querySelector<HTMLTextAreaElement>('#article-content');
const seoTitleInput = document.querySelector<HTMLInputElement>('#seo-title');
const seoDescriptionInput =
  document.querySelector<HTMLTextAreaElement>('#seo-description');
const tagsInput = document.querySelector<HTMLInputElement>('#article-tags');
const sourceInput = document.querySelector<HTMLTextAreaElement>('#source-urls');
const categoryInput =
  document.querySelector<HTMLSelectElement>('[name="category"]');
const authorInput = document.querySelector<HTMLInputElement>('[name="author"]');
const readMinutesInput =
  document.querySelector<HTMLInputElement>('#read-minutes');
const coverUrlInput =
  document.querySelector<HTMLInputElement>('#cover-image-url');
const coverAltInput =
  document.querySelector<HTMLTextAreaElement>('#cover-image-alt');
const preview = document.querySelector<HTMLElement>(
  '[data-editor-panel="preview"]',
);
const saveState = document.querySelector<HTMLElement>('#editor-save-state');
const validationNotice = document.querySelector<HTMLElement>(
  '[data-editor-validation-notice]',
);
const markdownFileInput = document.querySelector<HTMLInputElement>(
  '[data-markdown-file]',
);
const markdownImportStatus = document.querySelector<HTMLElement>(
  '[data-markdown-import-status]',
);
const editorDialog = document.querySelector<HTMLDialogElement>(
  '[data-editor-dialog]',
);
const dialogTitle = editorDialog?.querySelector<HTMLElement>(
  '[data-editor-dialog-title]',
);
const dialogDescription = editorDialog?.querySelector<HTMLElement>(
  '[data-editor-dialog-description]',
);
const dialogForm = editorDialog?.querySelector<HTMLFormElement>(
  '[data-editor-dialog-form]',
);
const dialogField = editorDialog?.querySelector<HTMLElement>(
  '[data-editor-dialog-field]',
);
const dialogInput = editorDialog?.querySelector<HTMLInputElement>(
  '[data-editor-dialog-input]',
);
const dialogError = editorDialog?.querySelector<HTMLElement>(
  '#editor-dialog-error',
);
const dialogCancel = editorDialog?.querySelector<HTMLButtonElement>(
  '[data-editor-dialog-cancel]',
);
const dialogSubmit = editorDialog?.querySelector<HTMLButtonElement>(
  '[data-editor-dialog-submit]',
);

type DialogOptions = {
  title: string;
  description: string;
  submitLabel: string;
  initialValue?: string;
};

const openEditorDialog = (options: DialogOptions): Promise<string | null> => {
  if (
    !editorDialog ||
    !dialogTitle ||
    !dialogDescription ||
    !dialogForm ||
    !dialogField ||
    !dialogInput ||
    !dialogError ||
    !dialogCancel ||
    !dialogSubmit ||
    editorDialog.open
  )
    return Promise.resolve(null);

  const hasInput = options.initialValue !== undefined;
  dialogTitle.textContent = options.title;
  dialogDescription.textContent = options.description;
  dialogSubmit.textContent = options.submitLabel;
  dialogField.hidden = !hasInput;
  dialogInput.required = hasInput;
  dialogInput.disabled = !hasInput;
  dialogInput.value = options.initialValue ?? '';
  dialogError.hidden = true;
  dialogInput.removeAttribute('aria-invalid');

  return new Promise((resolve) => {
    const finish = (result: string | null) => {
      dialogForm.removeEventListener('submit', onSubmit);
      dialogCancel.removeEventListener('click', onCancel);
      dialogInput.removeEventListener('input', onInput);
      editorDialog.removeEventListener('cancel', onDismiss);
      if (editorDialog.open) editorDialog.close();
      resolve(result);
    };
    const onSubmit = (event: SubmitEvent) => {
      event.preventDefault();
      const value = dialogInput.value.trim();
      if (hasInput && (!safeArticleHref(value) || /[()\s]/.test(value))) {
        dialogError.hidden = false;
        dialogInput.setAttribute('aria-invalid', 'true');
        dialogInput.focus();
        return;
      }
      finish(hasInput ? value : 'confirmed');
    };
    const onCancel = () => finish(null);
    const onInput = () => {
      dialogError.hidden = true;
      dialogInput.removeAttribute('aria-invalid');
    };
    // Esc löft 'cancel' (synchron) aus; das asynchron nachlaufende 'close'-Event
    // darf nicht in die nächste Dialog-Session geraten und diese sofort schließen.
    const onDismiss = () => finish(null);
    dialogForm.addEventListener('submit', onSubmit);
    dialogCancel.addEventListener('click', onCancel);
    dialogInput.addEventListener('input', onInput);
    editorDialog.addEventListener('cancel', onDismiss);
    editorDialog.showModal();
    (hasInput ? dialogInput : dialogCancel).focus();
  });
};
const autoSlug = form?.dataset.autoSlug === 'true';
const wizardPanels = Array.from(
  document.querySelectorAll<HTMLElement>('[data-wizard-step]'),
);
const wizardStepNames = ['Grundlagen', 'Inhalt', 'Details', 'Abschluss'];
const wizardNextLabels = [
  'Weiter zu Inhalt →',
  'Weiter zu Details →',
  'Weiter zum Abschluss →',
];
let currentWizardStep = 1;
let slugChanged = !autoSlug;
let saveTimer = 0;

const cancelScheduledDraftSave = () => {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
};

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const wordsIn = (value: string) =>
  value.trim() ? value.trim().split(/\s+/).length : 0;
const readingTime = () =>
  Math.max(1, Math.ceil(wordsIn(contentInput?.value ?? '') / 220));

const showImportStatus = (
  message: string,
  variant: 'success' | 'warning' | 'error',
) => {
  if (!markdownImportStatus) return;
  markdownImportStatus.hidden = false;
  markdownImportStatus.className = `markdown-import-status markdown-import-status--${variant}`;
  markdownImportStatus.textContent = message;
};

const showWizardStep = (step: number, moveFocus = true) => {
  const nextStep = Math.min(4, Math.max(1, step));
  currentWizardStep = nextStep;
  if (form) form.dataset.currentStep = String(nextStep);
  wizardPanels.forEach((panel) => {
    panel.hidden = Number(panel.dataset.wizardStep) !== nextStep;
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-wizard-go]')
    .forEach((button) => {
      const buttonStep = Number(button.dataset.wizardGo);
      if (buttonStep === nextStep) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button
        .closest('li')
        ?.classList.toggle('is-complete', buttonStep < nextStep);
    });

  const previousButton = document.querySelector<HTMLButtonElement>(
    '[data-wizard-previous]',
  );
  const nextButton =
    document.querySelector<HTMLButtonElement>('[data-wizard-next]');
  const submitButton = document.querySelector<HTMLButtonElement>(
    '[data-wizard-submit]',
  );
  if (previousButton) previousButton.hidden = nextStep === 1;
  if (nextButton) {
    nextButton.hidden = nextStep === 4;
    nextButton.textContent = wizardNextLabels[nextStep - 1] ?? 'Weiter →';
  }
  if (submitButton) submitButton.hidden = nextStep !== 4;

  const position = document.querySelector<HTMLElement>(
    '[data-wizard-position]',
  );
  const announcement = document.querySelector<HTMLElement>(
    '[data-wizard-announcement]',
  );
  const stepText = `Schritt ${nextStep} von 4`;
  if (position) position.textContent = stepText;
  if (announcement)
    announcement.textContent = `${stepText}: ${wizardStepNames[nextStep - 1]}`;

  if (moveFocus) {
    const heading = wizardPanels
      .find((panel) => Number(panel.dataset.wizardStep) === nextStep)
      ?.querySelector<HTMLElement>('h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }
};

const firstInvalidField = (step?: number) => {
  const panels = step
    ? wizardPanels.filter((panel) => Number(panel.dataset.wizardStep) === step)
    : wizardPanels;
  const fields = panels.flatMap((panel) =>
    Array.from(
      panel.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('input, textarea, select'),
    ),
  );
  return fields.find((field) => field.willValidate && !field.checkValidity());
};

let lastInvalidField:
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;

const clearValidationNotice = () => {
  if (validationNotice) validationNotice.hidden = true;
  lastInvalidField?.removeAttribute('aria-invalid');
  lastInvalidField = undefined;
};

const showValidationNotice = (
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
) => {
  if (!validationNotice) return;
  lastInvalidField?.removeAttribute('aria-invalid');
  lastInvalidField = field;
  field.setAttribute('aria-invalid', 'true');
  const label =
    field
      .closest('label')
      ?.querySelector('span')
      ?.firstChild?.textContent?.trim() || field.name;
  const issue = field.validity.valueMissing
    ? `Bitte fülle „${label}“ aus.`
    : field.validity.tooShort
      ? `„${label}“ ist zu kurz.`
      : `Bitte prüfe „${label}“.`;
  validationNotice.textContent = issue;
  validationNotice.hidden = false;
};

const validateWizardStep = (step: number) => {
  const invalid = firstInvalidField(step);
  if (!invalid) {
    clearValidationNotice();
    return true;
  }
  showWizardStep(step, false);
  showValidationNotice(invalid);
  invalid.focus();
  return false;
};

const goToWizardStep = (target: number) => {
  if (target > currentWizardStep) {
    for (let step = currentWizardStep; step < target; step += 1) {
      if (!validateWizardStep(step)) return;
    }
  }
  showWizardStep(target);
};

const setCount = (selector: string, value: string, max: number) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.textContent = `${value.length}/${max}`;
  element.classList.toggle('count-warning', value.length > max * 0.9);
};

const renderPreview = () => {
  if (!preview || !contentInput) return;
  preview.innerHTML = renderMarkdown(contentInput.value);
  if (!preview.innerHTML.trim()) {
    const empty = document.createElement('div');
    empty.className = 'content-preview__empty';
    empty.textContent = 'Noch kein Inhalt vorhanden.';
    preview.append(empty);
  }
};

const updateChecklist = () => {
  const checks = {
    title:
      (titleInput?.value.trim().length ?? 0) >= 5 && Boolean(slugInput?.value),
    excerpt: (excerptInput?.value.trim().length ?? 0) >= 80,
    content: wordsIn(contentInput?.value ?? '') >= 100,
    image: Boolean(coverUrlInput?.value && coverAltInput?.value.trim()),
    seo:
      (seoTitleInput?.value.length ?? 0) >= 30 &&
      (seoDescriptionInput?.value.length ?? 0) >= 100,
  };
  Object.entries(checks).forEach(([name, done]) =>
    document
      .querySelector(`[data-check="${name}"]`)
      ?.classList.toggle('is-done', done),
  );
  const state = document.querySelector<HTMLElement>(
    '[data-check-label="headline"]',
  );
  if (state)
    state.textContent = checks.title && checks.excerpt ? 'Bereit' : 'Offen';
};

const updateCover = () => {
  const wrapper = document.querySelector<HTMLElement>('[data-cover-preview]');
  const image = wrapper?.querySelector('img');
  const placeholder = wrapper?.querySelector('span');
  if (!(image instanceof HTMLImageElement)) return;
  const url = coverUrlInput?.value.trim() ?? '';
  if (!url) {
    image.hidden = true;
    image.removeAttribute('src');
    placeholder?.removeAttribute('hidden');
    return;
  }
  image.src = url;
  image.alt = coverAltInput?.value ?? '';
  image.hidden = false;
  placeholder?.setAttribute('hidden', '');
  image.onerror = () => {
    image.hidden = true;
    if (placeholder) {
      placeholder.removeAttribute('hidden');
      placeholder.textContent = 'Bild konnte nicht geladen werden';
    }
  };
};

const updateUi = () => {
  const title = titleInput?.value ?? '';
  const excerpt = excerptInput?.value ?? '';
  const content = contentInput?.value ?? '';
  setCount('#title-count', title, 180);
  setCount('#excerpt-count', excerpt, 360);
  setCount('#seo-title-count', seoTitleInput?.value ?? '', 70);
  setCount('#seo-description-count', seoDescriptionInput?.value ?? '', 180);
  const wordCount = wordsIn(content);
  const wordLabel = document.querySelector('#editor-word-count');
  const stats = document.querySelector('#content-stats');
  if (wordLabel) wordLabel.textContent = `${wordCount} Wörter`;
  if (stats)
    stats.textContent = `${content.length} Zeichen · ca. ${readingTime()} Min. Lesezeit`;

  const tagCount = (tagsInput?.value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean).length;
  const sourceCount = (sourceInput?.value ?? '')
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean).length;
  const tagLabel = document.querySelector('#tag-count');
  const sourceLabel = document.querySelector('#source-count');
  if (tagLabel) tagLabel.textContent = `${tagCount}/10`;
  if (sourceLabel) sourceLabel.textContent = `${sourceCount}/10`;

  const previewTitle = document.querySelector('[data-seo-title]');
  const previewDescription = document.querySelector('[data-seo-description]');
  const previewSlug = document.querySelector('[data-seo-slug]');
  if (previewTitle)
    previewTitle.textContent =
      seoTitleInput?.value.trim() || title || 'Beitragstitel';
  if (previewDescription)
    previewDescription.textContent =
      seoDescriptionInput?.value.trim() ||
      excerpt ||
      'Die Beschreibung des Beitrags erscheint hier.';
  if (previewSlug) previewSlug.textContent = slugInput?.value || '…';
  updateChecklist();
  updateCover();
};

const serializeForm = () => {
  if (!form) return '{}';
  const data = Object.fromEntries(new FormData(form).entries());
  return JSON.stringify(data);
};
const saveDraft = () => {
  if (!form?.dataset.draftKey) return;
  localStorage.setItem(form.dataset.draftKey, serializeForm());
  if (saveState)
    saveState.textContent = `Lokal gespeichert · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
};
const restoreDraft = async () => {
  if (!form?.dataset.draftKey) return;
  const raw = localStorage.getItem(form.dataset.draftKey);
  if (!raw || raw === serializeForm()) return;
  if (
    !(await openEditorDialog({
      title: 'Lokalen Entwurf wiederherstellen?',
      description: 'Es gibt einen lokal gespeicherten Bearbeitungsstand.',
      submitLabel: 'Wiederherstellen',
    }))
  )
    return;
  try {
    const data = JSON.parse(raw) as Record<string, string>;
    Object.entries(data).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && field.type === 'checkbox')
        field.checked = value === 'on';
      else if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        field.value = value;
    });
    form.dispatchEvent(new Event('input', { bubbles: true }));
    if (saveState) saveState.textContent = 'Lokalen Entwurf wiederhergestellt';
  } catch {
    localStorage.removeItem(form.dataset.draftKey);
  }
};

const replaceSelection = (before: string, after = '', fallback = 'Text') => {
  if (!contentInput) return;
  const start = contentInput.selectionStart;
  const end = contentInput.selectionEnd;
  const selected = contentInput.value.slice(start, end) || fallback;
  contentInput.setRangeText(
    `${before}${selected}${after}`,
    start,
    end,
    'select',
  );
  contentInput.focus();
  contentInput.dispatchEvent(new Event('input', { bubbles: true }));
};
const prefixLines = (prefix: string, fallback: string) => {
  if (!contentInput) return;
  const start = contentInput.selectionStart;
  const end = contentInput.selectionEnd;
  const selected = contentInput.value.slice(start, end) || fallback;
  const formatted = selected
    .split('\n')
    .map((line, index) =>
      prefix === '1. ' ? `${index + 1}. ${line}` : `${prefix}${line}`,
    )
    .join('\n');
  contentInput.setRangeText(formatted, start, end, 'select');
  contentInput.focus();
  contentInput.dispatchEvent(new Event('input', { bubbles: true }));
};

document
  .querySelectorAll<HTMLButtonElement>('[data-editor-tab]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.editorTab;
      document
        .querySelectorAll<HTMLButtonElement>('[data-editor-tab]')
        .forEach((tab) =>
          tab.setAttribute('aria-selected', String(tab === button)),
        );
      document
        .querySelectorAll<HTMLElement>('[data-editor-panel]')
        .forEach((panel) =>
          panel.toggleAttribute(
            'hidden',
            panel.dataset.editorPanel !== selected,
          ),
        );
      if (selected === 'preview') renderPreview();
    });
  });
document
  .querySelectorAll<HTMLButtonElement>('[data-format]')
  .forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.format;
      if (action === 'bold') replaceSelection('**', '**');
      if (action === 'italic') replaceSelection('*', '*');
      if (action === 'h2') prefixLines('## ', 'Zwischenüberschrift');
      if (action === 'h3') prefixLines('### ', 'Zwischenüberschrift');
      if (action === 'quote') prefixLines('> ', 'Zitat');
      if (action === 'ul') prefixLines('- ', 'Listenpunkt');
      if (action === 'ol') prefixLines('1. ', 'Listenpunkt');
      if (action === 'divider') replaceSelection('\n\n---\n\n', '', '');
      if (action === 'link') {
        const url = await openEditorDialog({
          title: 'Link einfügen',
          description: 'Gib die Zieladresse für den Link ein.',
          submitLabel: 'Link einfügen',
          initialValue: 'https://',
        });
        if (url) replaceSelection('[', `](${url})`, 'Linktext');
      }
    });
  });

document
  .querySelector<HTMLButtonElement>('[data-import-markdown]')
  ?.addEventListener('click', () => markdownFileInput?.click());
markdownFileInput?.addEventListener('change', async () => {
  const file = markdownFileInput.files?.[0];
  if (!file) return;
  try {
    if (!/\.(?:md|markdown)$/i.test(file.name)) {
      showImportStatus(
        'Bitte wähle eine Markdown-Datei mit der Endung .md oder .markdown.',
        'error',
      );
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showImportStatus(
        'Die Markdown-Datei darf höchstens 2 MB groß sein.',
        'error',
      );
      return;
    }

    const hasExistingArticle = Boolean(
      titleInput?.value.trim() ||
      excerptInput?.value.trim() ||
      contentInput?.value.trim(),
    );
    if (
      hasExistingArticle &&
      !(await openEditorDialog({
        title: 'Markdown importieren?',
        description: 'Der Import ersetzt Titel, Teaser und Beitragstext.',
        submitLabel: 'Importieren',
      }))
    )
      return;

    const imported = parseMarkdownImport(await file.text(), file.name);
    if (!imported.content) {
      showImportStatus(
        'Die Datei enthält keinen importierbaren Beitragstext.',
        'error',
      );
      return;
    }

    if (titleInput) titleInput.value = imported.title;
    if (excerptInput) excerptInput.value = imported.excerpt;
    if (contentInput) contentInput.value = imported.content;
    if (slugInput && (autoSlug || !slugInput.value.trim())) {
      slugInput.value = imported.slug;
      slugChanged = true;
    }
    if (categoryInput && imported.category)
      categoryInput.value = imported.category;
    if (authorInput && imported.author) authorInput.value = imported.author;
    if (tagsInput && imported.tags.length)
      tagsInput.value = imported.tags.join(', ');
    if (seoTitleInput && imported.seoTitle)
      seoTitleInput.value = imported.seoTitle;
    if (seoDescriptionInput && imported.seoDescription)
      seoDescriptionInput.value = imported.seoDescription;
    if (coverUrlInput && imported.coverImageUrl)
      coverUrlInput.value = imported.coverImageUrl;
    if (coverAltInput && imported.coverImageAlt)
      coverAltInput.value = imported.coverImageAlt;
    if (sourceInput && imported.sourceUrls.length)
      sourceInput.value = imported.sourceUrls.join('\n');
    if (readMinutesInput) readMinutesInput.value = String(readingTime());

    form?.dispatchEvent(new Event('input', { bubbles: true }));
    showWizardStep(1, false);
    titleInput?.focus();
    const warningText = imported.warnings.join(' ');
    showImportStatus(
      warningText
        ? `${file.name} wurde importiert. ${warningText}`
        : `${file.name} wurde importiert. Prüfe den Beitrag in der Vorschau und speichere ihn anschließend als Entwurf.`,
      warningText ? 'warning' : 'success',
    );
  } catch {
    showImportStatus(
      'Die Markdown-Datei konnte nicht gelesen werden.',
      'error',
    );
  } finally {
    markdownFileInput.value = '';
  }
});

slugInput?.addEventListener('input', () => {
  slugChanged = true;
});
titleInput?.addEventListener('input', () => {
  if (!slugChanged && slugInput) slugInput.value = toSlug(titleInput.value);
});
document
  .querySelector('[data-use-read-time]')
  ?.addEventListener('click', () => {
    if (readMinutesInput) readMinutesInput.value = String(readingTime());
  });
document.querySelector('[data-publish-now]')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#published-at');
  if (!input) return;
  input.value = formatBerlinDateTimeLocal();
});
document
  .querySelector<HTMLSelectElement>('#article-status')
  ?.addEventListener('change', (event) => {
    const select = event.currentTarget;
    const badge = document.querySelector<HTMLElement>('#status-preview');
    if (!(select instanceof HTMLSelectElement) || !badge) return;
    badge.className = `status-pill status-${select.value}`;
    badge.textContent = select.options[select.selectedIndex].text;
  });

document
  .querySelectorAll<HTMLButtonElement>('[data-wizard-go]')
  .forEach((button) => {
    button.addEventListener('click', () =>
      goToWizardStep(Number(button.dataset.wizardGo)),
    );
  });
document
  .querySelector<HTMLButtonElement>('[data-wizard-previous]')
  ?.addEventListener('click', () => showWizardStep(currentWizardStep - 1));
document
  .querySelector<HTMLButtonElement>('[data-wizard-next]')
  ?.addEventListener('click', () => {
    if (validateWizardStep(currentWizardStep))
      showWizardStep(currentWizardStep + 1);
  });

form?.addEventListener('input', () => {
  if (lastInvalidField?.checkValidity()) clearValidationNotice();
  updateUi();
  if (saveState) saveState.textContent = 'Ungespeicherte lokale Änderungen …';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 700);
});
form?.addEventListener('submit', (event) => {
  const invalid = firstInvalidField();
  if (invalid) {
    event.preventDefault();
    const invalidStep = Number(
      invalid.closest<HTMLElement>('[data-wizard-step]')?.dataset.wizardStep ??
        1,
    );
    showWizardStep(invalidStep, false);
    showValidationNotice(invalid);
    invalid.focus();
    return;
  }
  clearValidationNotice();
  cancelScheduledDraftSave();
  if (form.dataset.draftKey) localStorage.removeItem(form.dataset.draftKey);
  if (saveState) saveState.textContent = 'Wird gespeichert …';
});
document
  .querySelector('[data-discard-draft]')
  ?.addEventListener('click', () => {
    cancelScheduledDraftSave();
    if (form?.dataset.draftKey) localStorage.removeItem(form.dataset.draftKey);
    if (saveState) saveState.textContent = 'Lokaler Entwurf gelöscht';
  });
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    form?.requestSubmit();
  }
  if (
    document.activeElement === contentInput &&
    event.key.toLowerCase() === 'b'
  ) {
    event.preventDefault();
    replaceSelection('**', '**');
  }
  if (
    document.activeElement === contentInput &&
    event.key.toLowerCase() === 'i'
  ) {
    event.preventDefault();
    replaceSelection('*', '*');
  }
});
let deleteConfirmed = false;
document
  .querySelector<HTMLFormElement>('[data-delete-form]')
  ?.addEventListener('submit', async (event) => {
    if (deleteConfirmed) return;
    event.preventDefault();
    const deleteForm = event.currentTarget;
    if (
      deleteForm instanceof HTMLFormElement &&
      (await openEditorDialog({
        title: 'Beitrag endgültig löschen?',
        description:
          'Dieser Beitrag kann danach nicht wiederhergestellt werden.',
        submitLabel: 'Beitrag löschen',
      }))
    ) {
      deleteConfirmed = true;
      deleteForm.requestSubmit();
    }
  });

if (form) form.dataset.editorReady = 'true';

void (async () => {
  await restoreDraft();
  updateUi();
  showWizardStep(1, false);
})();
