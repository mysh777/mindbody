import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import type { MenuSection } from '../lib/pages';
import { formatEur, formatNumber, formatPct, monthShort, percentChange } from '../utils/ownerFormat';

export interface CardLink {
  section: MenuSection;
  params: Record<string, string>;
}

export interface OverviewCard {
  id: string;
  label: string;
  value: number | null;
  format: 'eur' | 'count';
  secondary?: string;
  hint?: string;
  prevMonth?: number;
  lastYear?: number;
  neutral?: boolean;
  note?: string;
  link?: CardLink;
  onToggle?: () => void;
  expanded?: boolean;
}

interface CardsProps {
  cards: OverviewCard[];
  prevMonth: string;
  lastYearMonth: string;
  incomplete: boolean;
  onOpen: (link: CardLink) => void;
}

const fmt = (v: number | null, format: OverviewCard['format']) => {
  if (v === null) return '—';
  return format === 'eur' ? formatEur(v) : formatNumber(v);
};

function Change({ label, current, previous, neutral }: { label: string; current: number; previous?: number; neutral?: boolean }) {
  const pct = percentChange(current, previous);
  if (pct === null) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-400">no data</span>
      </div>
    );
  }
  const up = pct > 0.05;
  const down = pct < -0.05;
  const tone = neutral || (!up && !down) ? 'text-slate-500' : up ? 'text-emerald-600' : 'text-red-600';
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-400 truncate">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
        {pct > 0 ? '+' : ''}{formatPct(pct)}
      </span>
    </div>
  );
}

export function OwnerOverviewCards({ cards, prevMonth, lastYearMonth, incomplete, onOpen }: CardsProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-5 gap-4 print:gap-2 transition-opacity ${incomplete ? 'opacity-60' : ''}`}>
      {cards.map(card => (
        <button
          key={card.id}
          onClick={() => (card.onToggle ? card.onToggle() : card.link && onOpen(card.link))}
          aria-expanded={card.onToggle ? !!card.expanded : undefined}
          className={`group text-left bg-white rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-sky-300 hover:-translate-y-0.5 transition-all duration-200 print:p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 break-inside-avoid ${card.expanded ? 'border-sky-400 ring-1 ring-sky-200' : 'border-slate-200'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">{card.label}</span>
            {card.hint && <Info className="w-4 h-4 shrink-0 text-slate-300" />}
          </div>
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl print:text-lg font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmt(card.value, card.format)}</span>
            {card.secondary && <span className="text-sm font-medium text-slate-500 tabular-nums">{card.secondary}</span>}
          </div>
          {card.note || card.value === null ? (
            <p className="mt-3 print:mt-1 text-xs text-slate-500 leading-relaxed">{card.note}</p>
          ) : (
            <div className="mt-3 print:mt-1 space-y-1 print:space-y-0 border-t border-slate-100 pt-3 print:pt-1">
              <Change label={`vs ${monthShort(prevMonth)}`} current={card.value} previous={card.prevMonth} neutral={card.neutral} />
              <Change label={`vs ${monthShort(lastYearMonth)}`} current={card.value} previous={card.lastYear} neutral={card.neutral} />
            </div>
          )}
          {card.hint && <p className="mt-3 text-xs text-slate-500 leading-relaxed summary-hide">{card.hint}</p>}
          <span className={`mt-3 block text-xs font-medium text-sky-700 transition-opacity print:hidden ${card.expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {card.onToggle ? (card.expanded ? 'Hide breakdown' : 'Show breakdown') : 'Open report →'}
          </span>
        </button>
      ))}
    </div>
  );
}
