import { defineConfig, defineGlobalStyles } from '@pandacss/dev';

const globalCss = defineGlobalStyles({
  ':root': {
    '--global-font-body': 'fonts.ranade',
    '--global-color-border': 'colors.fog',
    '--global-color-focus-ring': 'colors.blueprintBlue',
  },
  html: { scrollBehavior: 'smooth' },
  body: {
    margin: '0',
    backgroundColor: 'colors.canvas',
    color: 'colors.inkBlack',
    fontFamily: 'ranade',
    fontFeatureSettings: '"calt" 1, "kern" 1, "liga" 1, "ss01" 1',
    lineHeight: 'body',
  },
  'a, button, input, textarea, select': { font: 'inherit' },
  img: { maxWidth: '100%' },
  '.shell': {
    width: 'min(calc(100% - 32px), var(--page-max-width))',
    marginInline: 'auto',
  },
  '.button, .admin-primary-button': {
    transition: 'background-color .15s, border-color .15s, color .15s',
  },
  '.button:focus-visible, .admin-primary-button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible':
    {
      outline: '2px solid token(colors.blueprintBlue)',
      outlineOffset: '2px',
    },
});

export default defineConfig({
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx,astro}'],

  // Files to exclude
  exclude: ['./dist/**', './styled-system/**'],
  globalCss,

  // Useful for theme customization
  theme: {
    extend: {
      tokens: {
        colors: {
          blueprintBlue: { value: 'var(--color-blueprint-blue)' },
          blueprintBlueDark: { value: 'var(--color-blueprint-blue-dark)' },
          inkBlack: { value: 'var(--color-ink-black)' },
          carbon: { value: 'var(--color-carbon)' },
          slate: { value: 'var(--color-slate)' },
          fog: { value: 'var(--color-fog)' },
          paper: { value: 'var(--color-paper)' },
          stone: { value: 'var(--color-stone)' },
          canvas: { value: 'var(--color-canvas)' },
          mint: { value: 'var(--color-mint)' },
        },
        fonts: {
          ranade: {
            value: 'var(--font-ranade)',
          },
          // Historical aliases kept so existing component styles continue to work.
          suisse: {
            value: 'var(--font-ranade)',
          },
          mono: {
            value: 'var(--font-ranade)',
          },
        },
        fontSizes: {
          caption: { value: 'var(--text-caption)' },
          bodySm: { value: 'var(--text-body-sm)' },
          body: { value: 'var(--text-body)' },
          subheading: { value: 'var(--text-subheading)' },
          headingSm: { value: 'var(--text-heading-sm)' },
          heading: { value: 'var(--text-heading)' },
        },
        lineHeights: {
          caption: { value: 'var(--leading-caption)' },
          bodySm: { value: 'var(--leading-body-sm)' },
          body: { value: 'var(--leading-body)' },
          subheading: { value: 'var(--leading-subheading)' },
          headingSm: { value: 'var(--leading-heading-sm)' },
          heading: { value: 'var(--leading-heading)' },
        },
        radii: {
          tag: { value: 'var(--radius-tags)' },
          control: { value: 'var(--radius-inputs)' },
          card: { value: 'var(--radius-cards)' },
          hero: { value: 'var(--radius-heropanel)' },
        },
        shadows: {
          subtle: { value: 'var(--shadow-subtle)' },
        },
      },
    },
  },

  // The output directory for your css system
  outdir: 'styled-system',

  // The JSX framework to use
  jsxFramework: 'astro',
});
