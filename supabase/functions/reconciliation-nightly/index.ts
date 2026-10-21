import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import postgres from "npm:pg@8.13.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let cachedCronSecret: string | null = null;

async function getCronSecret(client: ReturnType<typeof createClient>): Promise<string> {
  if (cachedCronSecret !== null) return cachedCronSecret;
  const { data } = await client.from("_cron_secret").select("secret").eq("id", 1).maybeSingle();
  cachedCronSecret = data?.secret ?? "";
  return cachedCronSecret;
}

async function isAuthorized(req: Request): Promise<boolean> {
  const cronHeader = req.headers.get("X-Cron-Secret");
  if (cronHeader) {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const secret = await getCronSecret(client);
    if (secret && cronHeader === secret) return true;
  }
  const auth = req.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data } = await client.auth.getUser(token);
    if (data.user) return true;
  }
  return false;
}

// ===== FIFO Sales Calculation (same logic as frontend computeSalesByDateData) =====

const POA_ITEM_IDS = new Set(["-6", "10289"]);
const GIFT_CARD_PATTERN = /D[AĀ]VANU KARTE/i;
const NON_CASH_TYPES = ["Prepaid Gift Card", "Account", "Comp/Guest", "Other"];

function isPoA(itemId: string | null, description: string | null): boolean {
  if (description === "Payment on Account") return true;
  if (itemId && POA_ITEM_IDS.has(itemId)) return true;
  return false;
}

function isGiftCard(description: string | null): boolean {
  return !!description && GIFT_CARD_PATTERN.test(description);
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function payBreakdown(payments: { type: string | null; amount: number | null }[]) {
  let paidAll = 0, paidCash = 0, paidAccount = 0;
  let hasCash = false;
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    paidAll += amt;
    const t = (p.type || "").trim();
    if (t === "Account") paidAccount += amt;
    else if (!NON_CASH_TYPES.includes(t)) { paidCash += amt; if (amt !== 0) hasCash = true; }
  }
  return { paidAll, paidCash, paidAccount, hasCash };
}

interface BalanceEvent {
  idx: number; saleId: string; saleDate: string; locationId: string;
  kind: "debit" | "cash_credit" | "noncash_credit";
  amount: number; remaining: number;
  tariffName: string | null; tariffCategory: string | null; isService: boolean;
}

interface CtEntry { revenue: number; qty: number; details: { saleId: string; saleDate: string; amount: number; rule: string; debitDate?: string }[] }

interface SalesResult {
  rows: { pricingOptionName: string; category: string; qtySold: number; revenue: number }[];
  unallocatedAmount: number;
  clientTariffBreakdown: Map<string, CtEntry>;
}

function periodToRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

