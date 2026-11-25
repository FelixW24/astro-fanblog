export const playerPositions = [
  { value: 'torwart', label: 'Torwart' },
  { value: 'abwehr', label: 'Abwehr' },
  { value: 'mittelfeld', label: 'Mittelfeld' },
  { value: 'sturm', label: 'Sturm' },
] as const;

export const squadStatuses = [
  { value: 'first-team', label: 'Profikader' },
  { value: 'loan-in', label: 'Geliehen' },
  { value: 'on-loan', label: 'Verliehen' },
  { value: 'academy', label: 'Nachwuchs' },
  { value: 'departed', label: 'Abgang' },
] as const;

export const preferredFeet = ['links', 'rechts', 'beidfüßig'] as const;

export const playerChartTypes = [
  { value: 'radar', label: 'Radar-Chart' },
  { value: 'bar', label: 'Balkendiagramm' },
] as const;

export type PlayerChartType = (typeof playerChartTypes)[number]['value'];

export function isPlayerChartType(value: string): value is PlayerChartType {
  return playerChartTypes.some((chartType) => chartType.value === value);
}

export function playerChartTypeLabel(value: string) {
  return (
    playerChartTypes.find((chartType) => chartType.value === value)?.label ??
    value
  );
}

// 193 UN member states plus Palestine and the Holy See (UN observers).
// ISO 3166-1 alpha-2 codes match the existing flag-icons assets.
// Sources: https://www.un.org/en/about-us/member-states
// https://www.un.org/en/about-us/non-member-states
const countries = [
  ['af', 'Afghanistan', 'Afghanistan'],
  ['al', 'Albanien', 'Albania'],
  ['dz', 'Algerien', 'Algeria'],
  ['ad', 'Andorra', 'Andorra'],
  ['ao', 'Angola', 'Angola'],
  ['ag', 'Antigua und Barbuda', 'Antigua & Barbuda'],
  ['ar', 'Argentinien', 'Argentina'],
  ['am', 'Armenien', 'Armenia'],
  ['au', 'Australien', 'Australia'],
  ['at', 'Österreich', 'Austria'],
  ['az', 'Aserbaidschan', 'Azerbaijan'],
  ['bs', 'Bahamas', 'Bahamas'],
  ['bh', 'Bahrain', 'Bahrain'],
  ['bd', 'Bangladesch', 'Bangladesh'],
  ['bb', 'Barbados', 'Barbados'],
  ['by', 'Belarus', 'Belarus'],
  ['be', 'Belgien', 'Belgium'],
  ['bz', 'Belize', 'Belize'],
  ['bj', 'Benin', 'Benin'],
  ['bt', 'Bhutan', 'Bhutan'],
  ['bo', 'Bolivien', 'Bolivia'],
  ['ba', 'Bosnien und Herzegowina', 'Bosnia & Herzegovina'],
  ['bw', 'Botsuana', 'Botswana'],
  ['br', 'Brasilien', 'Brazil'],
  ['bn', 'Brunei Darussalam', 'Brunei'],
  ['bg', 'Bulgarien', 'Bulgaria'],
  ['bf', 'Burkina Faso', 'Burkina Faso'],
  ['bi', 'Burundi', 'Burundi'],
  ['cv', 'Cabo Verde', 'Cape Verde'],
  ['kh', 'Kambodscha', 'Cambodia'],
  ['cm', 'Kamerun', 'Cameroon'],
  ['ca', 'Kanada', 'Canada'],
  ['cf', 'Zentralafrikanische Republik', 'Central African Republic'],
  ['td', 'Tschad', 'Chad'],
  ['cl', 'Chile', 'Chile'],
  ['cn', 'China', 'China'],
  ['co', 'Kolumbien', 'Colombia'],
  ['km', 'Komoren', 'Comoros'],
  ['cg', 'Kongo-Brazzaville', 'Congo - Brazzaville'],
  ['cr', 'Costa Rica', 'Costa Rica'],
  ['ci', 'Côte d’Ivoire', 'Côte d’Ivoire'],
  ['hr', 'Kroatien', 'Croatia'],
  ['cu', 'Kuba', 'Cuba'],
  ['cy', 'Zypern', 'Cyprus'],
  ['cz', 'Tschechien', 'Czechia'],
  ['cd', 'Kongo-Kinshasa', 'Congo - Kinshasa'],
  ['dk', 'Dänemark', 'Denmark'],
  ['dj', 'Dschibuti', 'Djibouti'],
  ['dm', 'Dominica', 'Dominica'],
  ['do', 'Dominikanische Republik', 'Dominican Republic'],
  ['ec', 'Ecuador', 'Ecuador'],
  ['eg', 'Ägypten', 'Egypt'],
  ['sv', 'El Salvador', 'El Salvador'],
  ['gq', 'Äquatorialguinea', 'Equatorial Guinea'],
  ['er', 'Eritrea', 'Eritrea'],
  ['ee', 'Estland', 'Estonia'],
  ['sz', 'Eswatini', 'Eswatini'],
  ['et', 'Äthiopien', 'Ethiopia'],
  ['fj', 'Fidschi', 'Fiji'],
  ['fi', 'Finnland', 'Finland'],
  ['fr', 'Frankreich', 'France'],
  ['ga', 'Gabun', 'Gabon'],
  ['gm', 'Gambia', 'Gambia'],
  ['ge', 'Georgien', 'Georgia'],
  ['de', 'Deutschland', 'Germany'],
  ['gh', 'Ghana', 'Ghana'],
  ['gr', 'Griechenland', 'Greece'],
  ['gd', 'Grenada', 'Grenada'],
  ['gt', 'Guatemala', 'Guatemala'],
  ['gn', 'Guinea', 'Guinea'],
  ['gw', 'Guinea-Bissau', 'Guinea-Bissau'],
  ['gy', 'Guyana', 'Guyana'],
  ['ht', 'Haiti', 'Haiti'],
  ['hn', 'Honduras', 'Honduras'],
  ['hu', 'Ungarn', 'Hungary'],
  ['is', 'Island', 'Iceland'],
  ['in', 'Indien', 'India'],
  ['id', 'Indonesien', 'Indonesia'],
  ['ir', 'Iran', 'Iran'],
  ['iq', 'Irak', 'Iraq'],
  ['ie', 'Irland', 'Ireland'],
  ['il', 'Israel', 'Israel'],
  ['it', 'Italien', 'Italy'],
  ['jm', 'Jamaika', 'Jamaica'],
  ['jp', 'Japan', 'Japan'],
  ['jo', 'Jordanien', 'Jordan'],
  ['kz', 'Kasachstan', 'Kazakhstan'],
  ['ke', 'Kenia', 'Kenya'],
  ['ki', 'Kiribati', 'Kiribati'],
  ['kp', 'Nordkorea', 'North Korea'],
  ['kr', 'Südkorea', 'South Korea'],
  ['kw', 'Kuwait', 'Kuwait'],
  ['kg', 'Kirgisistan', 'Kyrgyzstan'],
  ['la', 'Laos', 'Laos'],
  ['lv', 'Lettland', 'Latvia'],
  ['lb', 'Libanon', 'Lebanon'],
  ['ls', 'Lesotho', 'Lesotho'],
  ['lr', 'Liberia', 'Liberia'],
  ['ly', 'Libyen', 'Libya'],
  ['li', 'Liechtenstein', 'Liechtenstein'],
  ['lt', 'Litauen', 'Lithuania'],
  ['lu', 'Luxemburg', 'Luxembourg'],
  ['mg', 'Madagaskar', 'Madagascar'],
  ['mw', 'Malawi', 'Malawi'],
  ['my', 'Malaysia', 'Malaysia'],
  ['mv', 'Malediven', 'Maldives'],
  ['ml', 'Mali', 'Mali'],
  ['mt', 'Malta', 'Malta'],
  ['mh', 'Marshallinseln', 'Marshall Islands'],
  ['mr', 'Mauretanien', 'Mauritania'],
  ['mu', 'Mauritius', 'Mauritius'],
  ['mx', 'Mexiko', 'Mexico'],
  ['fm', 'Mikronesien', 'Micronesia'],
  ['md', 'Republik Moldau', 'Moldova'],
  ['mc', 'Monaco', 'Monaco'],
  ['mn', 'Mongolei', 'Mongolia'],
  ['me', 'Montenegro', 'Montenegro'],
  ['ma', 'Marokko', 'Morocco'],
  ['mz', 'Mosambik', 'Mozambique'],
  ['mm', 'Myanmar', 'Myanmar (Burma)'],
  ['na', 'Namibia', 'Namibia'],
  ['nr', 'Nauru', 'Nauru'],
  ['np', 'Nepal', 'Nepal'],
  ['nl', 'Niederlande', 'Netherlands'],
  ['nz', 'Neuseeland', 'New Zealand'],
  ['ni', 'Nicaragua', 'Nicaragua'],
  ['ne', 'Niger', 'Niger'],
  ['ng', 'Nigeria', 'Nigeria'],
  ['mk', 'Nordmazedonien', 'North Macedonia'],
  ['no', 'Norwegen', 'Norway'],
  ['om', 'Oman', 'Oman'],
  ['pk', 'Pakistan', 'Pakistan'],
  ['pw', 'Palau', 'Palau'],
  ['pa', 'Panama', 'Panama'],
  ['pg', 'Papua-Neuguinea', 'Papua New Guinea'],
  ['py', 'Paraguay', 'Paraguay'],
  ['pe', 'Peru', 'Peru'],
  ['ph', 'Philippinen', 'Philippines'],
  ['pl', 'Polen', 'Poland'],
  ['pt', 'Portugal', 'Portugal'],
  ['qa', 'Katar', 'Qatar'],
  ['ro', 'Rumänien', 'Romania'],
  ['ru', 'Russland', 'Russia'],
  ['rw', 'Ruanda', 'Rwanda'],
  ['kn', 'St. Kitts und Nevis', 'St. Kitts & Nevis'],
  ['lc', 'St. Lucia', 'St. Lucia'],
  ['vc', 'St. Vincent und die Grenadinen', 'St. Vincent & Grenadines'],
  ['ws', 'Samoa', 'Samoa'],
  ['sm', 'San Marino', 'San Marino'],
  ['st', 'São Tomé und Príncipe', 'São Tomé & Príncipe'],
  ['sa', 'Saudi-Arabien', 'Saudi Arabia'],
  ['sn', 'Senegal', 'Senegal'],
  ['rs', 'Serbien', 'Serbia'],
  ['sc', 'Seychellen', 'Seychelles'],
  ['sl', 'Sierra Leone', 'Sierra Leone'],
  ['sg', 'Singapur', 'Singapore'],
  ['sk', 'Slowakei', 'Slovakia'],
  ['si', 'Slowenien', 'Slovenia'],
  ['sb', 'Salomonen', 'Solomon Islands'],
  ['so', 'Somalia', 'Somalia'],
  ['za', 'Südafrika', 'South Africa'],
  ['ss', 'Südsudan', 'South Sudan'],
  ['es', 'Spanien', 'Spain'],
  ['lk', 'Sri Lanka', 'Sri Lanka'],
  ['sd', 'Sudan', 'Sudan'],
  ['sr', 'Suriname', 'Suriname'],
  ['se', 'Schweden', 'Sweden'],
  ['ch', 'Schweiz', 'Switzerland'],
  ['sy', 'Syrien', 'Syria'],
  ['tj', 'Tadschikistan', 'Tajikistan'],
  ['tz', 'Tansania', 'Tanzania'],
  ['th', 'Thailand', 'Thailand'],
  ['tl', 'Timor-Leste', 'Timor-Leste'],
  ['tg', 'Togo', 'Togo'],
  ['to', 'Tonga', 'Tonga'],
  ['tt', 'Trinidad und Tobago', 'Trinidad & Tobago'],
  ['tn', 'Tunesien', 'Tunisia'],
  ['tr', 'Türkei', 'Türkiye'],
  ['tm', 'Turkmenistan', 'Turkmenistan'],
  ['tv', 'Tuvalu', 'Tuvalu'],
  ['ug', 'Uganda', 'Uganda'],
  ['ua', 'Ukraine', 'Ukraine'],
  ['ae', 'Vereinigte Arabische Emirate', 'United Arab Emirates'],
  ['gb', 'Vereinigtes Königreich', 'United Kingdom'],
  ['us', 'Vereinigte Staaten', 'United States'],
  ['uy', 'Uruguay', 'Uruguay'],
  ['uz', 'Usbekistan', 'Uzbekistan'],
  ['vu', 'Vanuatu', 'Vanuatu'],
  ['ve', 'Venezuela', 'Venezuela'],
  ['vn', 'Vietnam', 'Vietnam'],
  ['ye', 'Jemen', 'Yemen'],
  ['zm', 'Sambia', 'Zambia'],
  ['zw', 'Simbabwe', 'Zimbabwe'],
  ['ps', 'Palästinensische Autonomiegebiete', 'Palestinian Territories'],
  ['va', 'Vatikanstadt', 'Vatican City'],
] as const;

