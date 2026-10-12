import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, ArrowRight, Merge, Loader2 } from 'lucide-react';
import {
  readImportFile, detectHeaderRow, detectMapping, buildImportRows, mergeDuplicates, FIELD_LABELS,
  type ImportSheet, type ImportField, type ImportPerson,
} from '../../utils/campaignImport';
import { matchPerson, type ClientIndex } from '../../utils/campaignMatch';
import { createList, type NewMember } from '../../utils/campaignLists';
import { MatchReview, type ReviewRow } from './MatchReview';
import { SaveListForm } from './SaveListForm';

type Step = 'file' | 'sheet' | 'mapping' | 'review';

interface UploadWizardProps {
  index: ClientIndex | null;
  onCancel: () => void;
  onSaved: (listId: string) => void;
}

const FIELDS = Object.keys(FIELD_LABELS) as ImportField[];

export function UploadWizard({ index, onCancel, onSaved }: UploadWizardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheet, setSheet] = useState<ImportSheet | null>(null);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [people, setPeople] = useState<ImportPerson[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const chooseSheet = (s: ImportSheet) => {
    const h = detectHeaderRow(s.rows);
    setSheet(s);
    setHeaderIndex(h);
    setMapping(detectMapping(s.rows[h] ?? []));
    setStep('mapping');
  };

  const onFile = async (file: File) => {
    setError(null);
    setReading(true);
    try {
      const found = (await readImportFile(file)).filter(s => s.rows.length > 0);
      if (found.length === 0) throw new Error('The file has no rows.');
      setFileName(file.name);
      setSheets(found);
      if (found.length === 1) chooseSheet(found[0]);
      else setStep('sheet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally {
      setReading(false);
    }
  };

  const changeHeader = (h: number) => {
    setHeaderIndex(h);
    setMapping(detectMapping(sheet?.rows[h] ?? []));
  };

  const mapped = new Set<ImportField>(mapping.filter(f => f !== 'ignore'));
  const canMatch = (['fullName', 'firstName', 'lastName', 'phone', 'email', 'mindbodyId'] as const).some(f => mapped.has(f));

  const runMatching = () => {
    if (!sheet || !index) return;
    const imported = buildImportRows(sheet.rows, headerIndex, mapping);
    if (imported.length === 0) { setError('No rows with a name, phone, email or ID below the header.'); return; }
    const merged = mergeDuplicates(imported);
    setTotalRows(imported.length);
    setPeople(merged.people);
    setDuplicates(merged.duplicatesMerged);
    setRows(merged.people.map(p => {
      const m = matchPerson(p, index);
      return {
        key: String(p.position), name: p.name, phone: p.phone, email: p.email, leadAt: p.leadAt, rowsMerged: p.rowsMerged,
        status: m.status, method: m.method, clientId: m.clientId, candidateIds: m.candidateIds,
      };
    }));
    setError(null);
    setStep('review');
  };

  const resolve = (key: string, clientId: string | null) => setRows(prev => prev.map(r => r.key !== key ? r
    : clientId ? { ...r, status: 'matched', method: 'manual', clientId } : { ...r, status: 'skipped', clientId: null }));

  const toMembers = (): NewMember[] => rows.map((r, i) => {
    const p = people[i];
    return {
      client_id: r.clientId,
      lead_at: p.leadAt,
      input_name: p.name,
      input_phone: p.phone,
      input_email: p.email,
      input_mindbody_id: p.mindbodyId,
      match_method: r.status === 'matched' ? r.method : 'none',
      match_status: r.status,
      candidate_ids: r.candidateIds,
      rows_merged: p.rowsMerged,
      position: p.position,
    };
  });

  const preview = sheet ? sheet.rows.slice(headerIndex + 1, headerIndex + 6) : [];
  const width = sheet ? Math.max(...sheet.rows.slice(0, 50).map(r => r.length), 0) : 0;
  const defaultName = fileName.replace(/\.(xlsx|xls|csv)$/i, '');

  return (
    <div className="space-y-5">
      <button onClick={step === 'file' ? onCancel : () => setStep(step === 'review' ? 'mapping' : step === 'mapping' && sheets.length > 1 ? 'sheet' : 'file')}
        className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4" />{step === 'file' ? 'Back to lists' : 'Back'}
      </button>

      <Steps step={step} />

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {step === 'file' && (
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
          className="w-full border-2 border-dashed border-slate-300 rounded-2xl bg-white py-16 flex flex-col items-center gap-3 hover:border-teal-400 hover:bg-teal-50/40 transition-colors group"
        >
          {reading ? <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
            : <Upload className="w-10 h-10 text-slate-400 group-hover:text-teal-600 transition-colors" />}
          <div className="text-base font-medium text-slate-800">Drop an Excel or CSV file here, or click to choose</div>
          <div className="text-sm text-slate-500 max-w-md text-center leading-relaxed">
            Columns can be lead date, full name, first name, last name, phone, email and Mindbody client ID. Headers in English, Latvian or Russian are recognised.
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </button>
      )}

      {step === 'sheet' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-slate-900">This file has {sheets.length} sheets. Which one holds the list?</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {sheets.map(s => (
              <button key={s.name} onClick={() => chooseSheet(s)}
                className="text-left border border-slate-200 rounded-lg px-4 py-3 hover:border-teal-400 hover:bg-teal-50 transition-colors">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><FileSpreadsheet className="w-4 h-4 text-emerald-600" />{s.name}</div>
                <div className="text-xs text-slate-500 mt-1">{s.rows.length} rows</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'mapping' && sheet && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Confirm the columns</h3>
              <p className="text-sm text-slate-500 mt-1">{fileName} · sheet "{sheet.name}". Check what each column holds and correct it if needed.</p>
            </div>
            <label className="text-sm text-slate-600 flex items-center gap-2">
              Header row
              <select value={headerIndex} onChange={e => changeHeader(+e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                {sheet.rows.slice(0, 15).map((_, i) => <option key={i} value={i}>Row {i + 1}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="text-sm min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  {Array.from({ length: width }, (_, i) => (
                    <th key={i} className="px-3 py-2 text-left align-top border-r border-slate-200 last:border-0 min-w-[150px]">
                      <div className="text-xs font-medium text-slate-500 truncate mb-1.5">{String(sheet.rows[headerIndex]?.[i] ?? '') || `Column ${i + 1}`}</div>
                      <select value={mapping[i] ?? 'ignore'}
                        onChange={e => setMapping(prev => Array.from({ length: width }, (_, j) => (j === i ? e.target.value as ImportField : prev[j] ?? 'ignore')))}
                        className={`w-full border rounded-md px-2 py-1 text-sm ${mapping[i] && mapping[i] !== 'ignore' ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-500'}`}>
                        {FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i} className="px-3 py-1.5 text-slate-700 truncate max-w-[220px] border-r border-slate-100 last:border-0">
                        {r[i] instanceof Date ? (r[i] as Date).toLocaleString('en-GB') : String(r[i] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-slate-500">
              {sheet.rows.length - headerIndex - 1} data rows{!mapped.has('leadDate') && ' · no lead date column: results will use a fixed period'}
            </span>
            <button onClick={runMatching} disabled={!canMatch || !index}
              className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
              {!index ? <><Loader2 className="w-4 h-4 animate-spin" />Loading clients</> : <>Match to clients<ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}

      {step === 'review' && index && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span className="text-slate-600">Rows in file <b className="text-slate-900">{totalRows}</b></span>
            <span className="text-slate-600">Unique people <b className="text-slate-900">{people.length}</b></span>
            <span className="text-slate-600 flex items-center gap-1.5"><Merge className="w-4 h-4 text-teal-600" />Duplicates merged <b className="text-slate-900">{duplicates}</b>
              <span className="text-xs text-slate-400">(same phone or email, earliest lead date kept)</span></span>
          </div>
          <MatchReview rows={rows} index={index} onResolve={resolve} />
          <SaveListForm defaultName={defaultName} hint="Rows you have not decided on are saved as they are; you can resolve them later in the list."
            onSave={fields => createList({ ...fields, source: 'upload' }, toMembers())}
            onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const order: [Step, string][] = [['file', 'Upload'], ['mapping', 'Columns'], ['review', 'Match & save']];
  const current = step === 'sheet' ? 0 : order.findIndex(([s]) => s === step);
  return (
    <div className="flex items-center gap-2">
      {order.map(([s, label], i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${i <= current ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
          <span className={`text-sm ${i === current ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>{label}</span>
          {i < order.length - 1 && <div className={`w-10 h-px ${i < current ? 'bg-teal-500' : 'bg-slate-300'}`} />}
        </div>
      ))}
    </div>
  );
}
