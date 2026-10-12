import { useMemo, useState } from 'react';
import { Check, AlertCircle, HelpCircle, UserX, SkipForward, Search, RotateCcw, Trash2, Phone, Mail } from 'lucide-react';
import { contactMatch, type ClientIndex, type MatchMethod, type MatchStatus } from '../../utils/campaignMatch';
import type { CandidateStats } from '../../utils/campaignResults';
import { formatEur } from '../../utils/ownerFormat';
import { ClientLabel, ClientPicker } from './ClientPicker';

type CandidateStatsProp = Map<string, CandidateStats> | 'loading';

export interface ReviewRow {
  key: string;
  name: string;
  phone: string;
  email: string;
  leadAt: string | null;
  rowsMerged: number;
  status: MatchStatus;
  method: MatchMethod;
  clientId: string | null;
  candidateIds: string[];
}

export const METHOD_LABELS: Record<MatchMethod, string> = {
  mindbody_id: 'Mindbody ID',
  email: 'Email',
  phone: 'Phone',
  name: 'Full name',
  manual: 'Picked manually',
  none: '',
};

export function matchCounts(rows: ReviewRow[]) {
  const c = { mindbody_id: 0, email: 0, phone: 0, name: 0, manual: 0, ambiguous: 0, not_found: 0, skipped: 0 };
  for (const r of rows) {
    if (r.status === 'matched') c[r.method as 'mindbody_id' | 'email' | 'phone' | 'name' | 'manual']++;
    else c[r.status]++;
  }
  return c;
}

export const isFirstNameOnly = (r: ReviewRow) => r.status === 'ambiguous' && r.method === 'name' && !r.name.trim().includes(' ');

export const formatLead = (iso: string | null) => {
  if (!iso) return '';
  const [d, t] = iso.replace(' ', 'T').split('T');
  const [y, m, day] = d.split('-');
  const time = t ? t.slice(0, 5) : '';
  return `${day}.${m}.${y}${time && time !== '00:00' ? ` ${time}` : ''}`;
};

interface MatchReviewProps {
  rows: ReviewRow[];
  index: ClientIndex;
  onResolve: (key: string, clientId: string | null) => void;
  onRemove?: (key: string) => void;
  busyKey?: string | null;
  candidateStats?: CandidateStatsProp;
}

type Tab = 'attention' | 'matched' | 'all';

