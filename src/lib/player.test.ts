import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  countryFlagCode,
  formatMarketValue,
  formatPlayerDate,
  isRadarMetrics,
  isPlayerChartType,
  playerChartTypeLabel,
  positionLabel,
} from './player';

describe('player helpers', () => {
  it('formatiert öffentliche Spielerdaten', () => {
    expect(positionLabel('mittelfeld')).toBe('Mittelfeld');
    expect(formatPlayerDate('1995-04-25')).toBe('25.04.1995');
    expect(formatMarketValue(2_500_000)).toMatch(/2,5\s?Mio\.\s?€/);
  });

  it('berechnet das Alter rund um den Geburtstag', () => {
    expect(calculateAge('2000-09-05', new Date('2026-09-04T12:00:00Z'))).toBe(
      25,
    );
    expect(calculateAge('2000-09-04', new Date('2026-09-04T12:00:00Z'))).toBe(
      26,
    );
  });

  it('akzeptiert nur vollständige Radarwerte zwischen null und hundert', () => {
    expect(
      isRadarMetrics([
        { label: 'Tempo', value: 80 },
        { label: 'Technik', value: 70 },
        { label: 'Physis', value: 60 },
      ]),
    ).toBe(true);
    expect(
      isRadarMetrics([
        { label: 'Tempo', value: 101 },
        { label: 'Technik', value: 70 },
        { label: 'Physis', value: 60 },
      ]),
    ).toBe(false);
  });

  it('kennt die unterstützten Grafiktypen', () => {
    expect(isPlayerChartType('radar')).toBe(true);
    expect(isPlayerChartType('bar')).toBe(true);
    expect(isPlayerChartType('line')).toBe(false);
    expect(playerChartTypeLabel('bar')).toBe('Balkendiagramm');
  });
});

describe('country flags', () => {
  // Independent ISO code fixture: 193 UN members and two observer states.
  const codes =
    'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW PS VA'.split(
      ' ',
    );

  it('recognizes all 195 states in German, English and by ISO code', () => {
    expect(codes).toHaveLength(195);
    expect(new Set(codes).size).toBe(195);
    for (const locale of ['de', 'en']) {
      const names = new Intl.DisplayNames(locale, { type: 'region' });
      for (const code of codes) {
        expect(countryFlagCode(names.of(code)!), code).toBe(code.toLowerCase());
        expect(countryFlagCode(code), code).toBe(code.toLowerCase());
      }
    }
  });

  it.each([
    ['Georgien', 'ge'],
    ['Georgia', 'ge'],
    ['Palästina', 'ps'],
    ['Palestine', 'ps'],
    ['Staat Palästina', 'ps'],
    ['State of Palestine', 'ps'],
    ['Vatikan', 'va'],
    ['Holy See', 'va'],
    ['England', 'gb-eng'],
    ['Schottland', 'gb-sct'],
    ['Wales', 'gb-wls'],
    ['Nordirland', 'gb-nir'],
    ['Turkey', 'tr'],
    ['Elfenbeinküste', 'ci'],
    ['Republik Kongo', 'cg'],
    ['Demokratische Republik Kongo', 'cd'],
    ['USA', 'us'],
    ['  GEORGIEN  ', 'ge'],
    ['Pala\u0308stina', 'ps'],
  ])('maps %s to %s', (name, code) => {
    expect(countryFlagCode(name)).toBe(code);
  });

  it.each([null, '', '   ', 'Atlantis', 'constructor', '__proto__'])(
    'keeps the neutral fallback for %s',
    (value) => expect(countryFlagCode(value)).toBe('un'),
  );
});
