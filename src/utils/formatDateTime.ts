/**
 * Appointment datetimes in the DB store local studio time tagged as UTC.
 * Using local Date methods would shift them by the browser's timezone offset.
 * These helpers read the UTC components so the displayed value matches the
 * original studio-local time regardless of the viewer's timezone.
 *
 * Sale datetimes (sale_datetime) are real UTC — use normal Date methods for those.
 */

/** DD.MM.YYYY — timezone-safe for appointment datetimes */
export function formatApptDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getUTCDate().toString().padStart(2, '0')}.${(d.getUTCMonth() + 1).toString().padStart(2, '0')}.${d.getUTCFullYear()}`;
  } catch {
    return dateStr;
  }
}

/** HH:MM — timezone-safe for appointment datetimes */
export function formatApptTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** DD.MM.YYYY HH:MM — timezone-safe for appointment datetimes */
export function formatApptDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = formatApptDate(dateStr);
  const time = formatApptTime(dateStr);
  return time ? `${date} ${time}` : date;
}
