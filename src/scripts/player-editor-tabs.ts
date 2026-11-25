// Sub-Header-Navigation der Spielerprofil-Bearbeitung: Ein Bereich
// (Profil, Charts, Spielhistorie) ist jeweils sichtbar. Der aktive Tab
// wird über den Hash (#verlauf, #charts) bzw. Query-Parameter (?chart=…)
// wiederhergestellt, damit Redirects nach dem Speichern im passenden
// Bereich landen.
export function wirePlayerEditorTabs(): void {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-editor-tab]'),
  );
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-editor-panel]'),
  );
  if (tabs.length === 0 || panels.length === 0) return;

  const panelByTab = new Map(
    panels.map((panel) => [panel.dataset.editorPanel ?? '', panel]),
  );
  const hashAliases: Record<string, string> = {
    'chart-input-error': 'charts',
  };

  const activate = (name: string, updateHash: boolean): void => {
    const target = panelByTab.get(name) ?? panelByTab.get('profil');
    if (!target) return;
    const targetName = target.dataset.editorPanel ?? 'profil';
    for (const panel of panels)
      panel.toggleAttribute('hidden', panel !== target);
    for (const tab of tabs)
      tab.setAttribute(
        'aria-selected',
        String(tab.dataset.editorTab === targetName),
      );
    if (updateHash) history.replaceState(null, '', `#${targetName}`);
    const hash = window.location.hash.replace(/^#/, '');
    if (hash && hash !== targetName)
      document.getElementById(hash)?.scrollIntoView();
  };

  const initialTab = (): string => {
    const hash = window.location.hash.replace(/^#/, '');
    if (panelByTab.has(hash)) return hash;
    if (hashAliases[hash]) return hashAliases[hash];
    const params = new URLSearchParams(window.location.search);
    if (!params.has('saved') && params.has('chart')) return 'charts';
    return 'profil';
  };

  for (const tab of tabs)
    tab.addEventListener('click', () =>
      activate(tab.dataset.editorTab ?? 'profil', true),
    );
  window.addEventListener('hashchange', () => activate(initialTab(), false));
  activate(initialTab(), false);
}