async function computeSalesForPeriod(
  pg: postgres.Client,
  period: string,
  poByMbId: Map<string, { name: string; category: string }>,
  poByNameNorm: Map<string, string>,
  poByCatId: Map<string, string>,
): Promise<SalesResult> {
  const { start, end } = periodToRange(period);

  // Load sales for this period
  const salesRes = await pg.query(
    `SELECT id, client_id, location_id::text, to_char(sale_date, 'YYYY-MM-DD') as sale_date
     FROM sales WHERE sale_date >= $1 AND sale_date <= $2 ORDER BY id`,
    [start, end],
  );
  const periodSales = salesRes.rows as { id: string; client_id: string | null; location_id: string | null; sale_date: string | null }[];
  if (periodSales.length === 0) {
    return { rows: [], unallocatedAmount: 0, clientTariffBreakdown: new Map() };
  }
  const saleIds = periodSales.map((s) => s.id);
  const salesById = new Map(periodSales.map((s) => [s.id, s]));

  // Load items + payments in bulk
  const [itemRes, payRes] = await Promise.all([
    pg.query(
      `SELECT sale_id, item_id, total_amount::numeric, is_service, description, returned, category_id
       FROM sale_items WHERE sale_id = ANY($1)`,
      [saleIds],
    ),
    pg.query(
      `SELECT sale_id, type, amount::numeric FROM payments WHERE sale_id = ANY($1)`,
      [saleIds],
    ),
  ]);
  const periodItems = itemRes.rows as { sale_id: string; item_id: string | null; total_amount: string | null; is_service: boolean | null; description: string | null; returned: boolean | null; category_id: number | null }[];
  const periodPayments = payRes.rows as { sale_id: string; type: string | null; amount: string | null }[];

  // Normalize numeric fields
  const items = periodItems.map((si) => ({
    ...si,
    total_amount: si.total_amount ? Number(si.total_amount) : null,
  }));
  const payments = periodPayments.map((p) => ({
    ...p,
    amount: p.amount ? Number(p.amount) : null,
  }));

  // Build lookup maps
  const payBySale = new Map<string, typeof payments>();
  for (const p of payments) {
    if (!payBySale.has(p.sale_id)) payBySale.set(p.sale_id, []);
    payBySale.get(p.sale_id)!.push(p);
  }
  const itemsBySale = new Map<string, typeof items>();
  for (const si of items) {
    if (!itemsBySale.has(si.sale_id)) itemsBySale.set(si.sale_id, []);
    itemsBySale.get(si.sale_id)!.push(si);
  }

  function resolveCategory(description: string | null, categoryId: number | null): string {
    if (description) {
      const match = poByNameNorm.get(normalizeName(description));
      if (match) return match;
    }
    if (categoryId != null) {
      const match = poByCatId.get(String(categoryId));
      if (match) return match;
    }
    return "Other services";
  }

  // Build category_id → revenue_category from catalogued items
  for (const si of items) {
    if (si.category_id == null) continue;
    const cidStr = String(si.category_id);
    if (poByCatId.has(cidStr)) continue;
    const itemIdStr = si.item_id != null ? String(si.item_id) : null;
    const po = itemIdStr ? poByMbId.get(itemIdStr) : null;
    if (po?.category) poByCatId.set(cidStr, po.category);
  }

  const tariffMap: Record<string, { pricingOptionName: string; category: string; qtySold: number; revenue: number }> = {};
  const ctBreakdown = new Map<string, CtEntry>();
  const poaClients = new Set<string>();

  // RULE 1+2: Direct revenue
  for (const si of items) {
    const itemIdStr = si.item_id != null ? String(si.item_id) : null;
    if (isPoA(itemIdStr, si.description)) {
      const sale = salesById.get(si.sale_id);
      if (sale?.client_id) poaClients.add(sale.client_id);
      continue;
    }
    if (isGiftCard(si.description)) continue;
    const po = itemIdStr ? poByMbId.get(itemIdStr) : null;
    if (!po && !si.is_service) continue;
    if (!po && !itemIdStr) continue;
    const tariffName = po ? po.name : (si.description || "Unknown service");
    const tariffCategory = po ? po.category : resolveCategory(si.description, si.category_id);
    const bd = payBreakdown(payBySale.get(si.sale_id) || []);
    if (!bd.hasCash) continue;
    const totalAmt = Number(si.total_amount) || 0;
    const revenue = bd.paidAll !== 0 ? (totalAmt * bd.paidCash) / bd.paidAll : 0;
    const qty = totalAmt < 0 ? -1 : 1;
    if (!tariffMap[tariffName]) tariffMap[tariffName] = { pricingOptionName: tariffName, category: tariffCategory, qtySold: 0, revenue: 0 };
    tariffMap[tariffName].qtySold += qty;
    tariffMap[tariffName].revenue += revenue;
    const sale = salesById.get(si.sale_id);
    if (sale?.client_id) {
      const ctKey = `${sale.client_id}|${tariffName}`;
      let ct = ctBreakdown.get(ctKey);
      if (!ct) { ct = { revenue: 0, qty: 0, details: [] }; ctBreakdown.set(ctKey, ct); }
      ct.revenue += revenue; ct.qty += qty;
      ct.details.push({ saleId: si.sale_id, saleDate: (sale.sale_date || "").slice(0, 10), amount: revenue, rule: "cash" });
    }
  }

  // RULE 3: FIFO for PoA clients — load full client histories in bulk
  let totalUnallocated = 0;
  if (poaClients.size > 0) {
    const poaList = [...poaClients];
    const clientSalesRes = await pg.query(
      `SELECT id, client_id, location_id::text, to_char(sale_date, 'YYYY-MM-DD') as sale_date
       FROM sales WHERE client_id = ANY($1) ORDER BY sale_date, id`,
      [poaList],
    );
    const allClientSales = clientSalesRes.rows as { id: string; client_id: string | null; location_id: string | null; sale_date: string | null }[];
    const clientSaleIds = allClientSales.map((s) => s.id);

    const [clientItemsRes, clientPayRes] = await Promise.all([
      pg.query(`SELECT sale_id, item_id, total_amount::numeric, is_service, description, returned, category_id FROM sale_items WHERE sale_id = ANY($1)`, [clientSaleIds]),
      pg.query(`SELECT sale_id, type, amount::numeric FROM payments WHERE sale_id = ANY($1)`, [clientSaleIds]),
    ]);
    const allClientItems = (clientItemsRes.rows as typeof periodItems).map((si) => ({ ...si, total_amount: si.total_amount ? Number(si.total_amount) : null }));
    const allClientPayments = (clientPayRes.rows as typeof periodPayments).map((p) => ({ ...p, amount: p.amount ? Number(p.amount) : null }));

    for (const clientId of poaList) {
      const cSales = allClientSales.filter((s) => s.client_id === clientId);
      const cSaleIds = new Set(cSales.map((s) => s.id));
      const cItems = allClientItems.filter((si) => cSaleIds.has(si.sale_id));
      const cPayments = allClientPayments.filter((p) => cSaleIds.has(p.sale_id));

      const cPayBySale = new Map<string, typeof cPayments>();
      for (const p of cPayments) {
        if (!cPayBySale.has(p.sale_id)) cPayBySale.set(p.sale_id, []);
        cPayBySale.get(p.sale_id)!.push(p);
      }
      const cItemsBySale = new Map<string, typeof cItems>();
      for (const si of cItems) {
        if (!cItemsBySale.has(si.sale_id)) cItemsBySale.set(si.sale_id, []);
        cItemsBySale.get(si.sale_id)!.push(si);
      }

      let eventIdx = 0;
      const events: BalanceEvent[] = [];

      for (const sale of cSales) {
        const saleItems = cItemsBySale.get(sale.id) || [];
        const bd = payBreakdown(cPayBySale.get(sale.id) || []);
        let poaItemTotal = 0;
        for (const si of saleItems) {
          const iid = si.item_id != null ? String(si.item_id) : null;
          if (isPoA(iid, si.description)) poaItemTotal += Number(si.total_amount) || 0;
        }
        const nonPoaTotal = bd.paidAll - poaItemTotal;

        for (const si of saleItems) {
          const totalAmt = Number(si.total_amount) || 0;
          const itemIdStr = si.item_id != null ? String(si.item_id) : null;

          if (isPoA(itemIdStr, si.description)) {
            const poaDenom = bd.paidAll - bd.paidAccount;
            if (poaDenom !== 0) {
              const cashPortion = (totalAmt * bd.paidCash) / poaDenom;
              const nonCashPortion = totalAmt - cashPortion;
              if (Math.abs(cashPortion) > 0.001)
                events.push({ idx: eventIdx++, saleId: sale.id, saleDate: (sale.sale_date || "").slice(0, 10), locationId: sale.location_id || "", kind: "cash_credit", amount: Math.abs(cashPortion), remaining: Math.abs(cashPortion), tariffName: null, tariffCategory: null, isService: false });
              if (Math.abs(nonCashPortion) > 0.001)
                events.push({ idx: eventIdx++, saleId: sale.id, saleDate: (sale.sale_date || "").slice(0, 10), locationId: sale.location_id || "", kind: "noncash_credit", amount: Math.abs(nonCashPortion), remaining: Math.abs(nonCashPortion), tariffName: null, tariffCategory: null, isService: false });
            }
            continue;
          }
          if (isGiftCard(si.description)) continue;
          if (totalAmt < 0 && bd.paidAccount < 0) {
            const refundAmt = Math.abs((totalAmt * bd.paidAccount) / bd.paidAll);
            if (refundAmt > 0.001)
              events.push({ idx: eventIdx++, saleId: sale.id, saleDate: (sale.sale_date || "").slice(0, 10), locationId: sale.location_id || "", kind: "noncash_credit", amount: refundAmt, remaining: refundAmt, tariffName: null, tariffCategory: null, isService: false });
            continue;
          }
          if (bd.paidAccount !== 0 && bd.paidAll !== 0) {
            const denom = nonPoaTotal !== 0 ? nonPoaTotal : bd.paidAll;
            const accountPortion = Math.abs((totalAmt * bd.paidAccount) / denom);
            if (accountPortion > 0.001) {
              const po = itemIdStr ? poByMbId.get(itemIdStr) : null;
              const tName = po ? (po.name || "Unknown") : (si.description || "Unknown");
              const tCat = po ? (po.category || "") : resolveCategory(si.description, si.category_id);
              events.push({ idx: eventIdx++, saleId: sale.id, saleDate: (sale.sale_date || "").slice(0, 10), locationId: sale.location_id || "", kind: "debit", amount: accountPortion, remaining: accountPortion, tariffName: tName, tariffCategory: tCat, isService: !!po || !!si.is_service });
            }
          }
        }
      }

      events.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.saleId.localeCompare(b.saleId) || a.idx - b.idx);

      // FIFO matching
      const unmatchedDebits: BalanceEvent[] = [];
      const unmatchedCredits: BalanceEvent[] = [];
      const matches: { credit: BalanceEvent; debit: BalanceEvent; amount: number }[] = [];

      for (const ev of events) {
        if (ev.kind === "debit") {
          for (let i = 0; i < unmatchedCredits.length && ev.remaining > 0.001;) {
            const cr = unmatchedCredits[i];
            const m = Math.min(ev.remaining, cr.remaining);
            ev.remaining -= m; cr.remaining -= m;
            matches.push({ credit: cr, debit: ev, amount: m });
            if (cr.remaining < 0.001) unmatchedCredits.splice(i, 1); else i++;
          }
          if (ev.remaining > 0.001) unmatchedDebits.push(ev);
        } else {
          for (let i = 0; i < unmatchedDebits.length && ev.remaining > 0.001;) {
            const db = unmatchedDebits[i];
            const m = Math.min(ev.remaining, db.remaining);
            ev.remaining -= m; db.remaining -= m;
            matches.push({ credit: ev, debit: db, amount: m });
            if (db.remaining < 0.001) unmatchedDebits.splice(i, 1); else i++;
          }
          if (ev.remaining > 0.001) unmatchedCredits.push(ev);
        }
      }

      // Aggregate FIFO matches
      const fifoAgg = new Map<string, { tariffCategory: string; revenue: number; creditIdxes: Set<number> }>();
      for (const m of matches) {
        if (m.credit.kind !== "cash_credit") continue;
        const cd = m.credit.saleDate.slice(0, 10);
        if (cd < start || cd > end) continue;
        if (!m.debit.isService) continue;
        const tName = m.debit.tariffName || "Unknown";
        let agg = fifoAgg.get(tName);
        if (!agg) { agg = { tariffCategory: m.debit.tariffCategory || "", revenue: 0, creditIdxes: new Set() }; fifoAgg.set(tName, agg); }
        agg.revenue += m.amount;
        agg.creditIdxes.add(m.credit.idx);
      }

      for (const [tName, agg] of fifoAgg) {
        if (!tariffMap[tName]) tariffMap[tName] = { pricingOptionName: tName, category: agg.tariffCategory, qtySold: 0, revenue: 0 };
        tariffMap[tName].revenue += agg.revenue;
        tariffMap[tName].qtySold += agg.creditIdxes.size;
        const ctKey = `${clientId}|${tName}`;
        let ct = ctBreakdown.get(ctKey);
        if (!ct) { ct = { revenue: 0, qty: 0, details: [] }; ctBreakdown.set(ctKey, ct); }
        ct.revenue += agg.revenue;
        ct.qty += agg.creditIdxes.size;
        for (const m2 of matches) {
          if (m2.credit.kind !== "cash_credit") continue;
          if ((m2.debit.tariffName || "Unknown") !== tName) continue;
          const cd2 = m2.credit.saleDate.slice(0, 10);
          if (cd2 < start || cd2 > end) continue;
          if (!m2.debit.isService) continue;
          ct.details.push({ saleId: m2.credit.saleId, saleDate: cd2, amount: m2.amount, rule: "fifo", debitDate: m2.debit.saleDate });
        }
      }

      // Unallocated
      for (const ev of unmatchedCredits) {
        if (ev.kind !== "cash_credit") continue;
        const cd = ev.saleDate.slice(0, 10);
        if (cd < start || cd > end) continue;
        totalUnallocated += ev.remaining;
      }
    }
  }

  return {
    rows: Object.values(tariffMap).sort((a, b) => b.revenue - a.revenue),
    unallocatedAmount: totalUnallocated,
    clientTariffBreakdown: ctBreakdown,
  };
}