function normalizeCountryName(value: string) {
  return value.trim().normalize('NFC').toLocaleLowerCase('de-DE');
}

const countryCodes = new Map<string, string>();
for (const [code, german, english] of countries) {
  for (const name of [code, german, english]) {
    countryCodes.set(normalizeCountryName(name), code);
  }
}

const countryAliases: Record<string, string> = {
  england: 'gb-eng',
  schottland: 'gb-sct',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  nordirland: 'gb-nir',
  'northern ireland': 'gb-nir',
  palästina: 'ps',
  palestine: 'ps',
  'staat palästina': 'ps',
  'state of palestine': 'ps',
  vatikan: 'va',
  'heiliger stuhl': 'va',
  'holy see': 'va',
  'vereinigte staaten von amerika': 'us',
  'united states of america': 'us',
  usa: 'us',
  großbritannien: 'gb',
  'great britain': 'gb',
  uk: 'gb',
  turkey: 'tr',
  weißrussland: 'by',
  moldau: 'md',
  moldawien: 'md',
  'czech republic': 'cz',
  'tschechische republik': 'cz',
  brunei: 'bn',
  burma: 'mm',
  myanmar: 'mm',
  'kap verde': 'cv',
  elfenbeinküste: 'ci',
  'ivory coast': 'ci',
  "côte d'ivoire": 'ci',
  'republic of the congo': 'cg',
  'republik kongo': 'cg',
  'democratic republic of the congo': 'cd',
  'demokratische republik kongo': 'cd',
  'dr kongo': 'cd',
  'saint kitts and nevis': 'kn',
  'saint lucia': 'lc',
  'saint vincent and the grenadines': 'vc',
  'antigua and barbuda': 'ag',
  'bosnia and herzegovina': 'ba',
  'sao tome and principe': 'st',
  'são tomé and príncipe': 'st',
  'trinidad and tobago': 'tt',
  swasiland: 'sz',
  swaziland: 'sz',
  osttimor: 'tl',
  'east timor': 'tl',
};
for (const [name, code] of Object.entries(countryAliases)) {
  countryCodes.set(normalizeCountryName(name), code);
}

