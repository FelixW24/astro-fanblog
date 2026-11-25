import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import PlayerPerformanceChart from './PlayerPerformanceChart.astro';

const profiles = [
  {
    title: 'Torwartprofil 10.2026',
    metrics: [
      { label: 'Paradenquote', value: 82 },
      { label: 'Passquote', value: 71 },
      { label: 'Lange Bälle', value: 0 },
    ],
  },
  {
    title: 'Feldspielerprofil 2026/27',
    metrics: [
      { label: 'Schussgenauigkeit', value: 100 },
      { label: 'Zweikämpfe', value: 58 },
      { label: 'Dribblingquote', value: 64 },
    ],
  },
];

describe.each(profiles)('$title', ({ title, metrics }) => {
  it.each(['radar', 'bar'])(
    'renders every %s chart value without an additional table or explanation',
    async (chartType) => {
      const container = await AstroContainer.create();
      const html = await container.renderToString(PlayerPerformanceChart, {
        props: {
          title,
          metrics,
          chartType,
          unit: '%',
        },
      });
      expect(html).not.toContain('<table');
      expect(html).not.toContain('<figcaption');
      expect(html).not.toContain('Vergleichsgruppe und Zeitraum');
      expect(html).not.toContain('Nicht hinterlegt');
      for (const { label, value } of metrics) {
        if (chartType === 'radar') {
          expect(html).toContain(label + ' ' + value + '%');
          expect(html).toContain('player-radar__value');
        } else {
          expect(html).toContain('--player-value: ' + value + '%');
        }
      }
      expect(html).toContain('aria-label="' + title + '"');
      expect(html).not.toContain('astro-island');
      expect(html).not.toContain('<canvas');
    },
  );
});

it('does not turn untyped ratings into percentages or percentiles', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(PlayerPerformanceChart, {
    props: { ...profiles[0], chartType: 'radar' },
  });
  expect(html).toContain('Paradenquote 82, Passquote 71, Lange Bälle 0');
  expect(html).not.toContain('Perzentile');
  expect(html).not.toContain('82%');
});

it('escapes editorial labels and titles', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(PlayerPerformanceChart, {
    props: {
      title: 'Profil " onmouseover="alert(1)',
      chartType: 'bar',
      metrics: [{ label: '<img src=x onerror=alert(1)>', value: 42 }],
    },
  });
  expect(html).toContain('aria-label="Profil &quot; onmouseover=&quot;alert(1)"');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain('" onmouseover="');
  expect(html).not.toContain('<img');
});

it('wraps long radar labels into short lines instead of one long line', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(PlayerPerformanceChart, {
    props: {
      title: 'Leistungsprofil',
      chartType: 'radar',
      metrics: [
        { label: 'Gtztlicher gtterfunken parade', value: 76 },
        { label: 'Reflexe', value: 86 },
      ],
    },
  });
  const labelLines = [...html.matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)]
    .filter(([attributes]) => !attributes.includes('player-radar__value'))
    .map(([, , text]) => text.trim());
  expect(labelLines).toEqual([
    'Gtztlicher',
    'gtterfunke',
    'n parade',
    'Reflexe',
  ]);
  for (const line of labelLines) {
    expect(line.length).toBeLessThanOrEqual(10);
  }
});