export function MatchReview({ rows, index, onResolve, onRemove, busyKey, candidateStats }: MatchReviewProps) {
  const counts = matchCounts(rows);
  const attention = counts.ambiguous + counts.not_found;
  const [tab, setTab] = useState<Tab>(attention > 0 ? 'attention' : 'all');
  const [searching, setSearching] = useState<string | null>(null);

  const visible = useMemo(() => rows.filter(r =>
    tab === 'all' || (tab === 'matched' ? r.status === 'matched' : r.status === 'ambiguous' || r.status === 'not_found')), [rows, tab]);

  const matchedTotal = counts.mindbody_id + counts.email + counts.phone + counts.name + counts.manual;
  const summary = [
    { label: 'Matched', value: matchedTotal, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check,
      detail: (['mindbody_id', 'email', 'phone', 'name', 'manual'] as const).filter(k => counts[k] > 0).map(k => `${METHOD_LABELS[k]} ${counts[k]}`).join(' · ') },
    { label: 'Ambiguous', value: counts.ambiguous, tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: HelpCircle, detail: 'several possible clients' },
    { label: 'Not found', value: counts.not_found, tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: UserX, detail: 'no matching client' },
    { label: 'Skipped', value: counts.skipped, tone: 'bg-slate-50 text-slate-600 border-slate-200', icon: SkipForward, detail: 'left out on purpose' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.map(s => (
          <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.tone}`}>
            <div className="flex items-center gap-2 text-sm font-medium"><s.icon className="w-4 h-4" />{s.label}</div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
            <div className="text-xs opacity-80 mt-0.5 truncate">{s.detail || '\u00a0'}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([['attention', `Needs a decision (${attention})`], ['matched', `Matched (${matchedTotal})`], ['all', `All (${rows.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {tab === 'attention' ? 'Every row has a decision. Nothing left to check.' : 'No rows here.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(r => (
              <div key={r.key} className={`px-4 py-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 ${busyKey === r.key ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex items-start gap-2">
                  {onRemove && (
                    <button onClick={() => window.confirm('Remove this person from the list?') && onRemove(r.key)}
                      className="text-slate-300 hover:text-rose-600 transition-colors mt-0.5" aria-label="Remove from list">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.name || <span className="text-slate-400">No name</span>}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {[r.phone, r.email, r.leadAt && `Lead ${formatLead(r.leadAt)}`, r.rowsMerged > 1 && `${r.rowsMerged} rows merged`].filter(Boolean).join(' · ')}
                  </div>
                  </div>
                </div>
                <RowDecision row={r} index={index} searching={searching === r.key} candidateStats={candidateStats}
                  onSearch={open => setSearching(open ? r.key : null)}
                  onResolve={id => { setSearching(null); onResolve(r.key, id); }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RowDecisionProps {
  row: ReviewRow;
  index: ClientIndex;
  searching: boolean;
  onSearch: (open: boolean) => void;
  onResolve: (clientId: string | null) => void;
  candidateStats?: CandidateStatsProp;
}

function RowDecision({ row, index, searching, onSearch, onResolve, candidateStats }: RowDecisionProps) {
  if (searching) return <ClientPicker index={index} autoFocus onPick={c => onResolve(c.id)} onClose={() => onSearch(false)} />;

  if (row.status === 'matched' && row.clientId) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <ClientLabel client={index.clients.get(row.clientId)} id={row.clientId} />
            <div className="text-xs text-emerald-700 mt-0.5">by {METHOD_LABELS[row.method].toLowerCase()}</div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <SmallButton onClick={() => onSearch(true)} icon={Search}>Change</SmallButton>
          <SmallButton onClick={() => onResolve(null)} icon={SkipForward}>Skip</SmallButton>
        </div>
      </div>
    );
  }

  if (row.status === 'skipped') {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">Skipped, not counted as a client</span>
        <SmallButton onClick={() => onSearch(true)} icon={RotateCcw}>Pick a client</SmallButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        {row.status === 'ambiguous' ? (
          <span className="text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />
            {isFirstNameOnly(row) ? 'First name only, check' : `${row.candidateIds.length} possible clients by ${METHOD_LABELS[row.method].toLowerCase()}`}
          </span>
        ) : <span className="text-rose-700 flex items-center gap-1"><UserX className="w-3.5 h-3.5" />Not found</span>}
      </div>
      {row.candidateIds.length > 0 && (
        <>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-medium text-slate-500">From the lead:</span>
            <ContactLine icon={Phone} value={row.phone} />
            <ContactLine icon={Mail} value={row.email} />
          </div>
          <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-1.5 max-h-80 overflow-auto pr-1">
            {sortCandidates(row, index).map(({ id, hit }) => {
              const c = index.clients.get(id);
              const strong = hit.phone || hit.email;
              return (
                <button key={id} onClick={() => onResolve(id)}
                  className={`text-left px-2.5 py-1.5 border rounded-lg transition-colors min-w-0 ${strong ? 'border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50' : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50'}`}>
                  <div className="text-xs font-medium text-slate-800 flex items-center justify-between gap-2">
                    <span className="truncate">{c?.name || `Client ${id}`}</span>
                    {strong && <span className="shrink-0 text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Same {[hit.phone && 'phone', hit.email && 'email'].filter(Boolean).join(' + ')}</span>}
                  </div>
                  <ContactLine icon={Phone} value={c?.phones.join(', ') ?? ''} highlight={hit.phone} small />
                  <ContactLine icon={Mail} value={c?.email ?? ''} highlight={hit.email} small />
                  {candidateStats && <CandidateFacts stats={candidateStats === 'loading' ? 'loading' : candidateStats.get(id)} />}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="flex gap-1">
        <SmallButton onClick={() => onSearch(true)} icon={Search}>Search a client</SmallButton>
        <SmallButton onClick={() => onResolve(null)} icon={SkipForward}>Skip</SmallButton>
      </div>
    </div>
  );
}

function sortCandidates(row: ReviewRow, index: ClientIndex) {
  const scored = row.candidateIds.map((id, i) => ({ id, i, hit: contactMatch(index.clients.get(id), row.phone, row.email) }));
  const score = (h: { phone: boolean; email: boolean }) => Number(h.phone) + Number(h.email);
  return scored.sort((a, b) => score(b.hit) - score(a.hit) || a.i - b.i);
}

function ContactLine({ icon: Icon, value, highlight, small }: { icon: typeof Phone; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div className={`flex items-center gap-1 min-w-0 ${small ? 'text-[11px] mt-0.5' : ''}`}>
      <Icon className={`w-3 h-3 shrink-0 ${highlight ? 'text-emerald-600' : 'text-slate-400'}`} />
      {value
        ? <span className={`truncate ${highlight ? 'bg-emerald-100 text-emerald-800 font-medium rounded px-1' : 'text-slate-600'}`}>{value}</span>
        : <span className="text-slate-400 italic">{Icon === Phone ? 'no phone' : 'no email'}</span>}
    </div>
  );
}

function CandidateFacts({ stats }: { stats: CandidateStats | 'loading' | undefined }) {
  if (stats === 'loading') return <div className="mt-1 h-3 w-32 bg-slate-100 rounded animate-pulse" />;
  if (!stats) return null;
  return (
    <div className="mt-1 pt-1 border-t border-slate-100 text-[11px] text-slate-600 tabular-nums space-x-2">
      <span>Card {stats.createdAt ? formatLead(stats.createdAt) : '-'}</span>
      <span className={stats.visits ? 'text-slate-800 font-medium' : ''}>{stats.visits} visit{stats.visits === 1 ? '' : 's'}</span>
      <span className={stats.moneyPaid ? 'text-slate-800 font-medium' : ''}>{formatEur(stats.moneyPaid)}</span>
    </div>
  );
}

function SmallButton({ onClick, icon: Icon, children }: { onClick: () => void; icon: typeof Search; children: string }) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-1">
      <Icon className="w-3.5 h-3.5" />{children}
    </button>
  );
}
