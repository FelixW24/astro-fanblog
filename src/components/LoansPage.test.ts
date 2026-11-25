import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeEach, expect, it, vi } from 'vitest';
import { getLoans, type Loan } from '../lib/content';
import {
  defaultNewsletterSettings,
  loadNewsletterSettings,
} from '../lib/newsletter';
import LoansPage from './LoansPage.astro';

vi.mock('../lib/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/content')>()),
  getLoans: vi.fn(),
}));
vi.mock('../lib/next-match', () => ({
  getNextMatch: vi.fn().mockResolvedValue(null),
}));
// Der LoansPage-Test rendert das komplette BaseLayout; seit dem
// Willkommens-Modal lädt dieses die Newsletter-Texte über die Datenbank. Im
// CI gibt es keinen Supabase-Stack — der Verbindungsaufbau reißt das
// Rendern über den Test-Timeout. Der Mock liefert stattdessen die
// Default-Texte (kein Datenbankumweg), Zeitpuffer fürs kalte
// BaseLayout-Rendering auf langsamen Runner bleibt über den Timeout.
vi.mock('../lib/newsletter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/newsletter')>()),
  loadNewsletterSettings: vi.fn(),
}));

const loans = [
  {
    direction: 'incoming',
    players: {
      name: 'Geliehener Spieler',
      slug: 'geliehener-spieler',
      squad_status: 'loan-in',
      position: 'sturm',
    },
  },
  {
    direction: 'outgoing',
    players: {
      name: 'Verliehener Spieler',
      slug: 'verliehener-spieler',
      squad_status: 'on-loan',
      position: 'abwehr',
    },
  },
] as Loan[];

beforeEach(() => {
  vi.mocked(getLoans).mockResolvedValue(loans);
  vi.mocked(loadNewsletterSettings).mockResolvedValue(
    defaultNewsletterSettings(),
  );
});

it.each([
  ['incoming', 'geliehen', 'geliehener-spieler', 'verliehener-spieler'],
  ['outgoing', 'verliehen', 'verliehener-spieler', 'geliehener-spieler'],
] as const)(
  'zeigt nur Spieler der Leihart %s und verlinkt beide Seiten',
  async (direction, slug, shown, hidden) => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(LoansPage, {
      props: { direction },
      request: new Request(`https://blog.example/leihspieler/${slug}`),
    });
    expect(html).toContain(`href="/kader/${shown}"`);
    expect(html).not.toContain(`href="/kader/${hidden}"`);
    expect(html).toContain('href="/leihspieler/geliehen"');
    expect(html).toContain('href="/leihspieler/verliehen"');
    expect(html).toMatch(
      new RegExp(`href="/leihspieler/${slug}" aria-current="page"`),
    );
  },
  // BaseLayout-Rendering ist auf kalten CI-Runnern teuer; der Mock nimmt die
  // Datenbank weg, der Rest braucht Luft.
  15_000,
);

it('zeigt einen Leerzustand nur für die ausgewählte Leihart', async () => {
  vi.mocked(getLoans).mockResolvedValue([loans[1]]);
  const container = await AstroContainer.create();
  const html = await container.renderToString(LoansPage, {
    props: { direction: 'incoming' },
  });
  expect(html).toContain('Aktuell keine geliehenen Spieler');
  expect(html).not.toContain('href="/kader/verliehener-spieler"');
}, 15_000);
