export function parseBanHours(form: FormData): number | null {
  if (form.get('ban') !== 'on') return 0;
  const duration = Number(form.get('duration'));
  const unit = form.get('unit');
  if (
    !Number.isSafeInteger(duration) ||
    duration < 1 ||
    !['hours', 'days'].includes(String(unit))
  )
    return null;
  const hours = duration * (unit === 'days' ? 24 : 1);
  return hours <= 8760 ? hours : null;
}

export function moderationPage(value: string | null) {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}
