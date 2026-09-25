import { toLocalISO } from './datePresets';

export type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

export const formatPercent = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export function getFilterPresetDates(preset: FilterPreset): DateRange {
  const today = new Date();
  const todayStr = toLocalISO(today);

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return { start: toLocalISO(monday), end: todayStr };
    }
    case 'this_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toLocalISO(firstDay), end: todayStr };
    }
    case 'last_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toLocalISO(firstDay), end: toLocalISO(lastDay) };
    }
    case 'this_year': {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      return { start: toLocalISO(firstDay), end: todayStr };
    }
    default:
      return { start: todayStr, end: todayStr };
  }
}

export function getMonthsForTimeline(): { label: string; start: string; end: string }[] {
  const months: { label: string; start: string; end: string }[] = [];
  const today = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    months.push({
      label: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      start: toLocalISO(date),
      end: toLocalISO(lastDay),
    });
  }

  return months;
}
