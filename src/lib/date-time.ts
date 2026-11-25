const BERLIN_TIME_ZONE = 'Europe/Berlin';

// Validate by round-tripping local time. At the autumn overlap choose the
// later occurrence (standard time); reject the missing hour in spring.
export function berlinDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime)) return null;

  const candidates = new Set<number>();
  for (const hours of [-24, 0, 24]) {
    const probe = wallTime + hours * 3_600_000;
    const local = formatBerlinDateTimeLocal(probe);
    const offset = Date.parse(`${local}:00Z`) - probe;
    const candidate = wallTime - offset;
    if (formatBerlinDateTimeLocal(candidate) === value)
      candidates.add(candidate);
  }
  return candidates.size
    ? new Date(Math.max(...candidates)).toISOString()
    : null;
}

export function formatBerlinDateTimeLocal(
  value: Date | string | number = new Date(),
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
