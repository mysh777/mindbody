const NBSP = '\u00A0';

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// "18 634,75 €" with non-breaking spaces, independent of browser locale.
export function formatEur(value: number, decimals = 2): string {
  const sign = value < 0 ? '−' : '';
  const [intPart, frac] = Math.abs(value).toFixed(decimals).split('.');
  return `${sign}${groupThousands(intPart)}${frac ? `,${frac}` : ''}${NBSP}€`;
}

export function formatNumber(value: number, decimals = 0): string {
  const [intPart, frac] = Math.abs(value).toFixed(decimals).split('.');
  return `${value < 0 ? '−' : ''}${groupThousands(intPart)}${frac ? `,${frac}` : ''}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${formatNumber(value, decimals)}${NBSP}%`;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthIndex = (month: string) => Number(month.slice(5, 7)) - 1;

export const monthShort = (month: string) => `${MONTH_SHORT[monthIndex(month)]} ${month.slice(0, 4)}`;
export const monthFull = (month: string) => `${MONTH_FULL[monthIndex(month)]} ${month.slice(0, 4)}`;

export function shiftMonth(month: string, delta: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), monthIndex(month) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function lastDayOfMonth(month: string): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), monthIndex(month) + 1, 0));
  return `${month}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
