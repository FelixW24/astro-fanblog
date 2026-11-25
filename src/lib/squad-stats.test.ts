import { describe, expect, it } from 'vitest';
import type { PlayerMatchRating } from './admin-player-history';
import { matchGradeValue } from './admin-player-history';
import { emptyMatch, type Match } from './matches';
import {
  computeSquadStats,
  type SquadPlayer,
  type SquadStat,
} from './squad-stats';

function player(partial: Partial<SquadPlayer>): SquadPlayer {
  return {
    id: 1,
    slug: 'spieler-eins',
    name: 'Spieler Eins',
    shirt_number: 1,
    position: 'abwehr',
    squad_status: 'first-team',
    bio: null,
    contract_until: null,
    created_at: '2026-01-01T00:00:00+00:00',
    date_of_birth: null,
    height_cm: null,
    injury_since: null,
    injury_until: null,
    is_injured: false,
    joined_on: null,
    market_value_eur: null,
    nationality: null,
    preferred_foot: null,
    profile_image_alt: null,
    profile_image_url: null,
    profile_slogan: '',
    total_assists: 0,
    total_goals: 0,
    updated_at: '2026-01-01T00:00:00+00:00',
    ...partial,
  };
}

function match(partial: Partial<Match>): Match {
  return {
    ...emptyMatch,
    id: 1,
    opponent: 'FC Augsburg',
    opponent_short: 'FCA',
    is_home: true,
    kickoff_at: '2026-10-24T15:30:00+00:00',
    ...partial,
  };
}

function rating(partial: Partial<PlayerMatchRating>): PlayerMatchRating {
  return {
    id: 1,
    match_id: 1,
    player_id: 1,
    rating: null,
    status: 'played',
    minutes_played: null,
    sub_minute: null,
    substituted_by_player_id: null,
    goals: 0,
    assists: 0,
    note: null,
    created_at: '2026-10-24T18:00:00+00:00',
    updated_at: '2026-10-24T18:00:00+00:00',
    ...partial,
  };
}

const now = new Date('2026-11-05T12:00:00+00:00');

function statByKey(stats: SquadStat[], key: string): SquadStat {
  const stat = stats.find((entry) => entry.key === key);
  if (!stat) throw new Error(`Stat ${key} fehlt`);
  return stat;
}

function detailText(stat: SquadStat): string {
  return stat.detail
    .map((segment) =>
      segment.type === 'player' ? segment.player.name : segment.text,
    )
    .join('');
}

describe('matchGradeValue', () => {
  it('liest Noten auf der 0-bis-10-Skala aus Freitext', () => {
    expect(matchGradeValue('2,5')).toBe(2.5);
    expect(matchGradeValue('7+')).toBe(7);
    expect(matchGradeValue('Note: 8,5!')).toBe(8.5);
    expect(matchGradeValue('10')).toBe(10);
    expect(matchGradeValue('10,0')).toBe(10);
    expect(matchGradeValue('10,5')).toBe(10);
    expect(matchGradeValue('6.0')).toBe(6);
    expect(matchGradeValue('unleserlich')).toBeNull();
    expect(matchGradeValue('')).toBeNull();
    expect(matchGradeValue(null)).toBeNull();
  });
});

