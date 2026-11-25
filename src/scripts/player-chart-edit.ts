interface EditableChart {
  id: number;
  title: string;
  description: string;
  chart_type: string;
  sort_order: number;
  metrics: string;
}

export function wirePlayerChartEdit() {
  const form = document.getElementById('player-profile-form');
  if (!(form instanceof HTMLFormElement)) return;
  const panel = document.querySelector<HTMLElement>('.player-chart-form');
  const editId = form.querySelector<HTMLInputElement>('[data-chart-edit-id]');
  const field = (name: string) =>
    form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;

  document
    .querySelectorAll<HTMLButtonElement>('[data-chart-edit]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const raw = button.dataset.chart;
        if (!raw) return;
        let chart: EditableChart;
        try {
          chart = JSON.parse(raw) as EditableChart;
        } catch {
          return;
        }
        const title = field('chart_title');
        const description = field('chart_description');
        const type = field('chart_type');
        const sortOrder = field('chart_sort_order');
        const metrics = field('chart_metrics');
        if (title) title.value = chart.title ?? '';
        if (description) description.value = chart.description ?? '';
        if (type) type.value = chart.chart_type ?? 'radar';
        if (sortOrder) sortOrder.value = String(chart.sort_order ?? 1);
        if (metrics) metrics.value = chart.metrics ?? '';
        if (editId) editId.value = String(chart.id ?? '');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        title?.focus();
      });
    });
}