// ===== Email =====

async function sendEmailViaResend(recipients: string, subject: string, body: string): Promise<{ sent: boolean; error: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  const emails = recipients.split(",").map((e) => e.trim()).filter(Boolean);
  if (emails.length === 0) return { sent: false, error: "No recipients configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Reconciliation <onboarding@resend.dev>", to: emails, subject, text: body }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return { sent: false, error: `Resend API error ${response.status}: ${errText}` };
    }
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ===== Main reconciliation logic =====

interface ReconResult {
  allOk: boolean;
  checkedAt: string;
  provisionalMismatches: number;
  autoConfirmed: { period: string; checkType: string; checkKey: string; originalExpected: number; actualValue: number; diff: number; explanation: string; fifoDetails: { client: string; date: string; amount: number }[] }[];
  errors: string[];
  snapshotSaved: boolean;
  snapshotMessage: string | null;
}

async function runReconciliation(pg: postgres.Client): Promise<ReconResult> {
  const errors: string[] = [];
  const autoConfirmed: ReconResult["autoConfirmed"] = [];
  let allOk = true;
  let provisionalMismatches = 0;

  // Load pricing options
  const poRes = await pg.query("SELECT mindbody_id::text, name, COALESCE(revenue_category, '') as category FROM pricing_options WHERE mindbody_id IS NOT NULL");
  const poByMbId = new Map<string, { name: string; category: string }>();
  const poByNameNorm = new Map<string, string>();
  const poByCatId = new Map<string, string>();
  for (const po of poRes.rows as { mindbody_id: string; name: string; category: string }[]) {
    poByMbId.set(po.mindbody_id, { name: po.name || "", category: po.category });
    if (po.name) { const norm = normalizeName(po.name); if (!poByNameNorm.has(norm) && po.category) poByNameNorm.set(norm, po.category); }
  }

  // Load references
  const refRes = await pg.query("SELECT period, metric, location, value::numeric FROM reconciliation_references ORDER BY period");
  const refs = refRes.rows as { period: string; metric: string; location: string; value: number }[];
  const refPeriods = [...new Set(refs.map((r) => r.period))];

  // Load cases
  const caseRes = await pg.query("SELECT case_number, description, period, location, client_id, tariff_name, expected_value::numeric, expected_qty, tolerance::numeric, note FROM reconciliation_cases ORDER BY case_number");
  const cases = caseRes.rows as { case_number: number; description: string; period: string; location: string; client_id: string | null; tariff_name: string | null; expected_value: number | null; expected_qty: number | null; tolerance: number | null; note: string | null }[];

  // Load baseline
  const baselineRes = await pg.query("SELECT period, report, location, key, qty, value::numeric FROM reconciliation_baseline WHERE period = ANY($1)", [refPeriods]);
  const baselines = baselineRes.rows as { period: string; report: string; location: string; key: string; qty: number | null; value: number }[];

  // Compute sales for each reference period
  const salesByPeriod = new Map<string, SalesResult>();
  for (const period of refPeriods) {
    try {
      const result = await computeSalesForPeriod(pg, period, poByMbId, poByNameNorm, poByCatId);
      salesByPeriod.set(period, result);
    } catch (err) {
      errors.push(`Sales computation failed for ${period}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Evaluate references
  for (const ref of refs) {
    const result = salesByPeriod.get(ref.period);
    if (!result) continue;

    if (ref.metric === "sales_total") {
      const actual = Math.round(result.rows.reduce((s, r) => s + r.revenue, 0) * 100) / 100;
      const diff = Math.round((actual - ref.value) * 100) / 100;
      if (Math.abs(diff) < 0.01) continue; // OK

      // Check provisional
      const growth = diff;
      if (growth > 0.005 && growth <= result.unallocatedAmount + 0.005) {
        // Provisional — collect FIFO details with debit dates
        const { end: pEnd } = periodToRange(ref.period);
        const allFifo: { client: string; date: string; amount: number }[] = [];
        for (const [ctKey, ct] of result.clientTariffBreakdown) {
          const clientId = ctKey.split("|")[0];
          for (const d of ct.details) {
            if (d.rule !== "fifo") continue;
            const debitDate = d.debitDate || d.saleDate;
            allFifo.push({ client: clientId, date: debitDate, amount: Math.round(d.amount * 100) / 100 });
          }
        }
        // Growth-causing FIFO: debits spent AFTER the period
        const newFifoDetails = allFifo.filter((d) => d.date > pEnd);
        const newFifoTotal = newFifoDetails.reduce((s, d) => s + d.amount, 0);
        if (Math.abs(newFifoTotal - growth) < 0.01) {
          // Auto-confirmed!
          const explanation = `Auto-confirmed: ${newFifoDetails.map((d) => `deposit spent by ${d.client}, ${d.date}, ${d.amount.toFixed(2)}`).join("; ")}`;
          autoConfirmed.push({
            period: ref.period, checkType: "reference", checkKey: `${ref.metric}|${ref.location}`,
            originalExpected: ref.value, actualValue: actual, diff: growth,
            explanation, fifoDetails: newFifoDetails,
          });
          await pg.query("UPDATE reconciliation_references SET value = $1 WHERE period = $2 AND metric = $3 AND location = $4", [actual, ref.period, ref.metric, ref.location]);
          await pg.query(
            "INSERT INTO reconciliation_auto_confirm_log (period, check_type, check_key, original_expected, actual_value, diff, explanation, fifo_details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [ref.period, "reference", `${ref.metric}|${ref.location}`, ref.value, actual, growth, explanation, JSON.stringify(newFifoDetails)],
          );
        } else {
          provisionalMismatches++;
          allOk = false;
        }
      } else {
        allOk = false;
      }
    }
  }

  // Collect debug info for cases
  const caseDebug: Record<string, unknown>[] = [];

  // Evaluate cases
  for (const c of cases) {
    const result = salesByPeriod.get(c.period);
    if (!result) continue;
    if (!c.tariff_name || !c.client_id) continue;

    const ctKey = `${c.client_id}|${c.tariff_name}`;
    const ct = result.clientTariffBreakdown.get(ctKey);
    const actualValue = ct ? Math.round(ct.revenue * 100) / 100 : 0;
    const actualQty = ct ? ct.qty : 0;
    const expected = c.expected_value != null ? c.expected_value : 0;
    const tol = c.tolerance != null ? c.tolerance : 0.005;

    const fifoDetails = ct?.details.filter((d) => d.rule === "fifo").map((d) => ({
      client: c.client_id!, date: d.debitDate || d.saleDate, amount: Math.round(d.amount * 100) / 100,
      creditDate: d.saleDate,
    })) || [];
    const totalFifo = fifoDetails.reduce((s, d) => s + d.amount, 0);
    // Growth-causing FIFO: debits spent AFTER the period (e.g., October spending matched to September deposit)
    const { start: pStart, end: pEnd } = periodToRange(c.period);
    const newFifoDetails = fifoDetails.filter((d) => d.date > pEnd);
    const newFifoTotal = newFifoDetails.reduce((s, d) => s + d.amount, 0);

    caseDebug.push({
      case: c.case_number, client: c.client_id, tariff: c.tariff_name,
      expected, actual: actualValue, growth: actualValue - expected,
      unallocated: result.unallocatedAmount, fifoCount: fifoDetails.length,
      totalFifo, newFifoTotal, newFifoDetails,
      fifoDetails,
      ctExists: !!ct, ctDetailsCount: ct?.details.length || 0,
    });

    if (Math.abs(actualValue - expected) <= tol + 0.001) continue; // OK

    const growth = actualValue - expected;
    if (growth > 0.005 && growth <= result.unallocatedAmount + 0.005) {
      if (Math.abs(newFifoTotal - growth) < 0.01) {
        // Auto-confirmed!
        const explanation = `Auto-confirmed: ${newFifoDetails.map((d) => `deposit spent by ${d.client}, ${d.date}, ${d.amount.toFixed(2)}`).join("; ")}`;
        autoConfirmed.push({
          period: c.period, checkType: "case", checkKey: `case_${c.case_number}`,
          originalExpected: expected, actualValue, diff: growth,
          explanation, fifoDetails: newFifoDetails.map((d) => ({ client: d.client, date: d.date, amount: d.amount })),
        });
        await pg.query("UPDATE reconciliation_cases SET expected_value = $1 WHERE case_number = $2", [actualValue, c.case_number]);
        await pg.query(
          "INSERT INTO reconciliation_auto_confirm_log (period, check_type, check_key, original_expected, actual_value, diff, explanation, fifo_details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [c.period, "case", `case_${c.case_number}`, expected, actualValue, growth, explanation, JSON.stringify(newFifoDetails.map((d) => ({ client: d.client, date: d.date, amount: d.amount })))],
        );
      } else {
        provisionalMismatches++;
        allOk = false;
      }
    } else {
      allOk = false;
    }
  }

  // Check unknown payment types
  const knownTypes = ["Visa/MC", "AMEX", "Check", "Cash", "Prepaid Gift Card", "Account", "Comp/Guest", "Other"];
  const unknownPayRes = await pg.query(
    `SELECT type, count(*) as cnt, sum(amount::numeric) as total FROM payments WHERE type IS NOT NULL AND type NOT IN ('${knownTypes.join("','")}') GROUP BY type`,
  );
  if (unknownPayRes.rows.length > 0) allOk = false;

  // Update reconciliation status
  await pg.query(
    "INSERT INTO reconciliation_status (id, checked_at, all_ok, error_count) VALUES (1, $1, $2, 0) ON CONFLICT (id) DO UPDATE SET checked_at = $1, all_ok = $2, error_count = 0",
    [new Date().toISOString(), allOk],
  );

  // Save baseline snapshot if all green
  let snapshotSaved = false;
  let snapshotMessage: string | null = null;
  if (allOk && errors.length === 0) {
    try {
      // Save sales_by_tariff baseline for each reference period
      let totalRows = 0;
      for (const period of refPeriods) {
        const result = salesByPeriod.get(period);
        if (!result) continue;
        for (const row of result.rows) {
          const val = Math.round(row.revenue * 100) / 100;
          await pg.query(
            "INSERT INTO reconciliation_baseline (period, report, location, key, qty, value) VALUES ($1, 'sales_by_tariff', 'all', $2, $3, $4) ON CONFLICT (period, report, location, key) DO UPDATE SET qty = $3, value = $4",
            [period, row.pricingOptionName, row.qtySold, val],
          );
          totalRows++;
        }
      }
      snapshotSaved = true;
      snapshotMessage = `Baseline saved: ${totalRows} rows across ${refPeriods.length} periods`;
    } catch (err) {
      snapshotMessage = `Snapshot save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return { allOk, checkedAt: new Date().toISOString(), provisionalMismatches, autoConfirmed, errors, snapshotSaved, snapshotMessage, caseDebug } as ReconResult & { caseDebug: unknown[] };
}

// ===== Edge function handler =====

async function runBackgroundCore(sendTestEmail: boolean, runId: string): Promise<ReconResult & { emailSent: boolean; emailError: string | null }> {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Insert sync log
  const { data: logRow } = await supabase.from("sync_logs").insert({
    sync_type: "reconciliation_nightly", status: "started", started_at: new Date().toISOString(),
    run_id: runId, run_type: "nightly",
  }).select("id").maybeSingle();
  const logId = logRow?.id;
  const finishLog = async (fields: Record<string, unknown>) => {
    if (!logId) return;
    await supabase.from("sync_logs").update({ completed_at: new Date().toISOString(), ...fields }).eq("id", logId);
  };

  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) throw new Error("SUPABASE_DB_URL not available");

    const pgClient = new postgres.Client({ connectionString: dbUrl });
    await pgClient.connect();

    let result: ReconResult;
    try {
      result = await runReconciliation(pgClient);
    } finally {
      await pgClient.end();
    }

    // Email notifications
    const { data: notifData } = await supabase.from("notification_settings")
      .select("email_recipients, notify_red_reconciliation, notify_sync_errors, notify_data_issues")
      .eq("id", 1).maybeSingle();
    const notif = notifData as { email_recipients: string; notify_red_reconciliation: boolean; notify_sync_errors: boolean; notify_data_issues: boolean } | null;

    let emailSent = false;
    let emailError: string | null = null;
    const emailSections: string[] = [];

    if (notif?.notify_red_reconciliation && !result.allOk && result.errors.length === 0) {
      emailSections.push(
        `Reconciliation check found issues (${result.checkedAt}).`,
        `Provisional mismatches: ${result.provisionalMismatches}`,
        `Auto-confirmed: ${result.autoConfirmed.length}`,
        "",
        "Auto-confirmed entries:",
        ...result.autoConfirmed.map((e) => `  - ${e.period} ${e.checkType}: +${e.diff.toFixed(2)} — ${e.explanation}`),
        "",
        "Please check the Reconciliation page in the app for details.",
      );
    }

    if (notif?.notify_sync_errors) {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { data: failedSyncs } = await supabase.from("sync_logs")
        .select("sync_type, error_message, completed_at")
        .eq("status", "error").gte("completed_at", yesterday)
        .order("completed_at", { ascending: false }).limit(10);
      if (failedSyncs && failedSyncs.length > 0) {
        emailSections.push("", "Recent sync errors:");
        for (const s of failedSyncs) emailSections.push(`  - ${s.sync_type}: ${(s.error_message || "").slice(0, 200)} (${s.completed_at})`);
      }
    }

    if (notif?.email_recipients) {
      if (emailSections.length > 0 || sendTestEmail) {
        const subject = sendTestEmail ? "Reconciliation test email" : "Mindbody Reconciliation Alert";
        const body = sendTestEmail
          ? `This is a test email from the reconciliation system.\n\nRecipients: ${notif.email_recipients}\nTime: ${new Date().toISOString()}`
          : emailSections.join("\n");
        const er = await sendEmailViaResend(notif.email_recipients, subject, body);
        emailSent = er.sent;
        emailError = er.error;
      }
    }

    await finishLog({
      status: result.errors.length > 0 ? "error" : "completed",
      records_synced: result.autoConfirmed.length,
      raw_response: { ...result, emailSent, emailError },
      error_message: result.errors.length > 0 ? result.errors.join("; ").slice(0, 2000) : null,
    });

    console.log("reconciliation-nightly completed", JSON.stringify({ allOk: result.allOk, autoConfirmed: result.autoConfirmed.length, snapshotSaved: result.snapshotSaved, emailSent }));
    return { ...result, emailSent, emailError };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("reconciliation-nightly failed", msg);
    await finishLog({ status: "error", error_message: msg.slice(0, 2000) });
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!await isAuthorized(req)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sendTestEmail = body.testEmail === true;
    const runId = typeof body.runId === "string" ? body.runId : crypto.randomUUID();
    const wait = body.wait === true;

    if (wait) {
      const result = await runBackgroundCore(sendTestEmail, runId);
      return json({ success: true, started: false, runId, result });
    }

    const task = runBackgroundCore(sendTestEmail, runId)
      .then(() => console.log("reconciliation-nightly background done"))
      .catch((e: Error) => console.error("reconciliation-nightly background error", e.message));
    (globalThis as Record<string, unknown>).EdgeRuntime?.waitUntil?.(task);
    return json({ success: true, started: true, runId });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
