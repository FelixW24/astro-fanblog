/**
 * Schließt das Einstellungs-Dropdown der Redaktionsnavigation, wenn außerhalb
 * geklickt oder Escape gedrückt wird (natives <details> bleibt sonst offen).
 */
export function initAdminSettingsDropdown(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLDetailsElement>('details.editorial-tabs__group')
    .forEach((group) => {
      const trigger = group.querySelector('summary');

      document.addEventListener('click', (event) => {
        if (event.target instanceof Node && !group.contains(event.target))
          group.open = false;
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && group.open) {
          group.open = false;
          trigger?.focus();
        }
      });
    });
}
