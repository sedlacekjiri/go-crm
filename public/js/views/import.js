// Import a Caren booking export (CSV / Excel): map columns, preview, convert to EUR/ISK, upload.
import { emptyBox, miniKpi, pageHeader } from '../components.js';
import { buildSales, codeKey, convert, guessMapping, IMPORT_FIELDS, partnerByCode } from '../lib.js';
import { api, clearSalesCache, fetchDailyRates, isAdmin, loadData, state } from '../store.js';
import { esc, money, options, shortDate, storage, toast } from '../util.js';

const PAPA = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';
const XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

let sheet = null; // { name, headers, rows }
let mapping = {};
let opts = { dateFormat: 'auto', defaultCurrency: 'EUR', brandMode: 'column' };
let result = null;

const mappingKey = (headers) => `go-crm-import:${headers.join('|')}`;

async function readFile(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const X = await import(XLSX);
    const wb = X.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = X.utils.sheet_to_json(ws, { defval: '', raw: true });
    const headers = (X.utils.sheet_to_json(ws, { header: 1 })[0] ?? []).map(String);
    return { name: file.name, headers, rows };
  }
  const { default: Papa } = await import(PAPA);
  const parsed = Papa.parse((await file.text()).replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' });
  return { name: file.name, headers: parsed.meta.fields ?? [], rows: parsed.data };
}

export function render(page, ctx) {
  if (!isAdmin()) {
    page.innerHTML = emptyBox('View only', 'Only the admin can import sales.');
    return;
  }
  const parsed = sheet ? buildSales(sheet.rows, mapping, opts) : null;
  const missing = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  page.innerHTML = `
    <a class="back" href="#/sales">← Sales</a>
    ${pageHeader('Import bookings', 'CSV or Excel export from booking.caren.is')}
    <section class="card">
      <div class="card-head"><h2>1 · Choose file</h2></div>
      <p class="steps" style="margin-bottom:12px">In Caren, open the bookings list, filter the period and export it (CSV or Excel).
        Importing the same bookings again is safe – they're matched by booking number and updated, never duplicated.</p>
      <label class="drop"><b>${sheet ? esc(sheet.name) : 'Tap to choose a file'}</b><span>${sheet ? `${sheet.rows.length} rows · ${sheet.headers.length} columns` : '.csv, .xlsx, .xls'}</span>
        <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods" hidden data-file /></label>
    </section>
    ${sheet ? mappingCard() : ''}
    ${sheet ? previewCard(parsed, missing) : ''}`;

  page.querySelector('[data-file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      sheet = await readFile(file);
      if (!sheet.rows.length) throw new Error('The file has no rows.');
      const saved = JSON.parse(storage.get(mappingKey(sheet.headers)) || 'null');
      mapping = saved?.mapping ?? guessMapping(sheet.headers);
      if (saved?.opts) opts = saved.opts;
      result = null;
    } catch (err) {
      sheet = null;
      toast(err.message, 'error');
    }
    render(page, ctx);
  });
  page.querySelectorAll('[data-map]').forEach((sel) =>
    sel.addEventListener('change', () => {
      mapping = { ...mapping, [sel.dataset.map]: sel.value || undefined };
      result = null;
      render(page, ctx);
    })
  );
  page.querySelectorAll('[data-opt]').forEach((sel) =>
    sel.addEventListener('change', () => {
      opts = { ...opts, [sel.dataset.opt]: sel.value };
      result = null;
      render(page, ctx);
    })
  );
  page.querySelector('[data-import]')?.addEventListener('click', (e) => runImport(e.target, parsed, page, ctx));
}

function mappingCard() {
  return `<section class="card">
    <div class="card-head"><h2>2 · Match columns</h2></div>
    <p class="muted" style="margin-bottom:12px">Guessed from the column names – check them. Your choice is remembered for this export layout.</p>
    <div class="form-grid three">
      ${IMPORT_FIELDS.map(
        (f) => `<label class="field"><span>${f.label}${f.required ? ' *' : ''}</span>
          <select class="input" data-map="${f.key}" ${f.required && !mapping[f.key] ? 'style="border-color:var(--bad)"' : ''}>${options(sheet.headers, mapping[f.key], { empty: '– not in file –' })}</select></label>`
      ).join('')}
    </div>
    <div class="form-grid three" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <label class="field"><span>Date format</span><select class="input" data-opt="dateFormat">${options(
        [
          { value: 'auto', label: 'Automatic (day first)' },
          { value: 'dmy', label: 'DD.MM.YYYY' },
          { value: 'mdy', label: 'MM/DD/YYYY' },
          { value: 'ymd', label: 'YYYY-MM-DD' },
        ],
        opts.dateFormat
      )}</select></label>
      <label class="field"><span>Currency if not in file</span><select class="input" data-opt="defaultCurrency">${options(['EUR', 'ISK', 'USD', 'GBP'], opts.defaultCurrency)}</select></label>
      <label class="field"><span>Brand</span><select class="input" data-opt="brandMode">${options(
        [
          { value: 'column', label: 'Detect from column' },
          { value: 'car', label: 'Whole file is Go Car Rentals' },
          { value: 'camper', label: 'Whole file is Go Campers' },
        ],
        opts.brandMode
      )}</select>${opts.brandMode === 'column' ? '<small>“camp” in brand / vehicle → Go Campers, otherwise Go Car Rentals</small>' : ''}</label>
    </div>
  </section>`;
}

