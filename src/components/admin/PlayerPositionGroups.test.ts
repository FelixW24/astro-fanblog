import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import PlayerPositionGroups from './PlayerPositionGroups.astro';
import type { Player } from '../../lib/content';

const player = {
  id: 1,
  name: 'Lukas Lücke',
  slug: 'lukas-luecke',
  position: 'torwart',
  shirt_number: 1,
  squad_status: 'first-team',
} as unknown as Player;

describe('PlayerPositionGroups', () => {
  it('marks delete links as modal triggers with a page fallback', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PlayerPositionGroups, {
      props: { players: [player], status: 'first-team' },
    });

    expect(html).toContain('data-player-delete');
    expect(html).toContain('data-player-id="1"');
    expect(html).toContain('data-player-name="Lukas Lücke"');
    expect(html).toContain('href="/admin/spieler/1/loeschen"');
    expect(html).toContain('aria-label="Lukas Lücke löschen"');
  });
});
