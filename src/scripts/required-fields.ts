/** Match conditional browser requirements to the server-side form rules. */
export function initRequiredFields(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>('form').forEach((form) => {
    const imageFields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        '[data-required-pair]',
      ),
    );
    const syncImages = () => {
      imageFields.forEach((field) => {
        field.required = imageFields.some(
          (other) =>
            other.dataset.requiredPair === field.dataset.requiredPair &&
            other.value.trim() !== '',
        );
      });
    };
    const dependentFields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        '[data-required-with]',
      ),
    );
    const syncDependents = () => {
      dependentFields.forEach((field) => {
        const source = form.elements.namedItem(field.dataset.requiredWith ?? '');
        field.required =
          (source instanceof HTMLInputElement ||
            source instanceof HTMLSelectElement ||
            source instanceof HTMLTextAreaElement) &&
          source.value.trim() !== '';
      });
    };
    // Capture also covers programmatic imports that dispatch on the form.
    form.addEventListener('input', syncImages, true);
    form.addEventListener('change', syncImages, true);
    form.addEventListener('input', syncDependents, true);
    form.addEventListener('change', syncDependents, true);

    const ban = form.querySelector<HTMLInputElement>('input[name="ban"]');
    const banFields = form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >('[data-ban-field]');
    const syncBan = () => {
      banFields.forEach((field) => {
        field.required = Boolean(ban?.checked);
        field.disabled = !ban?.checked;
      });
    };
    ban?.addEventListener('change', syncBan);

    const sync = () => {
      syncImages();
      syncDependents();
      syncBan();
    };
    sync();
    // The reset event fires before the browser restores the default values.
    form.addEventListener('reset', () => setTimeout(sync, 0));
  });
}
