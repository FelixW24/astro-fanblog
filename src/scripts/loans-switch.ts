export function wireLoansSwitch() {
  const content = document.querySelector('.loans-page');
  if (!content) return;
  const target = content;

  let busy = false;

  async function swap(url: string, push: boolean) {
    if (busy || url === window.location.pathname) return;
    busy = true;
    try {
      const res = await fetch(url, {
        headers: { 'X-Requested-With': 'loans-switch' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(
        await res.text(),
        'text/html'
      );
      const newShell = doc.querySelector('.page-hero .shell');
      const newContent = doc.querySelector('.loans-page');
      const shell = document.querySelector('.page-hero .shell');
      if (!newShell || !newContent || !shell) throw new Error('parse');
      shell.replaceChildren(
        ...Array.from(newShell.childNodes).map((node) => node.cloneNode(true))
      );
      target.replaceChildren(
        ...Array.from(newContent.childNodes).map((node) =>
          node.cloneNode(true)
        )
      );
      document.title = doc.title;
      if (push) window.history.pushState({ loansUrl: url }, '', url);
    } catch {
      window.location.href = url;
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest?.('.loans-navigation a');
    if (!link) return;
    const url = link.getAttribute('href');
    if (!url) return;
    event.preventDefault();
    void swap(url, true);
  });

  window.addEventListener('popstate', () => {
    void swap(window.location.pathname, false);
  });
}
