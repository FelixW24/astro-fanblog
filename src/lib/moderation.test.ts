import { expect, it } from 'vitest';
import { parseBanHours } from './moderation';
it('begrenzt frei wählbare Sperren und verlangt eine bewusste Auswahl', () => {
  const form = new FormData();
  form.set('duration', '7');
  form.set('unit', 'days');
  expect(parseBanHours(form)).toBe(0);
  form.set('ban', 'on');
  expect(parseBanHours(form)).toBe(168);
  for (const value of ['-1', '0', '1.5', '366', 'NaN']) {
    form.set('duration', value);
    expect(parseBanHours(form)).toBeNull();
  }
  form.set('duration', '365');
  expect(parseBanHours(form)).toBe(8760);
});
