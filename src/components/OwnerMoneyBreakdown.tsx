import { Banknote, Gift, Wallet, X } from 'lucide-react';
import { NON_CASH_PAYMENT_TYPES } from '../hooks/useSalesByDateData';
import { formatEur } from '../utils/ownerFormat';
import type { MonthMetrics } from '../utils/ownerOverview';

interface Props {
  metrics: MonthMetrics;
  title: string;
  onClose: () => void;
}

const NOT_MONEY_NOTES: Record<string, string> = {
  'Account': 'Paid from client account balance (topped up earlier)',
  'Prepaid Gift Card': 'Paid with a gift card bought earlier',
  'Comp/Guest': 'Complimentary',
  'Other': 'Other non-cash',
};

function Row({ label, value, note, strong, indent }: { label: string; value: number; note?: string; strong?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${indent ? 'pl-5 text-slate-500' : ''}`}>
      <div className="min-w-0">
        <span className={`text-sm ${strong ? 'font-semibold text-slate-900' : indent ? '' : 'text-slate-700'}`}>{label}</span>
        {note && <p className="text-xs text-slate-400 leading-relaxed">{note}</p>}
      </div>
      <span className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-semibold text-slate-900' : indent ? '' : 'text-slate-800'}`}>{formatEur(value)}</span>
    </div>
  );
}

export function OwnerMoneyBreakdown({ metrics, title, onClose }: Props) {
  const byType = metrics.moneyByType || {};
  const moneyTypes = Object.entries(byType)
    .filter(([type, v]) => !NON_CASH_PAYMENT_TYPES.includes(type) && Math.abs(v) >= 0.005)
    .sort((a, b) => b[1] - a[1]);
  const notMoney = NON_CASH_PAYMENT_TYPES
    .map(type => [type, byType[type] || 0] as const)
    .filter(([, v]) => Math.abs(v) >= 0.005);
  const notMoneyTotal = notMoney.reduce((s, [, v]) => s + v, 0);
  const otherMoney = metrics.moneyReceived - metrics.moneyGiftCards - metrics.moneyDeposits;

  return (
    <div className="bg-white rounded-xl border border-sky-200 shadow-sm p-5 break-inside-avoid">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Money received — breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">{title}. Payments by sale date; same rules as the Money received card.</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors print:hidden" aria-label="Close breakdown">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"><Banknote className="w-4 h-4 text-sky-700" />By payment method</h4>
          <div className="divide-y divide-slate-100">
            {moneyTypes.length === 0 && <p className="py-2 text-sm text-slate-400">No payments this month.</p>}
            {moneyTypes.map(([type, v]) => <Row key={type} label={type} value={v} />)}
            <Row label="Money received" value={metrics.moneyReceived} strong />
          </div>
        </section>

        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"><Gift className="w-4 h-4 text-emerald-600" />What the money was for</h4>
          <div className="divide-y divide-slate-100">
            <Row label="Services, packages and products" value={otherMoney} />
            <Row label="Gift cards sold" value={metrics.moneyGiftCards} note="Money in now; the visits come later." />
            <Row label="Account top-ups" value={metrics.moneyDeposits} note="Money added to client balances." />
            <Row label="Money received" value={metrics.moneyReceived} strong />
          </div>
        </section>

        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"><Wallet className="w-4 h-4 text-amber-600" />Not money (not included)</h4>
          <div className="divide-y divide-slate-100">
            {notMoney.length === 0 && <p className="py-2 text-sm text-slate-400">None this month.</p>}
            {notMoney.map(([type, v]) => <Row key={type} label={type} value={v} note={NOT_MONEY_NOTES[type]} />)}
            {notMoney.length > 0 && <Row label="Total not money" value={notMoneyTotal} strong />}
          </div>
        </section>
      </div>
    </div>
  );
}