export function countryFlagCode(value: string | null) {
  if (!value) return 'un';
  return countryCodes.get(normalizeCountryName(value)) ?? 'un';
}

export interface RadarMetric {
  label: string;
  value: number;
}

export interface PerformanceMetricTemplate {
  key: string;
  label: string;
}

export const performanceMetricTemplates = {
  torwart: [
    { key: 'save_percentage', label: 'Paradenquote' },
    { key: 'pass_accuracy', label: 'Passquote' },
    { key: 'long_ball_accuracy', label: 'Lange Bälle' },
    { key: 'penalty_save_percentage', label: 'Elfmeterquote' },
    { key: 'duels_won', label: 'Zweikämpfe' },
  ],
  abwehr: [
    { key: 'pass_accuracy', label: 'Passquote' },
    { key: 'duels_won', label: 'Zweikämpfe' },
    { key: 'aerial_duels_won', label: 'Luftzweikämpfe' },
    { key: 'long_ball_accuracy', label: 'Lange Bälle' },
    { key: 'dribble_success', label: 'Dribblingquote' },
  ],
  mittelfeld: [
    { key: 'pass_accuracy', label: 'Passquote' },
    { key: 'duels_won', label: 'Zweikämpfe' },
    { key: 'dribble_success', label: 'Dribblingquote' },
    { key: 'long_ball_accuracy', label: 'Lange Bälle' },
    { key: 'cross_accuracy', label: 'Flankenquote' },
  ],
  sturm: [
    { key: 'shot_accuracy', label: 'Schussgenauigkeit' },
    { key: 'pass_accuracy', label: 'Passquote' },
    { key: 'duels_won', label: 'Zweikämpfe' },
    { key: 'aerial_duels_won', label: 'Luftzweikämpfe' },
    { key: 'dribble_success', label: 'Dribblingquote' },
  ],
} as const satisfies Record<string, readonly PerformanceMetricTemplate[]>;

export function performanceMetricsForPosition(position: string) {
  return (
    performanceMetricTemplates[
      position as keyof typeof performanceMetricTemplates
    ] ?? performanceMetricTemplates.mittelfeld
  );
}

export function positionLabel(value: string) {
  return (
    playerPositions.find((position) => position.value === value)?.label ?? value
  );
}

export function formatPlayerDate(value: string | null) {
  if (!value) return 'Nicht hinterlegt';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function calculateAge(value: string | null, now = new Date()) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  let age = now.getUTCFullYear() - year;
  if (
    now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

export function formatMarketValue(value: number | null) {
  if (value === null) return 'Nicht hinterlegt';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function isRadarMetrics(value: unknown): value is RadarMetric[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 10 &&
    value.every(
      (metric) =>
        typeof metric === 'object' &&
        metric !== null &&
        typeof (metric as RadarMetric).label === 'string' &&
        (metric as RadarMetric).label.trim().length > 0 &&
        Number.isFinite((metric as RadarMetric).value) &&
        (metric as RadarMetric).value >= 0 &&
        (metric as RadarMetric).value <= 100,
    )
  );
}