describe('computeSquadStats', () => {
  it('liefert alle acht Karten auch bei leerem Kader', () => {
    const stats = computeSquadStats([], [], [], now);
    expect(stats.map((stat) => stat.key)).toEqual([
      'noten',
      'minuten',
      'marktwert',
      'nationen',
      'alter',
      'groesse',
      'vertrag',
      'verletzt',
    ]);
    for (const stat of stats) {
      expect(stat.value).toBeTruthy();
      expect(stat.icon).toBeTruthy();
      expect(stat.label).toBeTruthy();
    }
    expect(statByKey(stats, 'marktwert').value).toBe('–');
    expect(statByKey(stats, 'verletzt').value).toBe('0');
  });

  it('findet den besten Notenschnitt ab zwei benoteten Spielen', () => {
    const p1 = player({ id: 1, slug: 'a', name: 'Anna Beispiel' });
    const p2 = player({ id: 2, slug: 'b', name: 'Ben Beispiel' });
    const stats = computeSquadStats(
      [p1, p2],
      [
        match({ id: 1 }),
        match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
        match({ id: 3, kickoff_at: '2026-10-10T15:30:00+00:00' }),
      ],
      [
        rating({ match_id: 1, player_id: 1, rating: '7' }),
        rating({ match_id: 2, player_id: 1, rating: '6' }),
        rating({ match_id: 1, player_id: 2, rating: '9' }),
        rating({ match_id: 2, player_id: 2, rating: '8' }),
        rating({ match_id: 3, player_id: 2, rating: 'unleserlich' }), // zaehlt nicht
        rating({ match_id: 99, player_id: 1, rating: '10' }), // unbekanntes Spiel
      ],
      now,
    );
    const noten = statByKey(stats, 'noten');
    expect(noten.value).toBe('Ø 8,5');
    expect(noten.detail).toEqual([
      { type: 'player', player: { name: 'Ben Beispiel', slug: 'b' } },
      { type: 'text', text: ' · 2 benotete Spiele' },
    ]);
  });

  it('ignoriert Spieler mit zu wenigen Noten beim Notenschnitt', () => {
    const p1 = player({ id: 1, slug: 'a', name: 'Anna Beispiel' });
    const stats = computeSquadStats(
      [p1],
      [match({ id: 1 })],
      [rating({ match_id: 1, player_id: 1, rating: '1' })],
      now,
    );
    expect(statByKey(stats, 'noten').value).toBe('–');
    expect(detailText(statByKey(stats, 'noten'))).toBe(
      'Noch keine Noten vergeben',
    );
  });

  it('summiert Spielminuten pro Spieler', () => {
    const p1 = player({ id: 1, slug: 'a', name: 'Anna Beispiel' });
    const p2 = player({ id: 2, slug: 'b', name: 'Ben Beispiel' });
    const stats = computeSquadStats(
      [p1, p2],
      [
        match({ id: 1 }),
        match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
      ],
      [
        rating({ match_id: 1, player_id: 1, minutes_played: 90 }),
        rating({ match_id: 2, player_id: 1, minutes_played: 45 }),
        rating({
          match_id: 1,
          player_id: 2,
          status: 'subbed_in',
          sub_minute: 67,
          minutes_played: 23,
        }),
        rating({
          match_id: 2,
          player_id: 2,
          status: 'subbed_in',
          sub_minute: 80,
          minutes_played: 10,
        }),
        rating({ match_id: 2, player_id: 2, status: 'subbed_off' }),
      ],
      now,
    );
    const minuten = statByKey(stats, 'minuten');
    expect(minuten.value).toBe('135 Min');
    expect(minuten.detail).toEqual([
      { type: 'player', player: { name: 'Anna Beispiel', slug: 'a' } },
    ]);
  });

  it('berechnet Kaderwert und Durchschnitt nur ueber Spieler mit Wert', () => {
    const stats = computeSquadStats(
      [
        player({ id: 1, market_value_eur: 2_500_000 }),
        player({ id: 2, market_value_eur: 500_000 }),
        player({ id: 3, market_value_eur: null }),
      ],
      [],
      [],
      now,
    );
    const marktwert = statByKey(stats, 'marktwert');
    // Intl liefert ein Schmal-Leerzeichen (U+202F) vor dem Euro-Zeichen.
    const normalize = (value: string) => value.replace(/\s+/g, ' ');
    expect(normalize(marktwert.value)).toBe('3,0 Mio. €');
    expect(normalize(detailText(marktwert))).toBe('Ø 1,5 Mio. € pro Spieler');
  });

  it('zaehlt Nationen und nennt die staerkste Gruppe', () => {
    const stats = computeSquadStats(
      [
        player({ id: 1, nationality: 'Deutschland' }),
        player({ id: 2, nationality: 'Deutschland' }),
        player({ id: 3, nationality: 'Österreich' }),
        player({ id: 4, nationality: null }),
        player({ id: 5, nationality: '  ' }),
      ],
      [],
      [],
      now,
    );
    const nationen = statByKey(stats, 'nationen');
    expect(nationen.value).toBe('2');
    expect(detailText(nationen)).toBe('Deutschland · 2 Spieler');
  });

  it('ermittelt Altersspanne mit juengstem und aeltestem Spieler', () => {
    const stats = computeSquadStats(
      [
        player({
          id: 1,
          slug: 'jung',
          name: 'Junger Spieler',
          date_of_birth: '2007-03-10',
        }),
        player({
          id: 2,
          slug: 'alt',
          name: 'Alter Spieler',
          date_of_birth: '1992-06-01',
        }),
        player({ id: 3, date_of_birth: null }),
      ],
      [],
      [],
      now,
    );
    const alter = statByKey(stats, 'alter');
    expect(alter.value).toBe('19–34 Jahre');
    expect(alter.detail).toEqual([
      { type: 'text', text: 'Jüngster: ' },
      { type: 'player', player: { name: 'Junger Spieler', slug: 'jung' } },
      { type: 'text', text: ' · Ältester: ' },
      { type: 'player', player: { name: 'Alter Spieler', slug: 'alt' } },
    ]);
  });

  it('formatiert Einzel-Alter ohne Spanne', () => {
    const stats = computeSquadStats(
      [player({ id: 1, date_of_birth: '1995-04-25' })],
      [],
      [],
      now,
    );
    expect(statByKey(stats, 'alter').value).toBe('31 Jahre');
  });

  it('berechnet Durchschnittsgroesse und groessten Spieler', () => {
    const stats = computeSquadStats(
      [
        player({
          id: 1,
          slug: 'klein',
          name: 'Kleiner Spieler',
          height_cm: 180,
        }),
        player({
          id: 2,
          slug: 'gross',
          name: 'Großer Spieler',
          height_cm: 190,
        }),
        player({ id: 3, height_cm: null }),
      ],
      [],
      [],
      now,
    );
    const groesse = statByKey(stats, 'groesse');
    expect(groesse.value).toBe('Ø 1,85 m');
    expect(detailText(groesse)).toBe('Größter: Großer Spieler (190 cm)');
  });

  it('findet den laengsten Vertrag', () => {
    const stats = computeSquadStats(
      [
        player({
          id: 1,
          slug: 'kurz',
          name: 'Kurzer Vertrag',
          contract_until: '2027-06-30',
        }),
        player({
          id: 2,
          slug: 'lang',
          name: 'Langer Vertrag',
          contract_until: '2029-06-30',
        }),
        player({ id: 3, contract_until: null }),
      ],
      [],
      [],
      now,
    );
    const vertrag = statByKey(stats, 'vertrag');
    expect(vertrag.value).toBe('30.06.2029');
    expect(vertrag.detail).toEqual([
      { type: 'player', player: { name: 'Langer Vertrag', slug: 'lang' } },
    ]);
  });

  it('listet verletzte Spieler mit Links auf', () => {
    const stats = computeSquadStats(
      [
        player({ id: 1, slug: 'a', name: 'Anna Beispiel', is_injured: true }),
        player({ id: 2, slug: 'b', name: 'Ben Beispiel', is_injured: true }),
        player({ id: 3, is_injured: false }),
      ],
      [],
      [],
      now,
    );
    const verletzt = statByKey(stats, 'verletzt');
    expect(verletzt.value).toBe('2');
    expect(verletzt.detail).toEqual([
      { type: 'player', player: { name: 'Anna Beispiel', slug: 'a' } },
      { type: 'text', text: ', ' },
      { type: 'player', player: { name: 'Ben Beispiel', slug: 'b' } },
    ]);
  });

  it('zeigt bei null Verletzten einen positiven Hinweis', () => {
    const stats = computeSquadStats([player({ id: 1 })], [], [], now);
    const verletzt = statByKey(stats, 'verletzt');
    expect(verletzt.value).toBe('0');
    expect(detailText(verletzt)).toBe('Aktuell keine Ausfälle');
  });
});
