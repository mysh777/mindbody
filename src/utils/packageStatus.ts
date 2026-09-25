export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * A package is active when:
 *   current = true  AND  remaining > 0  AND  (no expiration OR expiration >= today)
 */
export function isPackageActive(
  cs: { current?: boolean; remaining: number; expiration_date: string | null },
  today?: string,
): boolean {
  if (cs.current === false) return false;
  if (cs.remaining <= 0) return false;
  if (!cs.expiration_date) return true;
  const t = today ?? toLocalISO(new Date());
  const exp = cs.expiration_date.slice(0, 10);
  return exp >= t;
}
