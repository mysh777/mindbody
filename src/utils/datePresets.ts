export type DatePreset =
  | 'last-year' | 'last-quarter' | 'last-month' | 'last-day'
  | 'ytd' | 'qtd' | 'mtd' | 'today'
  | 'prev-365' | 'prev-90' | 'prev-30' | 'prev-7'
  | 'custom';

export function toLocalISO(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

const fmt = toLocalISO;

function startOfQuarter(d: Date): Date {
  const qm = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qm, 1);
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

function endOfQuarter(d: Date): Date {
  const qm = Math.floor(d.getMonth() / 3) * 3;
  return endOfMonth(d.getFullYear(), qm + 2);
}

export function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const today = fmt(now);

  switch (preset) {
    // Last — completed full periods
    case 'last-year': {
      const y = now.getFullYear() - 1;
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case 'last-quarter': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { start: fmt(startOfQuarter(prev)), end: fmt(endOfQuarter(prev)) };
    }
    case 'last-month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: fmt(prev), end: fmt(endOfMonth(prev.getFullYear(), prev.getMonth())) };
    }
    case 'last-day': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }

    // To-Date — current period through today
    case 'ytd':
      return { start: `${now.getFullYear()}-01-01`, end: today };
    case 'qtd':
      return { start: fmt(startOfQuarter(now)), end: today };
    case 'mtd':
      return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: today };
    case 'today':
      return { start: today, end: today };

    // Previous — sliding window back from today
    case 'prev-365': {
      const s = new Date(now); s.setDate(s.getDate() - 365);
      return { start: fmt(s), end: today };
    }
    case 'prev-90': {
      const s = new Date(now); s.setDate(s.getDate() - 90);
      return { start: fmt(s), end: today };
    }
    case 'prev-30': {
      const s = new Date(now); s.setDate(s.getDate() - 30);
      return { start: fmt(s), end: today };
    }
    case 'prev-7': {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      return { start: fmt(s), end: today };
    }

    case 'custom':
      return { start: '', end: '' };
  }
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const s = new Date(year, month, 1);
  const e = new Date(year, month + 1, 0);
  return { start: fmt(s), end: fmt(e) };
}

export function getAvailableMonths(year: number): { label: string; month: number }[] {
  const now = new Date();
  const limit = year < now.getFullYear() ? 11 : now.getMonth();
  const result: { label: string; month: number }[] = [];
  for (let m = 0; m <= limit; m++) {
    result.push({ label: MONTH_LABELS[m], month: m });
  }
  return result;
}

export const PRESET_GROUPS: { label: string; presets: { key: DatePreset; label: string }[] }[] = [
  {
    label: 'Last',
    presets: [
      { key: 'last-year', label: 'Year' },
      { key: 'last-quarter', label: 'Quarter' },
      { key: 'last-month', label: 'Month' },
      { key: 'last-day', label: 'Day' },
    ],
  },
  {
    label: 'To-Date',
    presets: [
      { key: 'ytd', label: 'Year' },
      { key: 'qtd', label: 'Quarter' },
      { key: 'mtd', label: 'Month' },
      { key: 'today', label: 'Today' },
    ],
  },
  {
    label: 'Previous',
    presets: [
      { key: 'prev-365', label: '365 Days' },
      { key: 'prev-90', label: '90 Days' },
      { key: 'prev-30', label: '30 Days' },
      { key: 'prev-7', label: '7 Days' },
    ],
  },
];