function previewCard(parsed, missing) {
  if (missing.length) {
    return `<section class="card"><div class="card-head"><h2>3 · Check &amp; import</h2></div>
      <div class="banner error-banner">Choose a column for: ${missing.map((f) => esc(f.label)).join(', ')}</div></section>`;
  }
  const { sales, errors } = parsed;
  const byCode = partnerByCode(state.partners);
  const codes = new Map();
  for (const s of sales) {
    if (!s.affiliate_code) continue;
    const k = codeKey(s.affiliate_code);
    const c = codes.get(k) ?? { code: s.affiliate_code, n: 0, matched: byCode.has(k) };
    c.n++;
    codes.set(k, c);
  }
  const dates = sales.map((s) => s.booking_date).sort();
  const amount = (s) => (s.currency === 'EUR' || s.currency === 'ISK' ? money(s.amount, s.currency) : `${s.amount} ${esc(s.currency)}`);

  return `<section class="card">
    <div class="card-head"><h2>3 · Check &amp; import</h2></div>
    <div class="mini-kpis">
      ${miniKpi('Bookings ready', sales.length, dates.length ? `${shortDate(dates[0])} – ${shortDate(dates.at(-1))}` : '')}
      ${miniKpi('Rows with errors', errors.length, 'skipped')}
      ${miniKpi('Cancelled', sales.filter((s) => s.is_cancelled).length, 'kept, not counted')}
      ${miniKpi('Go Campers', sales.filter((s) => s.brand === 'camper').length, `of ${sales.length}`)}
    </div>
    ${
      codes.size
        ? `<p class="small" style="margin:14px 0 6px;color:var(--text-2)">Affiliate codes in the file (✓ = matches a partner)</p>
           <div class="code-chips">${[...codes.values()]
             .sort((a, b) => b.n - a.n)
             .slice(0, 40)
             .map((c) => `<span class="${c.matched ? 'ok' : ''}">${c.matched ? '✓ ' : ''}<span class="mono">${esc(c.code)}</span> · ${c.n}</span>`)
             .join('')}</div>
           <p class="muted small" style="margin-top:6px">Unmatched codes are imported too and link up as soon as you add the code to a partner.</p>`
        : ''
    }
    ${
      errors.length
        ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--bad)">${errors.length} rows can't be read</summary>
           <ul class="small muted" style="margin:6px 0 0 18px;max-height:160px;overflow:auto">${errors
             .slice(0, 100)
             .map((e) => `<li>Row ${e.row}: ${esc(e.message)}</li>`)
             .join('')}</ul></details>`
        : ''
    }
    <div class="table-wrap" style="margin-top:14px"><table class="num">
      <thead><tr><th>Ref</th><th>Booked</th><th class="opt">Pickup</th><th>Brand</th><th class="opt">Affiliate</th><th class="r">Amount</th></tr></thead>
      <tbody>${sales
        .slice(0, 8)
        .map(
          (s) => `<tr class="${s.is_cancelled ? 'cancelled' : ''}"><td class="mono">${esc(s.booking_ref)}</td><td class="nowrap">${shortDate(s.booking_date)}</td>
            <td class="opt nowrap">${shortDate(s.pickup_date)}</td><td>${s.brand === 'camper' ? 'Campers' : s.brand === 'car' ? 'Cars' : '–'}</td>
            <td class="opt">${esc(s.affiliate_code ?? '–')}</td><td class="r nowrap">${amount(s)}</td></tr>`
        )
        .join('')}</tbody>
    </table></div>
    <p class="muted small" style="margin-top:6px">First 8 rows. Amounts are converted to EUR and ISK with the ECB rate of each booking date.</p>
    ${
      result
        ? `<div class="banner" style="margin:14px 0 0;background:var(--good-soft);color:var(--good);border-color:transparent">✓ Imported ${result.count} bookings (${shortDate(result.from)} – ${shortDate(result.to)}). <a class="link-btn" href="#/sales">Open sales →</a></div>`
        : `<button class="btn" style="margin-top:14px" data-import ${sales.length ? '' : 'disabled'}>Import ${sales.length} bookings</button>`
    }
  </section>`;
}

async function runImport(button, parsed, page, ctx) {
  const { sales } = parsed;
  const dates = sales.map((s) => s.booking_date).sort();
  button.disabled = true;
  button.textContent = 'Importing…';
  try {
    const rates = await fetchDailyRates(dates[0], dates.at(-1), [...new Set(sales.map((s) => s.currency))]);
    const rows = sales.map((s) => ({ ...s, ...convert(s.amount, s.currency, s.booking_date, rates) }));
    for (let i = 0; i < rows.length; i += 500) {
      button.textContent = `Importing… ${Math.min(i + 500, rows.length)} / ${rows.length}`;
      await api('/api/sales', { method: 'POST', body: { rows: rows.slice(i, i + 500) } });
    }
    storage.set(mappingKey(sheet.headers), JSON.stringify({ mapping, opts }));
    clearSalesCache();
    await loadData();
    result = { count: rows.length, from: dates[0], to: dates.at(-1) };
    toast(`Imported ${rows.length} bookings`);
    render(page, ctx);
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = `Import ${sales.length} bookings`;
  }
}
