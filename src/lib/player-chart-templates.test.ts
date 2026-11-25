import { describe, expect, it } from 'vitest';
import {
  builtInChartTemplates,
  parseChartTemplate,
  parseChartTemplateRename,
  templateMetricsText,
} from './player-chart-templates';

function form() {
  const data = new FormData();
  Object.entries({
    template_name: 'Innenverteidiger',
    position: 'abwehr',
    chart_type: 'bar',
    chart_metrics: 'Passquote: 80\nZweikämpfe: 65\nLuftzweikämpfe: 70',
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe('diagram templates', () => {
  it('offers different metrics for each player position', () => {
    expect(builtInChartTemplates).toHaveLength(4);
    expect(
      builtInChartTemplates.find((t) => t.position === 'torwart')
        ?.metric_labels,
    ).toContain('Paradenquote');
    expect(
      builtInChartTemplates.find((t) => t.position === 'abwehr')?.metric_labels,
    ).toContain('Luftzweikämpfe');
    expect(
      builtInChartTemplates.find((t) => t.position === 'abwehr')?.metric_labels,
    ).not.toContain('Paradenquote');
  });
  it('saves labels, position and chart type without copying player ratings', () => {
    const result = parseChartTemplate(form());
    expect(result).toEqual({
      error: null,
      template: {
        name: 'Innenverteidiger',
        position: 'abwehr',
        chart_type: 'bar',
        metric_labels: ['Passquote', 'Zweikämpfe', 'Luftzweikämpfe'],
      },
    });
    expect(templateMetricsText(result.template.metric_labels)).toBe(
      'Passquote: \nZweikämpfe: \nLuftzweikämpfe: ',
    );
  });
  it('allows saving a structure before any numeric values are entered', () => {
    const data = form();
    data.set('chart_metrics', 'Passquote: \nZweikämpfe: \nLuftzweikämpfe: ');
    expect(parseChartTemplate(data).error).toBeNull();
  });
  it.each([
    ['template_name', 'ab', 'Namen'],
    ['template_name', 'x'.repeat(81), 'Namen'],
    ['position', 'unknown', 'Spielerposition'],
    ['chart_type', 'line', 'Diagrammtyp'],
    ['chart_metrics', 'Tempo: 50', '3 bis 10'],
    ['chart_metrics', ': 50\nPass: 50\nTempo: 50', 'Bezeichnung'],
    ['chart_metrics', 'Tempo: 50\ntempo: 30\nPass: 50', 'einmal'],
  ])('rejects invalid %s', (key, value, message) => {
    const data = form();
    data.set(key, value);
    expect(parseChartTemplate(data).error).toContain(message);
  });
});

describe('template rename', () => {
  const id = 'e687677e-df36-486d-8c6b-550e3a79504b';
  function renameForm(templateId = id, templateName = 'Innenverteidiger neu') {
    const data = new FormData();
    data.set('template_id', templateId);
    data.set('template_name', templateName);
    return data;
  }
  it('accepts a valid id and name', () => {
    expect(parseChartTemplateRename(renameForm())).toEqual({
      error: null,
      id,
      name: 'Innenverteidiger neu',
    });
  });
  it('rejects built-in or malformed ids', () => {
    expect(
      parseChartTemplateRename(renameForm('builtin:abwehr')).error,
    ).toContain('gespeicherte Vorlage');
    expect(parseChartTemplateRename(renameForm('kein-uuid')).error).toContain(
      'gespeicherte Vorlage',
    );
  });
  it.each([
    ['ab', 'Namen'],
    ['x'.repeat(81), 'Namen'],
  ])('rejects invalid name %s', (name, message) => {
    expect(
      parseChartTemplateRename(renameForm(id, name)).error,
    ).toContain(message);
  });
});
