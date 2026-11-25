/// <reference types="vitest/config" />

import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: 'node',
    exclude: [
      'coverage/**',
      'dist/**',
      'e2e/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Vitest 4: include explicitly covers tested and untested library files.
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/database.types.ts', 'src/lib/**/*.d.ts'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
