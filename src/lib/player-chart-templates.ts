import {
  isPlayerChartType,
  performanceMetricsForPosition,
  playerPositions,
} from './player';

export interface ChartTemplate {
  id: string;
  name: string;
  position: string;
  chart_type: 'radar' | 'bar';
  metric_labels: string[];
}

export const builtInChartTemplates: ChartTemplate[] = playerPositions.map(
  ({ value, label }) => ({
    id: `builtin:${value}`,
    name: `${label} – Standard`,
    position: value,
    chart_type: 'radar',
    metric_labels: performanceMetricsForPosition(value).map(
      (metric) => metric.label,
    ),
  }),
);

export function templateMetricsText(labels: string[]) {
  return labels.map((label) => `${label}: `).join('\n');
}

const templateIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseChartTemplateRename(formData: FormData): {
  error: string | null;
  id: string;
  name: string;
} {
  const id = String(formData.get('template_id') ?? '').trim();
  const name = String(formData.get('template_name') ?? '').trim();
  if (!templateIdPattern.test(id))
    return { error: 'Wähle eine gespeicherte Vorlage aus.', id, name };
  if (name.length < 3 || name.length > 80)
    return {
      error: 'Gib der Vorlage einen Namen mit 3 bis 80 Zeichen.',
      id,
      name,
    };
  return { error: null, id, name };
}

export function parseChartTemplate(formData: FormData) {
  const name = String(formData.get('template_name') ?? '').trim();
  const position = String(formData.get('position') ?? '');
  const chartType = String(formData.get('chart_type') ?? '');
  const lines = String(formData.get('chart_metrics') ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // Only labels are reusable. Never carry another player's ratings into a template.
  const labels = lines.map((line) => line.split(':')[0].trim());
  let error: string | null = null;
  if (name.length < 3 || name.length > 80)
    error = 'Gib der Vorlage einen Namen mit 3 bis 80 Zeichen.';
  else if (!playerPositions.some(({ value }) => value === position))
    error = 'Wähle für die Vorlage eine gültige Spielerposition.';
  else if (!isPlayerChartType(chartType))
    error = 'Wähle einen gültigen Diagrammtyp.';
  else if (labels.length < 3 || labels.length > 10)
    error =
      'Eine Vorlage benötigt 3 bis 10 Merkmale, jeweils in einer eigenen Zeile.';
  else if (labels.some((label) => label.length < 1 || label.length > 30))
    error =
      'Jedes Merkmal benötigt eine Bezeichnung mit 1 bis 30 Zeichen vor dem Doppelpunkt.';
  else if (
    new Set(labels.map((label) => label.toLocaleLowerCase('de-DE'))).size !==
    labels.length
  )
    error = 'Jedes Merkmal darf in einer Vorlage nur einmal vorkommen.';
  return {
    error,
    template: {
      name,
      position,
      chart_type: isPlayerChartType(chartType) ? chartType : 'radar',
      metric_labels: labels,
    },
  };
}
